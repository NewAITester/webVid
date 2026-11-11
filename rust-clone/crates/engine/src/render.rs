//! Software renderer: project -> RGBA8 frame, pure Rust (no GPU).
//!
//! Pipeline per frame: fill the background, then for each visible layer
//! (bottom first) render it into its own transparent buffer, apply its
//! effects (via the registry dispatch, with keyframe-animated params),
//! and composite it over the stage with the layer opacity.
//!
//! Shapes use signed-distance functions with a 1px antialiasing band;
//! text is rasterized with fontdue from the shaped (presentation-form)
//! Persian text, so it comes out joined; draw strokes are thick
//! polylines. Camera zoom scales the whole view about the stage centre.
//!
//! Honest gaps in this version: image/video layers are decoded by the
//! app (the renderer looks them up by `src`); text alignment other
//! than center uses anchor semantics (`start` = the layer anchor is
//! the left edge); group transforms are not composed into children.
//! Masks (`clip` below/belowInv) and blend modes (multiply, screen,
//! overlay, add, darken, lighten, difference) are implemented.

use crate::evaluate;
use crate::model::{Layer, Project};
use crate::registry;
use crate::shape::shape_persian;

pub struct Renderer {
    font: fontdue::Font,
}

/// A decoded image, ready to blit (RGBA8). Decoded by the app from the
/// bytes it reads (MediaStore/ContentResolver) via `decode_image`.
#[derive(Clone)]
pub struct ImageData {
    pub width: usize,
    pub height: usize,
    pub rgba: Vec<u8>,
}

/// Decode JPEG/PNG/WebP bytes into RGBA8. Pure Rust (`image` crate).
pub fn decode_image(bytes: &[u8]) -> Result<ImageData, String> {
    decode_image_capped(bytes, usize::MAX)
}

/// Like `decode_image`, but downscale (Triangle filter) when the width
/// exceeds `max_w`, so a 12MP photo cannot blow up the cache or the
/// renderer. `max_w == usize::MAX` means no cap.
pub fn decode_image_capped(bytes: &[u8], max_w: usize) -> Result<ImageData, String> {
    let img = image::load_from_memory(bytes).map_err(|e| format!("decode: {e}"))?;
    let rgba = img.to_rgba8();
    let data = ImageData {
        width: rgba.width() as usize,
        height: rgba.height() as usize,
        rgba: rgba.into_raw(),
    };
    Ok(downscale_rgba(data, max_w))
}

/// Downscale an RGBA image (Triangle filter) when its width exceeds
/// `max_w`; a no-op otherwise. Used for decoded video frames too.
pub fn downscale_rgba(img: ImageData, max_w: usize) -> ImageData {
    if img.width <= max_w {
        return img;
    }
    let h = (max_w * img.height / img.width).max(1);
    let rgba = image::RgbaImage::from_raw(img.width as u32, img.height as u32, img.rgba)
        .expect("ImageData has w*h*4 bytes");
    let small = image::imageops::resize(&rgba, max_w as u32, h as u32, image::imageops::FilterType::Triangle);
    ImageData {
        width: small.width() as usize,
        height: small.height() as usize,
        rgba: small.into_raw(),
    }
}

/// YUV420 layout of a decoder output buffer.
#[derive(Clone, Copy, PartialEq)]
pub enum YuvFormat {
    /// Y plane + interleaved UV (COLOR_FormatYUV420SemiPlanar, 21).
    Nv12,
    /// Y plane + U plane + V plane (COLOR_FormatYUV420Planar, 19).
    I420,
}

/// Convert decoder YUV420 (BT.601 limited range) to RGBA8. `stride` is
/// the Y-plane row stride (may exceed `w` on hardware decoders);
/// `slice_h` is the Y-plane height (`h` when the format omits it).
/// The chroma planes use half the stride/height. Out-of-range samples
/// clamp; the alpha channel is always 255.
pub fn yuv_to_rgba(
    yuv: &[u8],
    w: usize,
    h: usize,
    stride: usize,
    slice_h: usize,
    format: YuvFormat,
) -> Vec<u8> {
    let y_size = stride * slice_h;
    let uv_stride = stride / 2;
    let mut out = vec![0u8; w * h * 4];
    let px = |y: i32, u: i32, v: i32| -> (u8, u8, u8) {
        let c = y - 16;
        let d = u - 128;
        let e = v - 128;
        let r = (298 * c + 409 * e + 128) >> 8;
        let g = (298 * c - 100 * d - 208 * e + 128) >> 8;
        let b = (298 * c + 516 * d + 128) >> 8;
        (
            r.clamp(0, 255) as u8,
            g.clamp(0, 255) as u8,
            b.clamp(0, 255) as u8,
        )
    };
    for row in 0..h {
        for col in 0..w {
            let y = yuv[row * stride + col] as i32;
            let (u, v) = match format {
                YuvFormat::Nv12 => {
                    let o = y_size + (row / 2) * stride + (col / 2) * 2;
                    (yuv[o] as i32, yuv[o + 1] as i32)
                }
                YuvFormat::I420 => {
                    let uv_size = uv_stride * (slice_h / 2);
                    let o = (row / 2) * uv_stride + col / 2;
                    (
                        yuv[y_size + o] as i32,
                        yuv[y_size + uv_size + o] as i32,
                    )
                }
            };
            let (r, g, b) = px(y, u, v);
            let i = (row * w + col) * 4;
            out[i] = r;
            out[i + 1] = g;
            out[i + 2] = b;
            out[i + 3] = 255;
        }
    }
    out
}

