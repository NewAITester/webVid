//! Video frame decoding (Android only): `AMediaExtractor` (ndk-sys) +
//! NDK MediaCodec decoder. Frames come out YUV420 (NV12 or I420, with
//! stride) and are converted to RGBA in the engine, downscaled to
//! <=720px wide so the stage texture stays small.
//!
//! `frame_at(t)` decodes forward from the current position (fast during
//! playback); a backward seek re-seeks to the previous sync frame and
//! decodes forward. The last decoded frame is cached, so a still
//! playhead costs nothing after the first decode.

#[cfg(target_os = "android")]
use crate::jni_bridge;
#[cfg(target_os = "android")]
use android_activity::AndroidApp;
#[cfg(target_os = "android")]
use jni::{objects::GlobalRef, JavaVM};
#[cfg(target_os = "android")]
use lyricstudio_engine::render::{downscale_rgba, yuv_to_rgba, ImageData, YuvFormat};
#[cfg(target_os = "android")]
use ndk::media::media_codec::{
    DequeuedInputBufferResult, DequeuedOutputBufferInfoResult, MediaCodec,
    MediaCodecDirection, MediaFormat,
};
#[cfg(target_os = "android")]
use std::ffi::CString;
#[cfg(target_os = "android")]
use std::time::Duration;

pub struct VideoInfo {
    pub width: usize,
    pub height: usize,
    pub duration_secs: f64,
}

#[cfg(target_os = "android")]
pub struct VideoDecoder {
    extractor: *mut ndk_sys::AMediaExtractor,
    codec: MediaCodec,
    width: usize,
    height: usize,
    duration_us: i64,
    max_input: usize,
    scratch: Vec<u8>,
    input_eos: bool,
    last_pts_us: i64,
    last_frame: Option<ImageData>,
    out_format: Option<(YuvFormat, usize, usize)>, // (format, stride, slice_h)
    pfd: Option<GlobalRef>,
    vm: JavaVM,
}

#[cfg(target_os = "android")]
impl VideoDecoder {
    /// Open a content:// URI for decoding. The extractor reads through a
    /// file descriptor (see `jni_bridge::open_fd`).
    pub fn open(app: &AndroidApp, uri: &str) -> Result<Self, String> {
        // Check the dummy decoder used below exists before opening any
        // file, so no extractor/PFD can leak on this path.
        if MediaCodec::from_decoder_type("video/avc").is_none() {
            return Err("no video decoder on this device".to_string());
        }
        let vm = jni_bridge::vm_for(app)?;
        let (fd, size, pfd) = jni_bridge::open_fd(app, uri)?;
        let extractor = unsafe { ndk_sys::AMediaExtractor_new() };
        if extractor.is_null() {
            jni_bridge::close_fd(&vm, pfd);
            return Err("AMediaExtractor_new failed".to_string());
        }
        let st = unsafe { ndk_sys::AMediaExtractor_setDataSourceFd(extractor, fd, 0, size) };
        if st != ndk_sys::media_status_t(0) {
            unsafe { ndk_sys::AMediaExtractor_delete(extractor) };
            jni_bridge::close_fd(&vm, pfd);
            return Err(format!("setDataSourceFd: {st:?}"));
        }
        let mut dec = Self {
            extractor,
            codec: MediaCodec::from_decoder_type("video/avc")
                .ok_or_else(|| "no video decoder".to_string())?,
            width: 0,
            height: 0,
            duration_us: 0,
            max_input: 1 << 20,
            scratch: Vec::new(),
            input_eos: false,
            last_pts_us: -1,
            last_frame: None,
            out_format: None,
            pfd: Some(pfd),
            vm,
        };
        dec.open_track()?;
        Ok(dec)
    }

    /// Find the first video track, copy its format into a fresh
    /// `MediaFormat` for the decoder, and start it.
    fn open_track(&mut self) -> Result<(), String> {
        let count = unsafe { ndk_sys::AMediaExtractor_getTrackCount(self.extractor) };
        let mut found: Option<(String, MediaFormat)> = None;
        for i in 0..count {
            let fmt = unsafe { ndk_sys::AMediaExtractor_getTrackFormat(self.extractor, i) };
            if fmt.is_null() {
                continue;
            }
            // The format is owned by the caller (delete after copying).
            let mime = fmt_string(fmt, "mime").unwrap_or_default();
            if mime.starts_with("video/") {
                let mut cfg = MediaFormat::new();
                cfg.set_str("mime", &mime);
                if let Some(csd) = fmt_buffer(fmt, "csd-0") {
                    cfg.set_buffer("csd-0", &csd);
                }
                if let Some(csd) = fmt_buffer(fmt, "csd-1") {
                    cfg.set_buffer("csd-1", &csd);
                }
                self.width = fmt_i32(fmt, "width").unwrap_or(0) as usize;
                self.height = fmt_i32(fmt, "height").unwrap_or(0) as usize;
                self.duration_us = fmt_i64(fmt, "durationUs").unwrap_or(0);
                self.max_input = fmt_i32(fmt, "max-input-size")
                    .map(|v| (v as usize).max(4096))
                    .unwrap_or(1 << 20);
                unsafe { ndk_sys::AMediaExtractor_selectTrack(self.extractor, i) };
                found = Some((mime, cfg));
                unsafe { ndk_sys::AMediaFormat_delete(fmt) };
                break;
            }
            unsafe { ndk_sys::AMediaFormat_delete(fmt) };
        }
        let Some((mime, cfg)) = found else {
            return Err("no video track in this file".to_string());
        };
        self.codec = MediaCodec::from_decoder_type(&mime)
            .ok_or_else(|| format!("no decoder for {mime}"))?;
        self.codec
            .configure(&cfg, None, MediaCodecDirection::Decoder)
            .map_err(|e| format!("decoder configure: {e}"))?;
        self.codec
            .start()
            .map_err(|e| format!("decoder start: {e}"))?;
        self.scratch = vec![0u8; self.max_input];
        Ok(())
    }

