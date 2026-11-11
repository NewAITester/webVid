//! Audio decoding for MP4 export (Android only): `AMediaExtractor` +
//! NDK MediaCodec decoder. Decodes one audio layer to interleaved PCM
//! (16-bit), capped to the layer's length so a 3-minute song does not
//! become a 35 MB buffer. A linear-interpolation resampler brings tracks
//! to a common rate for mixing.

#[cfg(target_os = "android")]
use crate::jni_bridge;
#[cfg(target_os = "android")]
use android_activity::AndroidApp;
#[cfg(target_os = "android")]
use jni::{objects::GlobalRef, JavaVM};
#[cfg(target_os = "android")]
use ndk::media::media_codec::{
    DequeuedInputBufferResult, DequeuedOutputBufferInfoResult, MediaCodec,
    MediaCodecDirection, MediaFormat,
};
#[cfg(target_os = "android")]
use std::ffi::CString;
#[cfg(target_os = "android")]
use std::time::Duration;

/// Interleaved PCM16.
pub struct PcmAudio {
    pub sample_rate: u32,
    pub channels: usize,
    /// interleaved, `len = frames * channels`
    pub samples: Vec<i16>,
}

impl PcmAudio {
    pub fn frames(&self) -> usize {
        if self.channels == 0 {
            0
        } else {
            self.samples.len() / self.channels
        }
    }

    pub fn duration_secs(&self) -> f64 {
        if self.sample_rate == 0 {
            0.0
        } else {
            self.frames() as f64 / self.sample_rate as f64
        }
    }
}

/// Linear-interpolation resample to `to_rate` (per channel).
pub fn resample(pcm: &PcmAudio, to_rate: u32) -> PcmAudio {
    if pcm.sample_rate == to_rate || pcm.sample_rate == 0 || pcm.frames() == 0 {
        return PcmAudio {
            sample_rate: pcm.sample_rate,
            channels: pcm.channels,
            samples: pcm.samples.clone(),
        };
    }
    let ratio = pcm.sample_rate as f64 / to_rate as f64;
    let out_frames = (pcm.frames() as f64 / ratio).ceil() as usize;
    let mut out = Vec::with_capacity(out_frames * pcm.channels);
    for i in 0..out_frames {
        let pos = i as f64 * ratio;
        let j = pos.floor() as usize;
        let frac = pos - j as f64;
        for ch in 0..pcm.channels {
            let a = pcm.samples[(j.min(pcm.frames() - 1)) * pcm.channels + ch] as f64;
            let b = pcm.samples[(j + 1).min(pcm.frames() - 1) * pcm.channels + ch] as f64;
            out.push((a + (b - a) * frac).round().clamp(-32768.0, 32767.0) as i16);
        }
    }
    PcmAudio {
        sample_rate: to_rate,
        channels: pcm.channels,
        samples: out,
    }
}

#[cfg(target_os = "android")]
struct AudioDecoder {
    extractor: *mut ndk_sys::AMediaExtractor,
    codec: MediaCodec,
    scratch: Vec<u8>,
    input_eos: bool,
    pfd: Option<GlobalRef>,
    vm: JavaVM,
}

#[cfg(target_os = "android")]
impl AudioDecoder {
    fn open(app: &AndroidApp, uri: &str) -> Result<Self, String> {
        if MediaCodec::from_decoder_type("audio/mpeg").is_none() {
            return Err("no audio decoder on this device".to_string());
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
            codec: MediaCodec::from_decoder_type("audio/mpeg")
                .ok_or_else(|| "no audio decoder".to_string())?,
            scratch: Vec::new(),
            input_eos: false,
            pfd: Some(pfd),
            vm,
        };
        dec.open_track()?;
        Ok(dec)
    }