/// Pixel-space scale + camera zoom, for mapping project coords to pixels.
struct View {
    /// pixels per project unit (x)
    sx: f64,
    /// pixels per project unit (y)
    sy: f64,
    zoom: f64,
    w: f64,
    h: f64,
    pcx: f64,
    pcy: f64,
}

impl View {
    fn x(&self, px: f64) -> f64 {
        self.w / 2.0 + (px - self.pcx) * self.sx * self.zoom
    }
    fn y(&self, py: f64) -> f64 {
        self.h / 2.0 + (py - self.pcy) * self.sy * self.zoom
    }
    fn dx(&self, d: f64) -> f64 {
        d * self.sx * self.zoom
    }
    fn dy(&self, d: f64) -> f64 {
        d * self.sy * self.zoom
    }
}

impl Renderer {
    pub fn new(font_bytes: &[u8]) -> Result<Self, &'static str> {
        let font = fontdue::Font::from_bytes(font_bytes, fontdue::FontSettings::default())
            .map_err(|_| "could not parse font")?;
        Ok(Self { font })
    }

    /// Render the frame at time `t` (seconds) as RGBA8, `w * h * 4` bytes.
    /// `w`/`h` should match the project's aspect ratio (the caller fits
    /// the widget to it); otherwise the image stretches to fit. `images`
    /// maps layer `src` URIs to decoded image data (empty = no image
    /// layers render).
    pub fn render(
        &self,
        project: &Project,
        t: f64,
        w: usize,
        h: usize,
        images: &std::collections::HashMap<String, ImageData>,
    ) -> Vec<u8> {
        let mut frame = vec![0u8; w * h * 4];
        if w == 0 || h == 0 {
            return frame;
        }
        let (r, g, b) = rgb(registry::parse_hex_rgb(&project.bg));
        for px in frame.chunks_exact_mut(4) {
            px[0] = r;
            px[1] = g;
            px[2] = b;
            px[3] = 255;
        }
        let zoom = self.camera_zoom(project, t);
        let view = View {
            sx: w as f64 / project.width as f64,
            sy: h as f64 / project.height as f64,
            zoom,
            w: w as f64,
            h: h as f64,
            pcx: project.width as f64 / 2.0,
            pcy: project.height as f64 / 2.0,
        };
        let layers = evaluate::visible_layers(project, t);
        self.render_layers(&layers, project, t, &mut frame, w, h, &view, images);
        frame
    }

    fn camera_zoom(&self, project: &Project, t: f64) -> f64 {
        for l in evaluate::visible_layers(project, t) {
            if l.type_ == "camera" {
                return evaluate::camera_zoom_at(l, t);
            }
        }
        1.0
    }

    /// Render a list of layers (bottom first) into `dst`, applying each
    /// layer's effects, opacity and blend mode as it goes.
    ///
    /// Masks (`clip`): a layer with `clip` "below"/"belowInv" is not
    /// drawn itself; instead its rendered alpha (scaled by its own
    /// opacity) clips the layer directly below it in the stack. The
    /// pending layer is held back one step so the mask can apply to it
    /// before it is composited.
    fn render_layers(
        &self,
        layers: &[&Layer],
        project: &Project,
        t: f64,
        dst: &mut [u8],
        w: usize,
        h: usize,
        view: &View,
        images: &std::collections::HashMap<String, ImageData>,
    ) {
        let mut pending: Option<(Vec<u8>, f64, String)> = None;
        for layer in layers {
            let mut lbuf = vec![0u8; w * h * 4];
            self.render_layer_into(layer, project, t, &mut lbuf, w, h, view, images);
            // Effects, with keyframe-animated numeric params.
            for fx in &layer.effects {
                if !fx.enabled {
                    continue;
                }
                let params = evaluate::effect_params_at(fx, t - layer.start);
                registry::apply_effect(
                    &fx.id,
                    &mut lbuf,
                    w,
                    h,
                    &params,
                    &fx.text_params,
                    t - layer.start,
                );
            }
            let opacity = evaluate::layer_opacity(layer, t);
            if layer.clip == "below" || layer.clip == "belowInv" {
                let invert = layer.clip == "belowInv";
                if let Some((mut pbuf, pop, pblend)) = pending.take() {
                    for (i, px) in pbuf.chunks_exact_mut(4).enumerate() {
                        let m = lbuf[i * 4 + 3] as f64 / 255.0 * opacity;
                        let f = if invert { 1.0 - m } else { m };
                        px[3] = (px[3] as f64 * f).round() as u8;
                    }
                    composite(dst, &pbuf, pop, &pblend);
                }
                // The mask layer itself is not drawn.
                continue;
            }
            if let Some((pbuf, pop, pblend)) = pending.take() {
                composite(dst, &pbuf, pop, &pblend);
            }
            pending = Some((lbuf, opacity, layer.blend.clone()));
        }
        if let Some((pbuf, pop, pblend)) = pending.take() {
            composite(dst, &pbuf, pop, &pblend);
        }
    }

    /// Draw one layer's own content into a transparent buffer.
    fn render_layer_into(
        &self,
        layer: &Layer,
        project: &Project,
        t: f64,
        buf: &mut [u8],
        w: usize,
        h: usize,
        view: &View,
        images: &std::collections::HashMap<String, ImageData>,
    ) {
        match layer.type_.as_str() {
            "shape" => {
                if let Some(sh) = &layer.shape {
                    self.raster_shape(layer, sh, t, buf, w, h, view);
                }
            }
            "text" => {
                if let Some(tx) = &layer.text {
                    self.raster_text(layer, tx, t, buf, w, h, view);
                }
            }
            "draw" => self.raster_strokes(layer, t, buf, w, h, view),
            "group" => {
                let kids: Vec<&Layer> = layer
                    .children
                    .iter()
                    .filter(|c| evaluate::is_active(c, t))
                    .collect();
                self.render_layers(&kids, project, t, buf, w, h, view, images);
            }
            "image" | "video" => {
                // Decoded image / video frame looked up by the layer's src
                // URI; a missing entry (not loaded yet, or the file is
                // gone) draws nothing. The app fills the map: images on
                // insert, video frames per playhead.
                if let Some(src) = layer.src.as_deref() {
                    if let Some(img) = images.get(src) {
                        self.raster_image(layer, img, t, buf, w, h, view);
                    }
                }
            }
            // video: frame decoding is not built yet. camera / null / audio:
            // nothing to draw into the frame.
            _ => {}
        }
    }

    fn raster_shape(
        &self,
        layer: &Layer,
        sh: &crate::model::ShapeSpec,
        t: f64,
        buf: &mut [u8],
        w: usize,
        h: usize,
        view: &View,
    ) {
        let tr = evaluate::layer_transform(layer, t);
        let cx = view.x(tr.x);
        let cy = view.y(tr.y);
        let hwx = (sh.w / 2.0 * tr.scale_x).max(0.0);
        let hhy = (sh.h / 2.0 * tr.scale_y).max(0.0);
        // Half extents in pixels.
        let hwx = view.dx(hwx);
        let hhy = view.dy(hhy);
        if hwx <= 0.0 || hhy <= 0.0 {
            return;
        }
        let rot = (tr.rotation as f32).to_radians();
        let (sn, cs) = (rot.sin() as f64, rot.cos() as f64);
        let (fr, fg, fb) = sh
            .fill
            .as_deref()
            .map(|s| rgb(registry::parse_hex_rgb(s)))
            .unwrap_or((241, 101, 134));
        // Rotated bbox for the iteration window.
        let corners = [
            rot2(-hwx, -hhy, sn, cs),
            rot2(hwx, -hhy, sn, cs),
            rot2(hwx, hhy, sn, cs),
            rot2(-hwx, hhy, sn, cs),
        ];
        let bx0 = corners.iter().map(|p| p.0).fold(f64::INFINITY, f64::min) - 2.0;
        let bx1 = corners.iter().map(|p| p.0).fold(f64::NEG_INFINITY, f64::max) + 2.0;
        let by0 = corners.iter().map(|p| p.1).fold(f64::INFINITY, f64::min) - 2.0;
        let by1 = corners.iter().map(|p| p.1).fold(f64::NEG_INFINITY, f64::max) + 2.0;
        let x0 = (bx0 + cx).floor().max(0.0) as i32;
        let x1 = (bx1 + cx).ceil().min(w as f64 - 1.0) as i32;
        let y0 = (by0 + cy).floor().max(0.0) as i32;
        let y1 = (by1 + cy).ceil().min(h as f64 - 1.0) as i32;
        if x1 < x0 || y1 < y0 {
            return;
        }
        // Polygon vertices in pixel space (for triangle / star).
        let poly: Vec<(f64, f64)> = match sh.kind.as_str() {
            "triangle" => vec![
                (cx, cy - hhy),
                (cx - hwx, cy + hhy),
                (cx + hwx, cy + hhy),
            ]
            .into_iter()
            .map(|(x, y)| {
                let (rx, ry) = rot2(x - cx, y - cy, sn, cs);
                (cx + rx, cy + ry)
            })
            .collect(),
            "star" => star_verts(cx, cy, hwx.min(hhy), rot as f64),
            _ => vec![],
        };
        let sw_px = if sh.stroke_width > 0.0 {
            view.dx(sh.stroke_width)
        } else {
            0.0
        };
        let r = hwx.min(hhy);
        for y in y0..=y1 {
            for x in x0..=x1 {
                // Pixel centre, rotated back into the layer's local frame.
                let (lx, ly) = rot2(x as f64 + 0.5 - cx, y as f64 + 0.5 - cy, -sn, cs);
                let kind = sh.kind.as_str();
                let (fill_cov, stroke_cov) = match kind {
                    "circle" => {
                        let d = (lx * lx + ly * ly).sqrt();
                        let fc = clamp01(0.5 - (d - r));
                        let sc = if sw_px > 0.0 {
                            clamp01(0.5 - ((d - r).abs() - sw_px / 2.0))
                        } else {
                            0.0
                        };
                        (fc, sc)
                    }
                    "ring" => {
                        let d = (lx * lx + ly * ly).sqrt();
                        let sw = if sh.stroke_width > 0.0 {
                            sw_px
                        } else {
                            view.dy(sh.h * 0.08)
                        };
                        let fc = clamp01(0.5 - ((d - r).abs() - sw / 2.0));
                        (fc, 0.0)
                    }
                    "triangle" | "star" => {
                        let fc = polygon_coverage(x as f64 + 0.5, y as f64 + 0.5, &poly);
                        let sc = if sw_px > 0.0 {
                            clamp01(0.5 - (min_seg_dist(x as f64 + 0.5, y as f64 + 0.5, &poly) - sw_px / 2.0))
                        } else {
                            0.0
                        };
                        (fc, sc)
                    }
                    _ => {
                        // rect (and unknown kinds fall back to rect)
                        let dx = lx.abs() - hwx;
                        let dy = ly.abs() - hhy;
                        let ax = dx.max(0.0);
                        let ay = dy.max(0.0);
                        let sdf = (ax * ax + ay * ay).sqrt() + dx.max(dy).min(0.0);
                        let fc = clamp01(0.5 - sdf);
                        let sc = if sw_px > 0.0 {
                            // distance to the box outline
                            let ex = lx.abs() - hwx;
                            let ey = ly.abs() - hhy;
                            let edge = if ex > 0.0 || ey > 0.0 {
                                (ex.max(0.0).powi(2) + ey.max(0.0).powi(2)).sqrt()
                            } else {
                                (-ex).min(-ey)
                            };
                            clamp01(0.5 - (edge - sw_px / 2.0))
                        } else {
                            0.0
                        };
                        (fc, sc)
                    }
                };
                if fill_cov > 0.0 {
                    blend(buf, w, x, y, fr, fg, fb, fill_cov as f32);
                }
                if stroke_cov > 0.0 {
                    if let Some(st) = &sh.stroke {
                        let (sr, sg, sb) = rgb(registry::parse_hex_rgb(st));
                        blend(buf, w, x, y, sr, sg, sb, stroke_cov as f32);
                    }
                }
            }
        }
    }

    fn raster_text(
        &self,
        layer: &Layer,
        tx: &crate::model::TextSpec,
        t: f64,
        buf: &mut [u8],
        w: usize,
        h: usize,
        view: &View,
    ) {
        let tr = evaluate::layer_transform(layer, t);
        let cx = view.x(tr.x);
        let cy = view.y(tr.y);
        let size_px = (tx.size * view.sy * view.zoom * tr.scale_y).max(0.0) as f32;
        if size_px < 1.0 {
            return;
        }
        let (cr, cg, cb) = rgb(registry::parse_hex_rgb(&tx.color));
        let lm = match self.font.horizontal_line_metrics(size_px) {
            Some(m) => m,
            None => return,
        };
        let lh = if tx.line_height > 0.0 {
            (size_px as f64 * tx.line_height) as f32
        } else {
            lm.new_line_size
        };
        let lines: Vec<&str> = tx.content.split('\n').collect();
        let total_h = lh * lines.len() as f32;
        let mut baseline = cy as f32 - total_h / 2.0 + lm.ascent;
        for line in &lines {
            let shaped = shape_persian(line);
            let total_w: f32 = shaped
                .chars()
                .map(|c| self.font.metrics(c, size_px).advance_width)
                .sum();
            let mut pen_x = match tx.align.as_str() {
                "start" | "left" => cx as f32,
                "end" | "right" => cx as f32 - total_w,
                _ => cx as f32 - total_w / 2.0,
            };
            for ch in shaped.chars() {
                let (m, cov) = self.font.rasterize(ch, size_px);
                // Bitmap top-left in stage space.
                let gx0 = pen_x.round() as i32 + m.xmin;
                let gy0 = baseline.round() as i32 - (m.ymin + m.height as i32);
                for gy in 0..m.height as i32 {
                    let y = gy0 + gy;
                    if y < 0 || y as usize >= h {
                        continue;
                    }
                    for gx in 0..m.width as i32 {
                        let x = gx0 + gx;
                        if x < 0 || x as usize >= w {
                            continue;
                        }
                        let a = cov[gy as usize * m.width + gx as usize] as f32 / 255.0;
                        if a > 0.0 {
                            blend(buf, w, x, y, cr, cg, cb, a);
                        }
                    }
                }
                pen_x += m.advance_width;
            }
            baseline += lh;
        }
    }

    fn raster_strokes(
        &self,
        layer: &Layer,
        t: f64,
        buf: &mut [u8],
        w: usize,
        h: usize,
        view: &View,
    ) {
        let tr = evaluate::layer_transform(layer, t);
        let cx = view.x(tr.x);
        let cy = view.y(tr.y);
        let rot = (tr.rotation as f32).to_radians();
        let (sn, cs) = (rot.sin() as f64, rot.cos() as f64);
        for stroke in &layer.strokes {
            let (r, g, b) = rgb(registry::parse_hex_rgb(&stroke.color));
            let half = view.dx(stroke.width) / 2.0;
            if half <= 0.0 || stroke.points.len() < 2 {
                continue;
            }
            let pts: Vec<(f64, f64)> = stroke
                .points
                .iter()
                .map(|p| {
                    let (rx, ry) = rot2(p.x, p.y, sn, cs);
                    (cx + view.dx(rx), cy + view.dy(ry))
                })
                .collect();
            for seg in pts.windows(2) {
                let (x1, y1) = seg[0];
                let (x2, y2) = seg[1];
                let m = half + 1.5;
                let x0 = (x1.min(x2) - m).floor().max(0.0) as i32;
                let x1i = (x1.max(x2) + m).ceil().min(w as f64 - 1.0) as i32;
                let y0 = (y1.min(y2) - m).floor().max(0.0) as i32;
                let y1i = (y1.max(y2) + m).ceil().min(h as f64 - 1.0) as i32;
                for y in y0..=y1i {
                    for x in x0..=x1i {
                        let d = seg_dist(x as f64 + 0.5, y as f64 + 0.5, x1, y1, x2, y2);
                        let cov = clamp01(0.5 - (d - half));
                        if cov > 0.0 {
                            blend(buf, w, x, y, r, g, b, cov as f32);
                        }
                    }
                }
            }
        }
    }

    /// Blit a decoded image into the layer buffer, under the layer's
    /// transform (center, rotation, scale), sampling bilinearly. The
    /// display box is the layer's shape w/h when set, else the image's
    /// own size fitted to the project width.
    fn raster_image(
        &self,
        layer: &Layer,
        img: &ImageData,
        t: f64,
        buf: &mut [u8],
        w: usize,
        h: usize,
        view: &View,
    ) {
        let tr = evaluate::layer_transform(layer, t);
        let cx = view.x(tr.x);
        let cy = view.y(tr.y);
        let (bw, bh) = match &layer.shape {
            Some(sh) if sh.w > 0.0 && sh.h > 0.0 => (sh.w, sh.h),
            _ => {
                let fw = (img.width as f64).min(720.0);
                (fw, fw * img.height as f64 / img.width as f64)
            }
        };
        let hwx = view.dx(bw / 2.0 * tr.scale_x);
        let hhy = view.dy(bh / 2.0 * tr.scale_y);
        if hwx <= 0.0 || hhy <= 0.0 {
            return;
        }
        let rot = (tr.rotation as f32).to_radians();
        let (sn, cs) = (rot.sin() as f64, rot.cos() as f64);
        let corners = [
            rot2(-hwx, -hhy, sn, cs),
            rot2(hwx, -hhy, sn, cs),
            rot2(hwx, hhy, sn, cs),
            rot2(-hwx, hhy, sn, cs),
        ];
        let x0 = (corners.iter().map(|p| p.0).fold(f64::INFINITY, f64::min) + cx - 1.0)
            .floor()
            .max(0.0) as i32;
        let x1 = (corners.iter().map(|p| p.0).fold(f64::NEG_INFINITY, f64::max) + cx + 1.0)
            .ceil()
            .min(w as f64 - 1.0) as i32;
        let y0 = (corners.iter().map(|p| p.1).fold(f64::INFINITY, f64::min) + cy - 1.0)
            .floor()
            .max(0.0) as i32;
        let y1 = (corners.iter().map(|p| p.1).fold(f64::NEG_INFINITY, f64::max) + cy + 1.0)
            .ceil()
            .min(h as f64 - 1.0) as i32;
        if x1 < x0 || y1 < y0 {
            return;
        }
        for y in y0..=y1 {
            for x in x0..=x1 {
                let (lx, ly) = rot2(x as f64 + 0.5 - cx, y as f64 + 0.5 - cy, -sn, cs);
                // Box SDF for a 1px soft edge, same as rect shapes.
                let dx = lx.abs() - hwx;
                let dy = ly.abs() - hhy;
                let ax = dx.max(0.0);
                let ay = dy.max(0.0);
                let sdf = (ax * ax + ay * ay).sqrt() + dx.max(dy).min(0.0);
                let cov = clamp01(0.5 - sdf);
                if cov <= 0.0 {
                    continue;
                }
                let u = (lx + hwx) / (2.0 * hwx) * img.width as f64 - 0.5;
                let v = (ly + hhy) / (2.0 * hhy) * img.height as f64 - 0.5;
                let (r, g, b, a) = sample_bilinear(img, u, v);
                if a <= 0.0 {
                    continue;
                }
                blend(buf, w, x, y, r, g, b, (cov * a / 255.0) as f32);
            }
        }
    }
}