    pub fn info(&self) -> VideoInfo {
        VideoInfo {
            width: self.width,
            height: self.height,
            duration_secs: self.duration_us as f64 / 1_000_000.0,
        }
    }

    /// The frame at time `t` (seconds), or the last frame when `t` is
    /// past the end. `None` only when nothing decoded at all.
    pub fn frame_at(&mut self, t: f64) -> Result<Option<ImageData>, String> {
        let target_us = (t * 1_000_000.0) as i64;
        if self.last_pts_us < 0 || target_us < self.last_pts_us {
            self.seek(target_us)?;
        }
        // Decode forward until a frame at or after the target.
        for _ in 0..600 {
            match self.decode_next()? {
                Some((pts, img)) => {
                    self.last_pts_us = pts;
                    self.last_frame = Some(img.clone());
                    if pts >= target_us {
                        return Ok(Some(img));
                    }
                }
                None => return Ok(self.last_frame.clone()),
            }
        }
        Err("decoder made no progress".to_string())
    }

    fn seek(&mut self, target_us: i64) -> Result<(), String> {
        let st = unsafe {
            ndk_sys::AMediaExtractor_seekTo(
                self.extractor,
                target_us,
                ndk_sys::SeekMode::AMEDIAEXTRACTOR_SEEK_PREVIOUS_SYNC,
            )
        };
        if st != ndk_sys::media_status_t(0) {
            return Err(format!("seek: {st:?}"));
        }
        self.codec.flush().map_err(|e| format!("flush: {e}"))?;
        self.input_eos = false;
        self.last_pts_us = -1;
        self.last_frame = None;
        self.out_format = None;
        Ok(())
    }

    /// Decode the next frame (feeding the extractor as needed).
    /// `Ok(None)` = end of stream (no more frames).
    fn decode_next(&mut self) -> Result<Option<(i64, ImageData)>, String> {
        for _ in 0..50 {
            // Feed one sample when the decoder is hungry.
            if !self.input_eos {
                if let Ok(DequeuedInputBufferResult::Buffer(mut ib)) =
                    self.codec.dequeue_input_buffer(Duration::from_millis(10))
                {
                    let n = unsafe {
                        ndk_sys::AMediaExtractor_readSampleData(
                            self.extractor,
                            self.scratch.as_mut_ptr(),
                            self.scratch.len(),
                        )
                    };
                    if n <= 0 {
                        self.codec
                            .queue_input_buffer(ib, 0, 0, 0, 4)
                            .map_err(|e| format!("queue_eos: {e}"))?;
                        self.input_eos = true;
                    } else {
                        let pts = unsafe {
                            ndk_sys::AMediaExtractor_getSampleTime(self.extractor)
                        } as u64;
                        let flags = unsafe {
                            ndk_sys::AMediaExtractor_getSampleFlags(self.extractor)
                        };
                        let dst = ib.buffer_mut();
                        let n = n as usize;
                        if dst.len() < n {
                            return Err("decoder input buffer too small".to_string());
                        }
                        for (d, s) in dst.iter_mut().zip(self.scratch[..n].iter()) {
                            d.write(*s);
                        }
                        self.codec
                            .queue_input_buffer(ib, 0, n, pts, flags)
                            .map_err(|e| format!("queue_input: {e}"))?;
                        unsafe {
                            ndk_sys::AMediaExtractor_advance(self.extractor);
                        }
                    }
                }
            }
            // Drain one output.
            match self.codec.dequeue_output_buffer(Duration::from_millis(10)) {
                Ok(DequeuedOutputBufferInfoResult::Buffer(ob)) => {
                    let info = *ob.info();
                    let eos = info.flags() & 4 != 0;
                    if self.out_format.is_none() {
                        self.out_format = Some(self.read_output_format()?);
                    }
                    if eos {
                        self.codec.release_output_buffer(ob, false).ok();
                        return Ok(None);
                    }
                    let data = ob.buffer();
                    let start = info.offset() as usize;
                    let end = (start + info.size() as usize).min(data.len());
                    let (fmt, stride, slice_h) = self.out_format.unwrap();
                    // A short buffer cannot hold the planes; skip the frame
                    // instead of panicking in the converter.
                    if end - start < stride * slice_h * 3 / 2 {
                        self.codec.release_output_buffer(ob, false).ok();
                        continue;
                    }
                    let rgba = yuv_to_rgba(
                        &data[start..end],
                        self.width,
                        self.height,
                        stride,
                        slice_h,
                        fmt,
                    );
                    let img = downscale_rgba(
                        ImageData {
                            width: self.width,
                            height: self.height,
                            rgba,
                        },
                        720,
                    );
                    let pts = info.presentation_time_us();
                    self.codec.release_output_buffer(ob, false).ok();
                    return Ok(Some((pts, img)));
                }
                Ok(DequeuedOutputBufferInfoResult::OutputFormatChanged) => {
                    self.out_format = Some(self.read_output_format()?);
                }
                Ok(_) => {} // TryAgainLater / OutputBuffersChanged: keep going
                Err(e) => return Err(format!("dequeue_output: {e}")),
            }
        }
        Err("decoder made no progress".to_string())
    }