    fn open_track(&mut self) -> Result<(), String> {
        let count = unsafe { ndk_sys::AMediaExtractor_getTrackCount(self.extractor) };
        let mut found: Option<(String, MediaFormat, usize)> = None;
        for i in 0..count {
            let fmt = unsafe { ndk_sys::AMediaExtractor_getTrackFormat(self.extractor, i) };
            if fmt.is_null() {
                continue;
            }
            let mime = fmt_string(fmt, "mime").unwrap_or_default();
            if mime.starts_with("audio/") {
                let mut cfg = MediaFormat::new();
                cfg.set_str("mime", &mime);
                if let Some(csd) = fmt_buffer(fmt, "csd-0") {
                    cfg.set_buffer("csd-0", &csd);
                }
                if let Some(csd) = fmt_buffer(fmt, "csd-1") {
                    cfg.set_buffer("csd-1", &csd);
                }
                let max_input = fmt_i32(fmt, "max-input-size")
                    .map(|v| (v as usize).max(4096))
                    .unwrap_or(1 << 20);
                unsafe { ndk_sys::AMediaExtractor_selectTrack(self.extractor, i) };
                found = Some((mime, cfg, max_input));
                unsafe { ndk_sys::AMediaFormat_delete(fmt) };
                break;
            }
            unsafe { ndk_sys::AMediaFormat_delete(fmt) };
        }
        let Some((mime, cfg, max_input)) = found else {
            return Err("no audio track in this file".to_string());
        };
        self.codec = MediaCodec::from_decoder_type(&mime)
            .ok_or_else(|| format!("no decoder for {mime}"))?;
        self.codec
            .configure(&cfg, None, MediaCodecDirection::Decoder)
            .map_err(|e| format!("decoder configure: {e}"))?;
        self.codec
            .start()
            .map_err(|e| format!("decoder start: {e}"))?;
        self.scratch = vec![0u8; max_input];
        Ok(())
    }

    /// Decode up to `max_secs` seconds of audio to PCM16.
    fn decode(&mut self, max_secs: f64) -> Result<PcmAudio, String> {
        let max_us = (max_secs * 1_000_000.0) as i64;
        let mut samples: Vec<i16> = Vec::new();
        let mut rate: u32 = 0;
        let mut channels: usize = 0;
        let mut saw_eos = false;
        for _ in 0..100_000 {
            if saw_eos {
                break;
            }
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
            match self.codec.dequeue_output_buffer(Duration::from_millis(10)) {
                Ok(DequeuedOutputBufferInfoResult::Buffer(ob)) => {
                    let info = *ob.info();
                    let eos = info.flags() & 4 != 0;
                    if rate == 0 {
                        let fmt = self.codec.output_format();
                        rate = fmt.i32("sample-rate").unwrap_or(0) as u32;
                        channels = fmt.i32("channel-count").unwrap_or(0) as usize;
                        let enc = fmt.i32("pcm-encoding").unwrap_or(2);
                        if enc != 2 && enc != 3 {
                            self.codec.release_output_buffer(ob, false).ok();
                            return Err(format!("unsupported pcm-encoding {enc}"));
                        }
                        if enc == 3 {
                            self.codec.release_output_buffer(ob, false).ok();
                            return Err("float PCM not supported yet".to_string());
                        }
                    }
                    if !eos {
                        let data = ob.buffer();
                        let start = info.offset() as usize;
                        let end = (start + info.size() as usize).min(data.len());
                        let n = (end - start) / 2;
                        for i in 0..n {
                            let b = &data[start + i * 2..start + i * 2 + 2];
                            samples.push(i16::from_le_bytes([b[0], b[1]]));
                        }
                        if channels > 0
                            && samples.len() / channels >= (max_us as usize * rate as usize) / 1_000_000
                        {
                            self.codec.release_output_buffer(ob, false).ok();
                            break;
                        }
                    }
                    self.codec.release_output_buffer(ob, false).ok();
                    if eos {
                        saw_eos = true;
                    }
                }
                Ok(_) => {}
                Err(e) => return Err(format!("dequeue_output: {e}")),
            }
        }
        if rate == 0 || channels == 0 {
            return Err("no audio output format".to_string());
        }
        let want_frames = (max_secs * rate as f64) as usize;
        if samples.len() > want_frames * channels {
            samples.truncate(want_frames * channels);
        }
        Ok(PcmAudio {
            sample_rate: rate,
            channels,
            samples,
        })
    }
}

