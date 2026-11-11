//! MP4 export (video-only in this version; audio mixing comes later).
//!
//! Every frame is rendered by the software renderer at the project's
//! size, converted RGBA -> NV12 in Rust, fed to the NDK H.264 encoder
//! (byte-buffer mode), and muxed with `AMediaMuxer` through ndk-sys
//! (the `ndk` crate has no muxer wrapper). Runs on a background thread;
//! progress and the result are shared with the UI through Arcs.
//!
//! On non-Android targets `start_export` returns a job that is already
//! failed with an honest message (`MP4 export runs on the phone only`).

use lyricstudio_engine::model::Project;
use lyricstudio_engine::render::ImageData;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{
    atomic::AtomicBool,
    Arc, Mutex,
};
#[cfg(target_os = "android")]
use std::sync::atomic::Ordering;

pub struct ExportJob {
    /// 0..1
    pub progress: Arc<Mutex<f32>>,
    /// Set once, when the worker finishes (Ok = output path).
    pub result: Arc<Mutex<Option<Result<PathBuf, String>>>>,
    pub cancel: Arc<AtomicBool>,
}

impl ExportJob {
    fn new() -> Self {
        Self {
            progress: Arc::new(Mutex::new(0.0)),
            result: Arc::new(Mutex::new(None)),
            cancel: Arc::new(AtomicBool::new(false)),
        }
    }
}

/// Spawn the export worker. The project and images are cloned so the UI
/// can keep editing while it runs. `android` is the activity handle the
/// worker uses to open video files (export frames come from decoders it
/// opens itself); `None` means no video layers will render.
pub fn start_export(
    project: Project,
    images: HashMap<String, ImageData>,
    out_path: PathBuf,
    android: Option<crate::AndroidHandle>,
) -> ExportJob {
    let job = ExportJob::new();
    #[cfg(target_os = "android")]
    {
        let progress = job.progress.clone();
        let result = job.result.clone();
        let cancel = job.cancel.clone();
        std::thread::spawn(move || {
            let r = run_export(&project, &images, &out_path, &progress, &cancel, android.as_ref());
            *result.lock().unwrap() = Some(r);
        });
    }
    #[cfg(not(target_os = "android"))]
    {
        let _ = (project, images, out_path, android);
        *job.result.lock().unwrap() = Some(Err("MP4 export runs on the phone only".to_string()));
    }
    job
}

/// RGBA8 -> NV12 (Y plane + interleaved UV, BT.601 limited range).
/// `w` and `h` must be even; `out` must be `w * h * 3 / 2` bytes.
pub fn rgba_to_nv12(rgba: &[u8], w: usize, h: usize, out: &mut [u8]) {
    debug_assert!(w % 2 == 0 && h % 2 == 0);
    debug_assert_eq!(rgba.len(), w * h * 4);
    debug_assert_eq!(out.len(), w * h * 3 / 2);
    let y_size = w * h;
    let pix = |x: usize, y: usize| -> (i32, i32, i32) {
        let i = (y * w + x) * 4;
        (rgba[i] as i32, rgba[i + 1] as i32, rgba[i + 2] as i32)
    };
    for y in 0..h {
        for x in 0..w {
            let (r, g, b) = pix(x, y);
            out[y * w + x] = (16 + ((66 * r + 129 * g + 25 * b + 128) >> 8)) as u8;
        }
    }
    for by in 0..h / 2 {
        for bx in 0..w / 2 {
            let mut usum = 0i32;
            let mut vsum = 0i32;
            for dy in 0..2 {
                for dx in 0..2 {
                    let (r, g, b) = pix(bx * 2 + dx, by * 2 + dy);
                    usum += 128 + ((-38 * r - 74 * g + 112 * b + 128) >> 8);
                    vsum += 128 + ((112 * r - 94 * g - 18 * b + 128) >> 8);
                }
            }
            let o = y_size + by * w + bx * 2;
            out[o] = (usum / 4).clamp(0, 255) as u8;
            out[o + 1] = (vsum / 4).clamp(0, 255) as u8;
        }
    }
}