/// Bilinear sample of an RGBA image at (u, v) in pixel coords (top-left
/// origin, pixel centres at half-integers). Edges clamp. Returns
/// (r, g, b, a) with a in 0–255.
fn sample_bilinear(img: &ImageData, u: f64, v: f64) -> (u8, u8, u8, f64) {
    let x0 = u.floor().clamp(0.0, (img.width - 1) as f64) as usize;
    let y0 = v.floor().clamp(0.0, (img.height - 1) as f64) as usize;
    let x1 = (x0 + 1).min(img.width - 1);
    let y1 = (y0 + 1).min(img.height - 1);
    let fx = (u - u.floor()).clamp(0.0, 1.0);
    let fy = (v - v.floor()).clamp(0.0, 1.0);
    let at = |x: usize, y: usize| -> (f64, f64, f64, f64) {
        let i = (y * img.width + x) * 4;
        (
            img.rgba[i] as f64,
            img.rgba[i + 1] as f64,
            img.rgba[i + 2] as f64,
            img.rgba[i + 3] as f64,
        )
    };
    let (r00, g00, b00, a00) = at(x0, y0);
    let (r10, g10, b10, a10) = at(x1, y0);
    let (r01, g01, b01, a01) = at(x0, y1);
    let (r11, g11, b11, a11) = at(x1, y1);
    let lerp = |a: f64, b: f64, t: f64| a + (b - a) * t;
    let top = (
        lerp(r00, r10, fx),
        lerp(g00, g10, fx),
        lerp(b00, b10, fx),
        lerp(a00, a10, fx),
    );
    let bot = (
        lerp(r01, r11, fx),
        lerp(g01, g11, fx),
        lerp(b01, b11, fx),
        lerp(a01, a11, fx),
    );
    (
        lerp(top.0, bot.0, fy).round() as u8,
        lerp(top.1, bot.1, fy).round() as u8,
        lerp(top.2, bot.2, fy).round() as u8,
        lerp(top.3, bot.3, fy),
    )
}

