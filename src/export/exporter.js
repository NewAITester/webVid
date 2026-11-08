/**
 * خروجی ویدیو — فاز R5 (WebCodecs + mp4-muxer)
 *
 * چون renderFrame(t) تابع خالص زمان است، فریم‌ها پشت سر هم و بدون
 * پخش بی‌درنگ تولید می‌شوند؛ به هر سرعتی که سخت‌افزار بتواند انکود می‌کنیم.
 * تصویر: VideoEncoder (H.264 اول، بعد VP9 و AV1) — صدا: AudioEncoder → AAC.
 * اگر WebCodecs نباشد، خطای واضح برمی‌گردد (FFmpeg در فاز R8 می‌آید).
 */
import { Muxer, ArrayBufferTarget } from 'mp4-muxer';

const VIDEO_CODECS = [
  { codec: 'avc1.640028', mux: 'avc', label: 'H.264' },
  { codec: 'avc1.42001f', mux: 'avc', label: 'H.264 baseline' },
  { codec: 'vp09.00.10.08', mux: 'vp9', label: 'VP9' },
  { codec: 'av01.0.04M.08', mux: 'av1', label: 'AV1' },
];
const AUDIO_CODECS = [
  { codec: 'mp4a.40.2', mux: 'aac', label: 'AAC' },
  { codec: 'opus', mux: 'opus', label: 'Opus' },
];

/** پشتیبانی مرورگر از خروجی (همگام، بدون انکودر). */
export function exportSupport() {
  const has = typeof VideoEncoder !== 'undefined' && typeof VideoFrame !== 'undefined';
  return { webcodecs: has, videoEncoder: typeof VideoEncoder !== 'undefined', audioEncoder: typeof AudioEncoder !== 'undefined' };
}

export function estimateSize(project, { fps = 30, bitrateMbps = 12 } = {}) {
  const seconds = project.duration;
  return { seconds, estMB: +(seconds * bitrateMbps / 8).toFixed(1), fps };
}

/**
 * نقشهٔ خروجی — خالص و تست‌پذیر: بازه را اعتبارسنجی می‌کند و تعداد
 * فریم، حجم برآوردی و ابعاد نهایی را برمی‌گرداند.
 */
export function exportPlan(project, { from = 0, to = project.duration, fps = 30, width = project.width, height = project.height, bitrateMbps = 12 } = {}) {
  const dur = project.duration;
  from = Math.max(0, Math.min(dur, +from || 0));
  to = Math.max(0, Math.min(dur, +to || dur));
  if (to <= from) throw new Error('بازهٔ خروجی نامعتبر است (پایان باید بعد از شروع باشد)');
  fps = Math.min(60, Math.max(1, Math.round(fps) || 30));
  width = Math.max(16, Math.round(width) || project.width);
  height = Math.max(16, Math.round(height) || project.height);
  const seconds = to - from;
  const frames = Math.max(1, Math.round(seconds * fps));
  return { from, to, fps, width, height, seconds, frames, bitrate: bitrateMbps * 1_000_000, estMB: +(seconds * bitrateMbps / 8).toFixed(1) };
}

/** لایه‌های صوتی فعال در بازه — خالص: {src, start, offset, duration}. */
export function audioSchedule(project, from, to) {
  const out = [];
  for (const l of project.layers || []) {
    if (l.type !== 'audio' || !l.src) continue;
    const s = Math.max(l.start, from), e = Math.min(l.end, to);
    if (e <= s) continue;
    out.push({ src: l.src, start: s - from, offset: s - l.start, duration: e - s });
  }
  return out;
}

async function pickVideo(plan) {
  for (const c of VIDEO_CODECS) {
    try {
      const r = await VideoEncoder.isConfigSupported({
        codec: c.codec, width: plan.width, height: plan.height,
        bitrate: plan.bitrate, framerate: plan.fps,
      });
      if (r.supported) return c;
    } catch { /* کدک بعدی */ }
  }
  return null;
}

async function pickAudio() {
  if (typeof AudioEncoder === 'undefined') return null;
  for (const c of AUDIO_CODECS) {
    try {
      const r = await AudioEncoder.isConfigSupported({
        codec: c.codec, sampleRate: 48000, numberOfChannels: 2, bitrate: 192000,
      });
      if (r.supported) return c;
    } catch { /* کدک بعدی */ }
  }
  return null;
}