#[cfg(target_os = "android")]
impl Drop for AudioDecoder {
    fn drop(&mut self) {
        let _ = self.codec.stop();
        unsafe { ndk_sys::AMediaExtractor_delete(self.extractor) };
        if let Some(pfd) = self.pfd.take() {
            jni_bridge::close_fd(&self.vm, pfd);
        }
    }
}

/// Decode one audio file to PCM16, capped to `max_secs` seconds.
#[cfg(target_os = "android")]
pub fn decode_audio(
    app: &AndroidApp,
    uri: &str,
    max_secs: f64,
) -> Result<PcmAudio, String> {
    let mut dec = AudioDecoder::open(app, uri)?;
    dec.decode(max_secs)
}

#[cfg(not(target_os = "android"))]
pub fn decode_audio(
    _app: &crate::AndroidHandle,
    _uri: &str,
    _max_secs: f64,
) -> Result<PcmAudio, String> {
    Err("audio decoding runs on the phone only".to_string())
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

/// One audio layer ready to mix.
pub struct MixSource {
    pub pcm: PcmAudio,
    pub start: f64,
    pub end: f64,
    pub volume: f64,
    pub fade_in: f64,
    pub fade_out: f64,
}

/// Mix the active sources for the frame starting at time `t` (seconds).
/// `frame_samples` is the frame length in samples at `rate` (48 kHz
/// stereo in the exporter). Sources are resampled to `rate` + stereo
/// first (see `resample` + the exporter's channel fix-up). Volume and
/// linear fades are applied per sample; the sum clamps to i16.
pub fn mix_frame(
    sources: &[MixSource],
    t: f64,
    rate: u32,
    frame_samples: usize,
    channels: usize,
) -> Vec<i16> {
    let mut out = vec![0i32; frame_samples * channels];
    for src in sources {
        if t >= src.end || t + frame_samples as f64 / rate as f64 <= src.start {
            continue;
        }
        let pos0 = ((t - src.start) * rate as f64).max(0.0);
        for j in 0..frame_samples {
            let file_frame = pos0 as usize + j;
            if file_frame >= src.pcm.frames() {
                break;
            }
            let at = t + j as f64 / rate as f64;
            // Linear fades: 0->1 over fade_in from the layer start,
            // 1->0 over fade_out before the layer end.
            let mut gain = src.volume;
            if src.fade_in > 0.0 && at < src.start + src.fade_in {
                gain *= ((at - src.start) / src.fade_in).clamp(0.0, 1.0);
            }
            if src.fade_out > 0.0 && at > src.end - src.fade_out {
                gain *= ((src.end - at) / src.fade_out).clamp(0.0, 1.0);
            }
            if gain <= 0.0 {
                continue;
            }
            for ch in 0..channels {
                let s = src.pcm.samples[file_frame * src.pcm.channels + ch.min(src.pcm.channels - 1)];
                out[j * channels + ch] += (s as f64 * gain).round() as i32;
            }
        }
    }
    out.into_iter()
        .map(|v| v.clamp(-32768, 32767) as i16)
        .collect()
}

/// Duplicate a mono track to stereo (AAC export is stereo). Tracks with
/// 2+ channels are returned as-is; >2 channels keep the first two.
pub fn to_stereo(pcm: PcmAudio) -> PcmAudio {
    match pcm.channels {
        1 => {
            let mut samples = Vec::with_capacity(pcm.samples.len() * 2);
            for s in pcm.samples {
                samples.push(s);
                samples.push(s);
            }
            PcmAudio {
                sample_rate: pcm.sample_rate,
                channels: 2,
                samples,
            }
        }
        2 => pcm,
        _ => {
            let mut samples = Vec::with_capacity(pcm.frames() * 2);
            for f in 0..pcm.frames() {
                samples.push(pcm.samples[f * pcm.channels]);
                samples.push(pcm.samples[f * pcm.channels + 1]);
            }
            PcmAudio {
                sample_rate: pcm.sample_rate,
                channels: 2,
                samples,
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resample_keeps_length_ratio() {
        // 48000 Hz -> 44100 Hz, 1 channel, 480 samples = 10ms.
        let pcm = PcmAudio {
            sample_rate: 48000,
            channels: 1,
            samples: (0..480).map(|i| (i % 100) as i16).collect(),
        };
        let out = resample(&pcm, 44100);
        assert_eq!(out.sample_rate, 44100);
        assert_eq!(out.frames(), 441);
        // Same rate is a copy.
        let same = resample(&pcm, 48000);
        assert_eq!(same.samples, pcm.samples);
    }

    #[test]
    fn resample_stereo_interpolates_per_channel() {
        // 2 Hz -> 1 Hz lands exactly on input frames 0 and 2.
        let pcm = PcmAudio {
            sample_rate: 2,
            channels: 2,
            samples: vec![0, 100, 1000, 1100, 2000, 2100, 3000, 3100],
        };
        let out = resample(&pcm, 1);
        assert_eq!(out.frames(), 2);
        assert_eq!(out.samples[0], 0);
        assert_eq!(out.samples[1], 100);
        assert_eq!(out.samples[2], 2000);
        assert_eq!(out.samples[3], 2100);
        // 4 Hz -> 3 Hz interpolates: positions 0, 4/3, 8/3.
        let pcm = PcmAudio {
            sample_rate: 4,
            channels: 1,
            samples: vec![0, 1000, 2000, 3000],
        };
        let out = resample(&pcm, 3);
        assert_eq!(out.frames(), 3);
        assert_eq!(out.samples, vec![0, 1333, 2667]);
    }

    #[test]
    fn mix_frame_volume_and_fade() {
        // 4 frames @ 4 Hz, mono->stereo handled by the caller; here the
        // source is stereo already.
        let pcm = PcmAudio {
            sample_rate: 4,
            channels: 2,
            samples: vec![1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000],
        };
        let src = MixSource {
            pcm,
            start: 0.0,
            end: 1.0,
            volume: 0.5,
            fade_in: 0.0,
            fade_out: 0.0,
        };
        let out = mix_frame(&[src], 0.0, 4, 2, 2);
        assert_eq!(out, vec![500, 500, 500, 500]);
        // Fade-in: at t=0 gain=0, at t=0.25 gain=0.25 of the volume.
        let pcm = PcmAudio {
            sample_rate: 4,
            channels: 1,
            samples: vec![1000, 1000, 1000, 1000],
        };
        let src = MixSource {
            pcm,
            start: 0.0,
            end: 1.0,
            volume: 1.0,
            fade_in: 1.0,
            fade_out: 0.0,
        };
        let out = mix_frame(&[src], 0.0, 4, 2, 1);
        assert_eq!(out, vec![0, 250]);
        // Two tracks sum, and clamp.
        let pcm = PcmAudio {
            sample_rate: 4,
            channels: 1,
            samples: vec![30000, 30000],
        };
        let mk = || MixSource {
            pcm: PcmAudio {
                sample_rate: 4,
                channels: 1,
                samples: vec![30000, 30000],
            },
            start: 0.0,
            end: 1.0,
            volume: 1.0,
            fade_in: 0.0,
            fade_out: 0.0,
        };
        let out = mix_frame(&[mk(), mk()], 0.0, 4, 1, 1);
        assert_eq!(out, vec![32767]);
    }

    #[test]
    fn to_stereo_duplicates_mono() {
        let pcm = PcmAudio {
            sample_rate: 48000,
            channels: 1,
            samples: vec![7, -7],
        };
        let out = to_stereo(pcm);
        assert_eq!(out.channels, 2);
        assert_eq!(out.samples, vec![7, 7, -7, -7]);
    }
}