/// Blend one color channel (0–255) by mode: source over destination.
fn blend_channel(mode: &str, s: f64, d: f64) -> f64 {
    match mode {
        "multiply" => s * d / 255.0,
        "screen" => 255.0 - (255.0 - s) * (255.0 - d) / 255.0,
        "overlay" => {
            if d < 128.0 {
                2.0 * s * d / 255.0
            } else {
                255.0 - 2.0 * (255.0 - s) * (255.0 - d) / 255.0
            }
        }
        "add" => (s + d).min(255.0),
        "darken" => s.min(d),
        "lighten" => s.max(d),
        "difference" => (s - d).abs(),
        _ => s, // "normal" and anything unknown
    }
}

/// Source-over composite of a whole buffer (`src`, straight alpha) onto
/// `dst` (also straight alpha), scaled by `opacity` 0–1 and blended by
/// `mode` ("normal" | "multiply" | "screen" | "overlay" | "add" |
/// "darken" | "lighten" | "difference"). The blend is computed between
/// the source and destination colors, then composited with the source
/// alpha (the same as SVG/CSS layer blending).
fn composite(dst: &mut [u8], src: &[u8], opacity: f64, mode: &str) {
    let op = opacity.clamp(0.0, 1.0);
    if op <= 0.0 {
        return;
    }
    for (d, s) in dst.chunks_exact_mut(4).zip(src.chunks_exact(4)) {
        let sa = s[3] as f64 / 255.0 * op;
        if sa <= 0.0 {
            continue;
        }
        let da = d[3] as f64 / 255.0;
        let out_a = sa + da * (1.0 - sa);
        if out_a <= 0.0 {
            d[3] = 0;
            continue;
        }
        for c in 0..3 {
            let b = blend_channel(mode, s[c] as f64, d[c] as f64);
            d[c] = ((b * sa + d[c] as f64 * da * (1.0 - sa)) / out_a).round() as u8;
        }
        d[3] = (out_a * 255.0).round() as u8;
    }
}