/** میکس صدای بازه با OfflineAudioContext — خالی برمی‌گرداند اگر صدایی نیست. */
async function mixAudio(project, plan) {
  const sched = audioSchedule(project, plan.from, plan.to);
  if (!sched.length) return null;
  const dur = plan.seconds;
  const actx = new OfflineAudioContext(2, Math.ceil(48000 * dur), 48000);
  for (const s of sched) {
    try {
      const buf = await (await fetch(s.src)).arrayBuffer();
      const decoded = await actx.decodeAudioData(buf);
      const src = actx.createBufferSource();
      src.buffer = decoded;
      src.connect(actx.destination);
      src.start(s.start, s.offset, s.duration);
    } catch { /* فایل خراب: رد شو */ }
  }
  return actx.startRendering();
}

function nextTick() { return new Promise(r => setTimeout(r, 0)); }

/**
 * خروجی MP4.
 * deps.renderTo(canvas, t) هر فریم را روی بوم می‌کشد (از ویرایشگر می‌آید).
 * onProgress({done, total, phase}) — phase: 'video' | 'audio' | 'mux'.
 * signal: AbortSignal برای لغو.
 */
export async function exportVideo(project, opts = {}, deps = {}) {
  const plan = exportPlan(project, opts);
  const onProgress = opts.onProgress || (() => {});
  const signal = opts.signal;
  if (typeof VideoEncoder === 'undefined' || typeof VideoFrame === 'undefined') {
    throw new Error('این مرورگر از WebCodecs پشتیبانی نمی‌کند');
  }
  const videoCodec = await pickVideo(plan);
  if (!videoCodec) throw new Error('هیچ انکودر ویدیویی در دسترس نیست');
  if (typeof deps.renderTo !== 'function') throw new Error('رندر فریم وصل نشده است');

  // صدا اول میکس می‌شود تا بدانیم ترک صوتی داریم یا نه
  onProgress({ done: 0, total: 1, phase: 'audio' });
  const audioBuf = await mixAudio(project, plan);
  const audioCodec = audioBuf ? await pickAudio() : null;

  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: { codec: videoCodec.mux, width: plan.width, height: plan.height },
    ...(audioCodec ? { audio: { codec: audioCodec.mux, numberOfChannels: 2, sampleRate: 48000 } } : {}),
    fastStart: 'in-memory',
  });

  const videoEncoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: e => { throw e; },
  });
  videoEncoder.configure({
    codec: videoCodec.codec, width: plan.width, height: plan.height,
    bitrate: plan.bitrate, framerate: plan.fps,
  });

  // بوم رندر (هم‌اندازهٔ خروجی)
  const canvas = document.createElement('canvas');
  canvas.width = plan.width; canvas.height = plan.height;

  for (let i = 0; i < plan.frames; i++) {
    if (signal?.aborted) { videoEncoder.close(); throw new DOMException('لغو شد', 'AbortError'); }
    const t = plan.from + i / plan.fps;
    deps.renderTo(canvas, t);
    const frame = new VideoFrame(canvas, { timestamp: Math.round((i / plan.fps) * 1e6) });
    videoEncoder.encode(frame, { keyFrame: i % 60 === 0 });
    frame.close();
    if (i % 10 === 9) {
      onProgress({ done: i + 1, total: plan.frames, phase: 'video' });
      await nextTick();
    }
  }
  onProgress({ done: plan.frames, total: plan.frames, phase: 'video' });
  await videoEncoder.flush();
  videoEncoder.close();

  // صدا (اگر میکس شده باشد)
  if (audioBuf) {
    if (audioCodec) {
      const audioEncoder = new AudioEncoder({
        output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
        error: () => { /* صدا اختیاری است */ },
      });
      audioEncoder.configure({
        codec: audioCodec.codec, sampleRate: 48000, numberOfChannels: 2, bitrate: 192000,
      });
      const ch0 = audioBuf.getChannelData(0);
      const ch1 = audioBuf.numberOfChannels > 1 ? audioBuf.getChannelData(1) : ch0;
      const frameSamples = 1024;
      for (let off = 0; off < ch0.length; off += frameSamples) {
        const n = Math.min(frameSamples, ch0.length - off);
        const data = new AudioData({
          format: 'f32-planar',
          sampleRate: 48000,
          numberOfFrames: n,
          numberOfChannels: 2,
          timestamp: Math.round((off / 48000) * 1e6),
          data: new Float32Array([...ch0.slice(off, off + n), ...ch1.slice(off, off + n)]).buffer,
        });
        audioEncoder.encode(data);
        data.close();
      }
      await audioEncoder.flush();
      audioEncoder.close();
    }
  }

  onProgress({ done: 1, total: 1, phase: 'mux' });
  muxer.finalize();
  const buffer = muxer.target.buffer;
  const blob = new Blob([buffer], { type: 'video/mp4' });
  return { blob, size: blob.size, duration: plan.seconds, frames: plan.frames, codec: videoCodec.label };
}