    fn read_output_format(&self) -> Result<(YuvFormat, usize, usize), String> {
        let fmt = self.codec.output_format();
        let color = fmt.i32("color-format").unwrap_or(0);
        let (yf, w, h) = match color {
            21 => (
                YuvFormat::Nv12,
                fmt.i32("width").unwrap_or(self.width as i32) as usize,
                fmt.i32("height").unwrap_or(self.height as i32) as usize,
            ),
            19 => (
                YuvFormat::I420,
                fmt.i32("width").unwrap_or(self.width as i32) as usize,
                fmt.i32("height").unwrap_or(self.height as i32) as usize,
            ),
            other => return Err(format!("unsupported decoder color format {other}")),
        };
        let stride = fmt.i32("stride").unwrap_or(w as i32) as usize;
        let slice_h = fmt.i32("slice-height").unwrap_or(h as i32) as usize;
        Ok((yf, stride.max(w), slice_h.max(h)))
    }
}

#[cfg(target_os = "android")]
impl Drop for VideoDecoder {
    fn drop(&mut self) {
        let _ = self.codec.stop();
        unsafe { ndk_sys::AMediaExtractor_delete(self.extractor) };
        if let Some(pfd) = self.pfd.take() {
            jni_bridge::close_fd(&self.vm, pfd);
        }
    }
}

#[cfg(target_os = "android")]
fn fmt_string(fmt: *mut ndk_sys::AMediaFormat, key: &str) -> Option<String> {
    let ckey = CString::new(key).ok()?;
    let mut out: *const std::os::raw::c_char = std::ptr::null();
    let ok = unsafe { ndk_sys::AMediaFormat_getString(fmt, ckey.as_ptr(), &mut out) };
    if !ok || out.is_null() {
        return None;
    }
    unsafe { std::ffi::CStr::from_ptr(out) }
        .to_str()
        .ok()
        .map(|s| s.to_string())
}

#[cfg(target_os = "android")]
fn fmt_i32(fmt: *mut ndk_sys::AMediaFormat, key: &str) -> Option<i32> {
    let ckey = CString::new(key).ok()?;
    let mut out: i32 = 0;
    let ok = unsafe { ndk_sys::AMediaFormat_getInt32(fmt, ckey.as_ptr(), &mut out) };
    ok.then_some(out)
}

#[cfg(target_os = "android")]
fn fmt_i64(fmt: *mut ndk_sys::AMediaFormat, key: &str) -> Option<i64> {
    let ckey = CString::new(key).ok()?;
    let mut out: i64 = 0;
    let ok = unsafe { ndk_sys::AMediaFormat_getInt64(fmt, ckey.as_ptr(), &mut out) };
    ok.then_some(out)
}

#[cfg(target_os = "android")]
fn fmt_buffer(fmt: *mut ndk_sys::AMediaFormat, key: &str) -> Option<Vec<u8>> {
    let ckey = CString::new(key).ok()?;
    let mut ptr: *mut std::os::raw::c_void = std::ptr::null_mut();
    let mut size: usize = 0;
    let ok = unsafe { ndk_sys::AMediaFormat_getBuffer(fmt, ckey.as_ptr(), &mut ptr, &mut size) };
    if !ok || ptr.is_null() || size == 0 {
        return None;
    }
    unsafe { Some(std::slice::from_raw_parts(ptr as *const u8, size).to_vec()) }
}

/// Host stub: video decoding runs on the phone only.
#[cfg(not(target_os = "android"))]
pub struct VideoDecoder;

#[cfg(not(target_os = "android"))]
impl VideoDecoder {
    pub fn open(_app: &crate::AndroidHandle, _uri: &str) -> Result<Self, String> {
        Err("video decoding runs on the phone only".to_string())
    }

    pub fn info(&self) -> VideoInfo {
        VideoInfo {
            width: 0,
            height: 0,
            duration_secs: 0.0,
        }
    }

    pub fn frame_at(&mut self, _t: f64) -> Result<Option<ImageData>, String> {
        Err("video decoding runs on the phone only".to_string())
    }
}

#[cfg(not(target_os = "android"))]
use lyricstudio_engine::render::ImageData;