/// Source-over blend of one pixel (coverage 0–1) into a straight-alpha
/// buffer.
fn blend(buf: &mut [u8], w: usize, x: i32, y: i32, r: u8, g: u8, b: u8, a: f32) {
    if a <= 0.0 {
        return;
    }
    let h = buf.len() / (w * 4);
    if x < 0 || y < 0 || x as usize >= w || y as usize >= h {
        return;
    }
    let i = (y as usize * w + x as usize) * 4;
    let sa = a as f64;
    let da = buf[i + 3] as f64 / 255.0;
    let out_a = sa + da * (1.0 - sa);
    if out_a <= 0.0 {
        buf[i + 3] = 0;
        return;
    }
    let (sr, sg, sb) = (r as f64, g as f64, b as f64);
    let (dr, dg, db) = (buf[i] as f64, buf[i + 1] as f64, buf[i + 2] as f64);
    buf[i] = ((sr * sa + dr * da * (1.0 - sa)) / out_a).round() as u8;
    buf[i + 1] = ((sg * sa + dg * da * (1.0 - sa)) / out_a).round() as u8;
    buf[i + 2] = ((sb * sa + db * da * (1.0 - sa)) / out_a).round() as u8;
    buf[i + 3] = (out_a * 255.0).round() as u8;
}