#[cfg(target_os = "android")]
fn run_export(
    project: &Project,
    images: &HashMap<String, ImageData>,
    out_path: &std::path::Path,
    progress: &Arc<Mutex<f32>>,
    cancel: &Arc<AtomicBool>,
    android: Option<&android_activity::AndroidApp>,
) -> Result<PathBuf, String> {
    use crate::video::VideoDecoder;
    use lyricstudio_engine::render::Renderer;
    use ndk::media::media_codec::{
        DequeuedInputBufferResult, DequeuedOutputBufferInfoResult, MediaCodec,
        MediaCodecDirection,
    };
    use ndk::media::media_format::MediaFormat;
    use std::os::fd::AsRawFd;
    use std::time::Duration;

    let renderer = Renderer::new(crate::FONT_REGULAR).map_err(|e| e.to_string())?;
    let fps = project.fps.max(1) as f64;
    let w = (project.width as usize) & !1;
    let h = (project.height as usize) & !1;
    if w == 0 || h == 0 {
        return Err("project size is zero".to_string());
    }
    let total = ((project.duration * fps).ceil() as usize).max(1);

    // --- Encoder ---
    let mut fmt = MediaFormat::new();
    fmt.set_str("mime", "video/avc");
    fmt.set_i32("width", w as i32);
    fmt.set_i32("height", h as i32);
    fmt.set_i32("bitrate", (w * h * 8).min(16_000_000) as i32);
    fmt.set_i32("frame-rate", fps as i32);
    fmt.set_i32("i-frame-interval", 2);
    fmt.set_i32("color-format", 21); // COLOR_FormatYUV420SemiPlanar
    let codec = MediaCodec::from_encoder_type("video/avc")
        .ok_or_else(|| "no H.264 encoder on this device".to_string())?;
    codec
        .configure(&fmt, None, MediaCodecDirection::Encoder)
        .map_err(|e| format!("configure: {e}"))?;
    codec.start().map_err(|e| format!("start: {e}"))?;
    // Stop the codec before its Drop deletes it (delete on a running
    // codec can panic inside the ndk crate's Drop).
    struct StopCodec<'a>(&'a MediaCodec);
    impl Drop for StopCodec<'_> {
        fn drop(&mut self) {
            let _ = self.0.stop();
        }
    }
    let _stop_codec = StopCodec(&codec);

    // --- Muxer (fd-based; the ndk crate has no muxer wrapper) ---
    let file = std::fs::File::create(out_path).map_err(|e| format!("create {out_path:?}: {e}"))?;
    let fd = file.as_raw_fd();
    let muxer = unsafe {
        ndk_sys::AMediaMuxer_new(fd, ndk_sys::OutputFormat::AMEDIAMUXER_OUTPUT_FORMAT_MPEG_4)
    };
    if muxer.is_null() {
        return Err("AMediaMuxer_new failed".to_string());
    }
    struct MuxGuard {
        ptr: *mut ndk_sys::AMediaMuxer,
        started: std::cell::Cell<bool>,
    }
    impl Drop for MuxGuard {
        fn drop(&mut self) {
            unsafe {
                if self.started.get() {
                    ndk_sys::AMediaMuxer_stop(self.ptr);
                }
                ndk_sys::AMediaMuxer_delete(self.ptr);
            }
        }
    }
    let mux = MuxGuard {
        ptr: muxer,
        started: std::cell::Cell::new(false),
    };
    let mut track: Option<usize> = None;

    // Drain output buffers; returns true when the EOS buffer was seen.
    let drain = |codec: &MediaCodec,
                 mux: &MuxGuard,
                 track: &mut Option<usize>,
                 timeout: Duration|
     -> Result<bool, String> {
        loop {
            match codec.dequeue_output_buffer(timeout) {
                Ok(DequeuedOutputBufferInfoResult::Buffer(ob)) => {
                    let info = *ob.info();
                    let eos = info.flags() & 4 != 0;
                    if track.is_none() {
                        // Some devices never send OutputFormatChanged; add
                        // the track from the codec's current format.
                        let out_fmt = codec.output_format();
                        let idx = unsafe {
                            ndk_sys::AMediaMuxer_addTrack(mux.ptr, out_fmt.as_ptr())
                        };
                        if idx < 0 {
                            codec.release_output_buffer(ob, false).ok();
                            return Err("AMediaMuxer_addTrack failed".to_string());
                        }
                        *track = Some(idx as usize);
                        let st = unsafe { ndk_sys::AMediaMuxer_start(mux.ptr) };
                        if st != ndk_sys::media_status_t(0) {
                            codec.release_output_buffer(ob, false).ok();
                            return Err(format!("AMediaMuxer_start: {st:?}"));
                        }
                        mux.started.set(true);
                    }
                    if let Some(t) = track {
                        let data = ob.buffer();
                        let ffi_info = ndk_sys::AMediaCodecBufferInfo {
                            offset: info.offset(),
                            size: info.size(),
                            presentationTimeUs: info.presentation_time_us(),
                            flags: info.flags(),
                        };
                        let st = unsafe {
                            ndk_sys::AMediaMuxer_writeSampleData(
                                mux.ptr,
                                *t,
                                data.as_ptr(),
                                &ffi_info,
                            )
                        };
                        if st != ndk_sys::media_status_t(0) {
                            codec.release_output_buffer(ob, false).ok();
                            return Err(format!("writeSampleData: {st:?}"));
                        }
                    }
                    codec
                        .release_output_buffer(ob, false)
                        .map_err(|e| e.to_string())?;
                    if eos {
                        return Ok(true);
                    }
                }
                Ok(DequeuedOutputBufferInfoResult::OutputFormatChanged) => {
                    if track.is_none() {
                        let out_fmt = codec.output_format();
                        let idx = unsafe {
                            ndk_sys::AMediaMuxer_addTrack(mux.ptr, out_fmt.as_ptr())
                        };
                        if idx < 0 {
                            return Err("AMediaMuxer_addTrack failed".to_string());
                        }
                        *track = Some(idx as usize);
                        let st = unsafe { ndk_sys::AMediaMuxer_start(mux.ptr) };
                        if st != ndk_sys::media_status_t(0) {
                            return Err(format!("AMediaMuxer_start: {st:?}"));
                        }
                        mux.started.set(true);
                    }
                }
                Ok(DequeuedOutputBufferInfoResult::TryAgainLater)
                | Ok(DequeuedOutputBufferInfoResult::OutputBuffersChanged) => return Ok(false),
                Err(e) => return Err(format!("dequeue_output: {e}")),
            }
        }
    };

    let mut nv12 = vec![0u8; w * h * 3 / 2];
    // Video decoders opened per layer (each owns its fd + extractor);
    // frames are decoded into the local image map per frame.
    let mut video_decoders: HashMap<String, VideoDecoder> = HashMap::new();
    let mut frame_images = images.clone();
    for i in 0..total {
        if cancel.load(Ordering::Relaxed) {
            return Err("export cancelled".to_string());
        }
        let t = i as f64 / fps;
        if let Some(app) = android {
            for layer in &project.layers {
                if layer.type_ != "video" {
                    continue;
                }
                let Some(src) = layer.src.as_deref() else {
                    continue;
                };
                if !video_decoders.contains_key(src) {
                    match VideoDecoder::open(app, src) {
                        Ok(d) => {
                            video_decoders.insert(src.to_string(), d);
                        }
                        Err(e) => {
                            eprintln!("export: video open failed for {src}: {e}");
                            continue;
                        }
                    }
                }
                if let Some(dec) = video_decoders.get_mut(src) {
                    match dec.frame_at(t) {
                        Ok(Some(img)) => {
                            frame_images.insert(src.to_string(), img);
                        }
                        Ok(None) => {}
                        Err(e) => {
                            eprintln!("export: video decode failed for {src}: {e}");
                        }
                    }
                }
            }
        }
        let rgba = renderer.render(project, t, w, h, &frame_images);
        rgba_to_nv12(&rgba, w, h, &mut nv12);
        match codec.dequeue_input_buffer(Duration::from_millis(10)) {
            Ok(DequeuedInputBufferResult::Buffer(mut ib)) => {
                let dst = ib.buffer_mut();
                if dst.len() < nv12.len() {
                    return Err("encoder input buffer too small".to_string());
                }
                for (d, s) in dst.iter_mut().zip(nv12.iter()) {
                    d.write(*s);
                }
                let pts = (i as u64 * 1_000_000) / fps as u64;
                codec
                    .queue_input_buffer(ib, 0, nv12.len(), pts, 0)
                    .map_err(|e| format!("queue_input: {e}"))?;
            }
            Ok(DequeuedInputBufferResult::TryAgainLater) => {}
            Err(e) => return Err(format!("dequeue_input: {e}")),
        }
        drain(&codec, &mux, &mut track, Duration::from_millis(0))?;
        *progress.lock().unwrap() = (i + 1) as f32 / total as f32 * 0.95;
    }
    // End of stream, then drain until the EOS buffer comes back.
    match codec.dequeue_input_buffer(Duration::from_millis(100)) {
        Ok(DequeuedInputBufferResult::Buffer(ib)) => {
            let pts = (total as u64 * 1_000_000) / fps as u64;
            codec
                .queue_input_buffer(ib, 0, 0, pts, 4)
                .map_err(|e| format!("queue_eos: {e}"))?;
        }
        _ => {}
    }
    let mut guard = 0;
    while guard < 10_000 {
        guard += 1;
        if drain(&codec, &mux, &mut track, Duration::from_millis(100))? {
            break;
        }
    }
    *progress.lock().unwrap() = 1.0;
    Ok(out_path.to_path_buf())
}

// `BufferInfo` is Copy, so `*ob.info()` moves a copy out of the borrow.
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn nv12_red_is_82_90_240() {
        // 2x2 solid red.
        let rgba = vec![255u8, 0, 0, 255].repeat(4);
        let mut out = vec![0u8; 2 * 2 * 3 / 2];
        rgba_to_nv12(&rgba, 2, 2, &mut out);
        assert_eq!(&out[0..4], &[82, 82, 82, 82]);
        assert_eq!((out[4], out[5]), (90, 240));
    }

    #[test]
    fn nv12_white_and_black() {
        let rgba = vec![255u8; 2 * 2 * 4];
        let mut out = vec![0u8; 6];
        rgba_to_nv12(&rgba, 2, 2, &mut out);
        assert_eq!(&out[0..4], &[235, 235, 235, 235]);
        assert_eq!((out[4], out[5]), (128, 128));
        let rgba = vec![0u8; 2 * 2 * 4];
        rgba_to_nv12(&rgba, 2, 2, &mut out);
        assert_eq!(&out[0..4], &[16, 16, 16, 16]);
        assert_eq!((out[4], out[5]), (128, 128));
    }
}
