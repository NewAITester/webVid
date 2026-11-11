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
//! Honest gaps in this version: image/video layers have no decoder yet
//! (skipped), masks (`clip`) and non-normal blend modes are ignored,
//! text alignment other than center uses anchor semantics (`start` =
//! the layer anchor is the left edge). These are noted, not faked.

use crate::evaluate;
use crate::model::{Layer, Project};
use crate::registry;
use crate::shape::shape_persian;

pub struct Renderer {
    font: fontdue::Font,
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
    /// the widget to it); otherwise the image stretches to fit.
    pub fn render(&self, project: &Project, t: f64, w: usize, h: usize) -> Vec<u8> {
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
        self.render_layers(&layers, project, t, &mut frame, w, h, &view);
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
    /// layer's effects and opacity as it goes.
    fn render_layers(
        &self,
        layers: &[&Layer],
        project: &Project,
        t: f64,
        dst: &mut [u8],
        w: usize,
        h: usize,
        view: &View,
    ) {
        for layer in layers {
            let mut lbuf = vec![0u8; w * h * 4];
            self.render_layer_into(layer, project, t, &mut lbuf, w, h, view);
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
            composite(dst, &lbuf, w, opacity);
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
                self.render_layers(&kids, project, t, buf, w, h, view);
            }
            // image / video: no decoder yet. camera / null / audio: nothing
            // to draw into the frame.
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
}

/// Source-over composite of a whole buffer (`src`, straight alpha) onto
/// `dst` (also straight alpha), scaled by `opacity` 0–1.
fn composite(dst: &mut [u8], src: &[u8], _w: usize, opacity: f64) {
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
            d[c] = ((s[c] as f64 * sa + d[c] as f64 * da * (1.0 - sa)) / out_a)
                .round() as u8;
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
        let buf = ren.render(&proj, 5.0, 144, 256);
        assert_eq!(buf.len(), 144 * 256 * 4);
        // Background is #141620; the ring + titles must paint over it.
        let painted = count_non_bg(&buf, 0x14, 0x16, 0x20);
        assert!(painted > 500, "expected painted pixels, got {painted}");
    }

    #[test]
    fn render_is_deterministic() {
        let ren = renderer();
        let proj = demo_project();
        let a = ren.render(&proj, 3.0, 72, 128);
        let b = ren.render(&proj, 3.0, 72, 128);
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
        let buf = ren.render(&proj, 1.0, 72, 128);
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
        let base = ren.render(&plain, 5.0, 72, 128);
        let mut fx = crate::registry::default_effect("vibrance").unwrap();
        fx.params.insert("amt".to_string(), 200.0);
        proj.layers[1].effects.push(fx);
        let changed = ren.render(&proj, 5.0, 72, 128);
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
        let buf = ren.render(&proj, 5.0, 72, 128);
        let painted = count_non_bg(&buf, 0x14, 0x16, 0x20);
        assert!(painted > 20, "expected title glyphs, got {painted}");
    }
}