fn rgb((r, g, b): (f64, f64, f64)) -> (u8, u8, u8) {
    (
        r.clamp(0.0, 255.0).round() as u8,
        g.clamp(0.0, 255.0).round() as u8,
        b.clamp(0.0, 255.0).round() as u8,
    )
}

fn clamp01(v: f64) -> f64 {
    v.clamp(0.0, 1.0)
}

fn rot2(x: f64, y: f64, sn: f64, cs: f64) -> (f64, f64) {
    (x * cs - y * sn, x * sn + y * cs)
}

/// 5-point star vertices (pixel space), point up, rotated by `rot` rad.
fn star_verts(cx: f64, cy: f64, r: f64, rot: f64) -> Vec<(f64, f64)> {
    let mut v = Vec::with_capacity(10);
    for i in 0..10 {
        let rad = if i % 2 == 0 { r } else { r * 0.4 };
        let a = -std::f64::consts::FRAC_PI_2 + i as f64 * std::f64::consts::PI / 5.0 + rot;
        v.push((cx + rad * a.cos(), cy + rad * a.sin()));
    }
    v
}

/// Coverage of a point against a polygon: 1 inside (with a 1px AA band
/// at the edge), 0 outside. Outline vertices in the same space.
fn polygon_coverage(px: f64, py: f64, verts: &[(f64, f64)]) -> f64 {
    if verts.len() < 3 {
        return 0.0;
    }
    let mut inside = false;
    for i in 0..verts.len() {
        let (x1, y1) = verts[i];
        let (x2, y2) = verts[(i + 1) % verts.len()];
        if (y1 > py) != (y2 > py) {
            let xi = x1 + (py - y1) * (x2 - x1) / (y2 - y1);
            if px < xi {
                inside = !inside;
            }
        }
    }
    if !inside {
        return 0.0;
    }
    clamp01(min_seg_dist(px, py, verts) + 0.5)
}

fn min_seg_dist(px: f64, py: f64, verts: &[(f64, f64)]) -> f64 {
    let mut best = f64::INFINITY;
    for i in 0..verts.len() {
        let (x1, y1) = verts[i];
        let (x2, y2) = verts[(i + 1) % verts.len()];
        best = best.min(seg_dist(px, py, x1, y1, x2, y2));
    }
    best
}

fn seg_dist(px: f64, py: f64, x1: f64, y1: f64, x2: f64, y2: f64) -> f64 {
    let dx = x2 - x1;
    let dy = y2 - y1;
    let len2 = dx * dx + dy * dy;
    let t = if len2 == 0.0 {
        0.0
    } else {
        ((px - x1) * dx + (py - y1) * dy) / len2
    }
    .clamp(0.0, 1.0);
    let cx = x1 + t * dx;
    let cy = y1 + t * dy;
    ((px - cx).powi(2) + (py - cy).powi(2)).sqrt()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::{demo_project, Layer};
    use std::collections::HashMap;

    const FONT: &[u8] = include_bytes!(
        "../../../../android-native/app/src/main/res/font/iransansx_regular.ttf"
    );

    fn renderer() -> Renderer {
        Renderer::new(FONT).unwrap()
    }

    fn count_non_bg(buf: &[u8], r: u8, g: u8, b: u8) -> usize {
        buf.chunks_exact(4)
            .filter(|p| p[3] != 0 && (p[0], p[1], p[2]) != (r, g, b))
            .count()
    }

    #[test]
    fn demo_renders_with_text_and_ring() {
        let ren = renderer();
        let proj = demo_project();
        let buf = ren.render(&proj, 5.0, 144, 256, &HashMap::new());
        assert_eq!(buf.len(), 144 * 256 * 4);
        // Background is #141620; the ring + titles must paint over it.
        let painted = count_non_bg(&buf, 0x14, 0x16, 0x20);
        assert!(painted > 500, "expected painted pixels, got {painted}");
    }

    #[test]
    fn render_is_deterministic() {
        let ren = renderer();
        let proj = demo_project();
        let a = ren.render(&proj, 3.0, 72, 128, &HashMap::new());
        let b = ren.render(&proj, 3.0, 72, 128, &HashMap::new());
        assert_eq!(a, b);
    }

    #[test]
    fn solid_rect_center_pixel_is_exact() {
        let ren = renderer();
        let mut proj = demo_project();
        proj.layers.clear();
        let mut l = Layer::new("shape", "مربع", 0.0, 10.0);
        l.transform.x = 360.0;
        l.transform.y = 640.0;
        l.shape = Some(crate::model::ShapeSpec {
            kind: "rect".to_string(),
            fill: Some("#FF0000".to_string()),
            w: 200.0,
            h: 200.0,
            ..Default::default()
        });
        proj.layers.push(l);
        let buf = ren.render(&proj, 1.0, 72, 128, &HashMap::new());
        let cx = 36usize;
        let cy = 64usize;
        let i = (cy * 72 + cx) * 4;
        assert_eq!((buf[i], buf[i + 1], buf[i + 2], buf[i + 3]), (255, 0, 0, 255));
    }

    #[test]
    fn vibrance_effect_changes_pixels() {
        let ren = renderer();
        let mut proj = demo_project();
        let mut plain = proj.clone();
        plain.layers[1].effects.clear();
        let base = ren.render(&plain, 5.0, 72, 128, &HashMap::new());
        let mut fx = crate::registry::default_effect("vibrance").unwrap();
        fx.params.insert("amt".to_string(), 200.0);
        proj.layers[1].effects.push(fx);
        let changed = ren.render(&proj, 5.0, 72, 128, &HashMap::new());
        let diff = base
            .iter()
            .zip(changed.iter())
            .filter(|(a, b)| a != b)
            .count();
        assert!(diff > 100, "expected effect to change pixels, diff={diff}");
    }

    #[test]
    fn text_layer_paints_pixels() {
        let ren = renderer();
        let mut proj = demo_project();
        proj.layers.retain(|l| l.type_ == "text" && l.name == "عنوان");
        let buf = ren.render(&proj, 5.0, 72, 128, &HashMap::new());
        let painted = count_non_bg(&buf, 0x14, 0x16, 0x20);
        assert!(painted > 20, "expected title glyphs, got {painted}");
    }

    #[test]
    fn image_layer_paints_pixels() {
        let ren = renderer();
        let mut proj = demo_project();
        proj.layers.clear();
        let mut l = Layer::new("image", "عکس", 0.0, 10.0);
        l.transform.x = 360.0;
        l.transform.y = 640.0;
        l.src = Some("content://test/1".to_string());
        l.shape = Some(crate::model::ShapeSpec {
            kind: "image".to_string(),
            w: 200.0,
            h: 200.0,
            ..Default::default()
        });
        proj.layers.push(l);
        let mut images = HashMap::new();
        images.insert(
            "content://test/1".to_string(),
            ImageData {
                width: 4,
                height: 4,
                rgba: vec![255, 0, 0, 255].repeat(16),
            },
        );
        let buf = ren.render(&proj, 1.0, 72, 128, &images);
        let i = (64 * 72 + 36) * 4;
        assert_eq!((buf[i], buf[i + 1], buf[i + 2], buf[i + 3]), (255, 0, 0, 255));
        // Missing image renders nothing (no crash, project bg shows).
        // The project bg is #0C0D13 (the #141620 rect is a layer).
        let buf2 = ren.render(&proj, 1.0, 72, 128, &HashMap::new());
        assert_eq!((buf2[i], buf2[i + 1], buf2[i + 2]), (0x0C, 0x0D, 0x13));
    }

    #[test]
    fn composite_blend_modes() {
        // Grey dst (128), grey src (128), full opacity.
        let dst = vec![128u8, 128, 128, 255];
        let src = vec![128u8, 128, 128, 255];
        let mut d = dst.clone();
        composite(&mut d, &src, 1.0, "multiply");
        assert_eq!((d[0], d[1], d[2]), (64, 64, 64));
        let mut d = dst.clone();
        composite(&mut d, &src, 1.0, "screen");
        // 255 - 127*127/255 = 192.
        assert_eq!((d[0], d[1], d[2]), (192, 192, 192));
        let mut d = dst.clone();
        composite(&mut d, &src, 1.0, "overlay");
        // d == 128: 255 - 2*127*127/255 = 128.498 -> 128.
        assert_eq!((d[0], d[1], d[2]), (128, 128, 128));
        let mut d = dst.clone();
        composite(&mut d, &src, 1.0, "add");
        assert_eq!((d[0], d[1], d[2]), (255, 255, 255));
        let mut d = dst.clone();
        composite(&mut d, &src, 1.0, "darken");
        assert_eq!((d[0], d[1], d[2]), (128, 128, 128));
        let mut d = dst.clone();
        composite(&mut d, &src, 1.0, "normal");
        assert_eq!((d[0], d[1], d[2]), (128, 128, 128));
        // Half opacity over white: multiply blends halfway toward white.
        let mut d = vec![255u8, 255, 255, 255];
        composite(&mut d, &src, 0.5, "multiply");
        assert_eq!((d[0], d[1], d[2]), (192, 192, 192));
    }

    #[test]
    fn mask_below_clips_layer_under_it() {
        let ren = renderer();
        let mut proj = demo_project();
        proj.layers.clear();
        // Red rect, full frame (the masked layer, bottom).
        let mut red = Layer::new("shape", "قرمز", 0.0, 10.0);
        red.transform.x = 360.0;
        red.transform.y = 640.0;
        red.shape = Some(crate::model::ShapeSpec {
            kind: "rect".to_string(),
            fill: Some("#FF0000".to_string()),
            w: 720.0,
            h: 1280.0,
            ..Default::default()
        });
        proj.layers.push(red);
        // Circle mask on top: only the circle keeps the red.
        let mut mask = Layer::new("shape", "ماسک", 0.0, 10.0);
        mask.transform.x = 360.0;
        mask.transform.y = 640.0;
        mask.clip = "below".to_string();
        mask.shape = Some(crate::model::ShapeSpec {
            kind: "circle".to_string(),
            fill: Some("#FFFFFF".to_string()),
            w: 200.0,
            h: 200.0,
            ..Default::default()
        });
        proj.layers.push(mask);
        let buf = ren.render(&proj, 1.0, 72, 128, &HashMap::new());
        let px = |x: usize, y: usize| {
            let i = (y * 72 + x) * 4;
            (buf[i], buf[i + 1], buf[i + 2])
        };
        // Center (inside the circle): red.
        assert_eq!(px(36, 64), (255, 0, 0));
        // Corner (outside the circle): project bg, not red.
        assert_eq!(px(2, 2), (0x0C, 0x0D, 0x13));
        // Inverted mask: red everywhere EXCEPT the circle.
        proj.layers[1].clip = "belowInv".to_string();
        let buf = ren.render(&proj, 1.0, 72, 128, &HashMap::new());
        let px = |x: usize, y: usize| {
            let i = (y * 72 + x) * 4;
            (buf[i], buf[i + 1], buf[i + 2])
        };
        assert_eq!(px(36, 64), (0x0C, 0x0D, 0x13));
        assert_eq!(px(2, 2), (255, 0, 0));
    }

    #[test]
    fn decode_png_roundtrip() {
        // 2x2 PNG built with the same crate, then decoded.
        let mut png = Vec::new();
        {
            use image::ImageEncoder;
            let enc = image::codecs::png::PngEncoder::new(&mut png);
            // red, green, blue, white pixels
            let px: [u8; 16] = [
                255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 255, 255,
            ];
            enc.write_image(&px, 2, 2, image::ExtendedColorType::Rgba8)
                .unwrap();
        }
        let img = decode_image(&png).unwrap();
        assert_eq!((img.width, img.height), (2, 2));
        assert_eq!(&img.rgba[0..4], &[255, 0, 0, 255]);
        assert_eq!(&img.rgba[12..16], &[255, 255, 255, 255]);
        assert!(decode_image(b"not an image").is_err());
    }

    #[test]
    fn yuv_nv12_red_and_white() {
        // 2x2 solid red: Y=82, U=90, V=240 (BT.601 limited).
        let nv12 = vec![82u8, 82, 82, 82, 90, 240];
        let rgba = yuv_to_rgba(&nv12, 2, 2, 2, 2, YuvFormat::Nv12);
        assert_eq!(rgba.len(), 16);
        for i in (0..16).step_by(4) {
            assert!((rgba[i] as i32 - 255).abs() <= 2, "r={}", rgba[i]);
            assert!(rgba[i + 1] as i32 <= 3, "g={}", rgba[i + 1]);
            assert!(rgba[i + 2] as i32 <= 2, "b={}", rgba[i + 2]);
            assert_eq!(rgba[i + 3], 255);
        }
        // White: Y=235, U=V=128. Black: Y=16.
        let white = vec![235u8, 235, 235, 235, 128, 128];
        let rgba = yuv_to_rgba(&white, 2, 2, 2, 2, YuvFormat::Nv12);
        for i in (0..16).step_by(4) {
            assert_eq!((rgba[i], rgba[i + 1], rgba[i + 2]), (255, 255, 255));
        }
        let black = vec![16u8, 16, 16, 16, 128, 128];
        let rgba = yuv_to_rgba(&black, 2, 2, 2, 2, YuvFormat::Nv12);
        for i in (0..16).step_by(4) {
            assert_eq!((rgba[i], rgba[i + 1], rgba[i + 2]), (0, 0, 0));
        }
        // Same red, planar (I420): Y + U + V planes.
        let i420 = vec![82u8, 82, 82, 82, 90, 240];
        let rgba = yuv_to_rgba(&i420, 2, 2, 2, 2, YuvFormat::I420);
        assert!((rgba[0] as i32 - 255).abs() <= 2);
        assert!(rgba[1] as i32 <= 3);
        // Stride wider than the width (hardware decoders pad rows).
        let padded = vec![82u8, 82, 82, 82, 82, 82, 82, 82, 90, 240, 0, 0];
        let rgba = yuv_to_rgba(&padded, 2, 2, 4, 2, YuvFormat::Nv12);
        assert!((rgba[0] as i32 - 255).abs() <= 2);
    }

    #[test]
    fn downscale_caps_width() {
        let img = ImageData {
            width: 4,
            height: 2,
            rgba: vec![200u8; 4 * 2 * 4],
        };
        let small = downscale_rgba(img, 2);
        assert_eq!((small.width, small.height), (2, 1));
    }
}
