import { Muxer, ArrayBufferTarget } from 'mp4-muxer';
import { Stage } from './stage.js';
import { Renderer } from './renderer.js';
import { W, H } from './song.js';

/**
 * خروجی گرفتن ویدیو
 *
 * اینجاست که «قانون طلایی» سودش را پس می‌دهد: چون renderFrame(t)
 * تابع خالص زمان است، می‌شود فریم‌ها را پشت سر هم و بدون هیچ حالت
 * انباشته تولید کرد. نیازی به پخش بی‌درنگ نیست — به هر سرعتی که
 * سخت‌افزار بتواند انکود می‌کنیم.
 *
 * تصویر: WebCodecs VideoEncoder (انکودر سخت‌افزاری گوشی)
 * صدا:   AudioEncoder → AAC
 * ظرف:   mp4-muxer
 */

export const FPS = 60;

/** رزولوشن‌های آماده — همه ۱۶:۹ */
export const RESOLUTIONS = [
  { id: '2160', w: 3840, h: 2160, label: '4K — ۳۸۴۰×۲۱۶۰', rec: 45_000_000 },
  { id: '1440', w: 2560, h: 1440, label: '2K — ۲۵۶۰×۱۴۴۰', rec: 24_000_000 },
  { id: '1080', w: 1920, h: 1080, label: 'Full HD — ۱۹۲۰×۱۰۸۰', rec: 12_000_000 },
  { id: '720',  w: 1280, h: 720,  label: 'HD — ۱۲۸۰×۷۲۰',   rec: 6_000_000 },
  { id: '540',  w: 960,  h: 540,  label: 'کم‌حجم — ۹۶۰×۵۴۰', rec: 3_000_000 },
];

/**
 * کدک‌ها به ترتیب اولویت.
 * H.264 اول است چون همه‌جا پخش می‌شود و روی گوشی انکودر سخت‌افزاری
 * دارد. ولی بعضی بیلدهای کروم (مثلاً نسخهٔ اوپن‌سورس) آن را ندارند،
 * پس به VP9 و AV1 عقب می‌نشینیم.
 */
const VIDEO_CODECS = [
  { codec: 'avc1.640028', mux: 'avc',  label: 'H.264' },
  { codec: 'avc1.42001f', mux: 'avc',  label: 'H.264 baseline' },
  { codec: 'vp09.00.10.08', mux: 'vp9', label: 'VP9' },
  { codec: 'av01.0.04M.08', mux: 'av1', label: 'AV1' },
];
const AUDIO_CODECS = [
  { codec: 'mp4a.40.2', mux: 'aac',  label: 'AAC' },
  { codec: 'opus',      mux: 'opus', label: 'Opus' },
];

async function pickVideo(bitrate = 12_000_000, width = W, height = H) {
  for (const c of VIDEO_CODECS) {
    try {
      const r = await VideoEncoder.isConfigSupported({
        codec: c.codec, width, height, bitrate, framerate: FPS,
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

/** آیا این مرورگر می‌تواند خروجی بگیرد؟ */
export async function canExport() {
  if (typeof VideoEncoder === 'undefined') {
    return { ok: false, why: 'مرورگر از WebCodecs پشتیبانی نمی‌کند' };
  }
  const v = await pickVideo();
  if (!v) return { ok: false, why: 'هیچ انکودر ویدیویی در دسترس نیست' };
  const a = await pickAudio();
  return { ok: true, video: v.label, audio: a ? a.label : null };
}

/** صدای آهنگ را برای بازهٔ خواسته‌شده آماده می‌کند */
async function loadAudioSlice(url, from, to) {
  const buf = await (await fetch(url)).arrayBuffer();
  const actx = new (window.OfflineAudioContext || window.webkitOfflineAudioContext)(
    2, 48000 * Math.max(0.1, to - from), 48000);
  const decoded = await actx.decodeAudioData(buf);
  const src = actx.createBufferSource();
  src.buffer = decoded;
  src.connect(actx.destination);
  src.start(0, from, to - from);
  return await actx.startRendering();
}

/**
 * @param {object} o
 * @param {Song}   o.song
 * @param {number} o.from ثانیهٔ شروع
 * @param {number} o.to   ثانیهٔ پایان
 * @param {string} o.audioUrl
 * @param {number} o.quality 1..3 (کیفیت → بیت‌ریت)
 * @param {(p:object)=>void} o.onProgress
 * @returns {Promise<Blob>}
 */
export async function exportVideo({
  song, from = 0, to = 10, audioUrl = null,
  width = W, height = H, fps = FPS,
  bitrate = 12_000_000, grain = 0.024, overrides = null,
  sections = null, look = null,
  onProgress = () => {}, signal = null,
} = {}) {
  const t0 = performance.now();
  // ابعاد باید زوج باشند وگرنه انکودر رد می‌کند
  width = Math.round(width / 2) * 2;
  height = Math.round(height / 2) * 2;
  const total = Math.max(1, Math.round((to - from) * fps));

  // بوم مستقل در اندازهٔ کامل — مستقل از صفحهٔ کاربر.
  //
  // عمداً OffscreenCanvas نیست: فیلترهای SVG (منحنی تُن و آستانهٔ
  // بلوم) با url(#id) ارجاع می‌دهند و OffscreenCanvas سندی ندارد که
  // آن شناسه‌ها را در آن پیدا کند — فیلترها بی‌صدا نادیده گرفته
  // می‌شوند و خروجی روشن و مه‌آلود درمی‌آید. بوم DOM جداشده این
  // مشکل را ندارد.
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;

  const stage = new Stage(canvas);
  stage.resize(width, height);
  const R = new Renderer(stage).setSong(song);
  R.grain = grain;
  // جابه‌جایی‌های دستی باید در خروجی هم باشند، وگرنه ویدیوی نهایی با
  // چیزی که در پیش‌نمایش چیده‌اید فرق می‌کند.
  R.overrides = overrides;
  R.editMode = false;        // کادرهای ویرایش هرگز در خروجی نمی‌آیند
  // جدول بخش و تنظیمات ظاهر هم باید عیناً منتقل شوند، وگرنه ویدیو با
  // چیزی که در پیش‌نمایش چیده‌اید فرق می‌کند.
  if (sections) R.sections = sections;
  if (look) {
    R.bloom = look.bloom ?? R.bloom;
    R.chroma = look.chroma ?? R.chroma;
    R.showFurniture = look.furniture ?? R.showFurniture;
  }

  const target = new ArrayBufferTarget();
  const vc = await pickVideo(bitrate, width, height);
  if (!vc) throw new Error('هیچ انکودر ویدیویی در دسترس نیست');
  const ac = audioUrl ? await pickAudio() : null;

  const muxer = new Muxer({
    target,
    fastStart: 'in-memory',
    video: { codec: vc.mux, width, height, frameRate: fps },
    ...(ac ? { audio: { codec: ac.mux, sampleRate: 48000, numberOfChannels: 2 } } : {}),
  });

  /* ── تصویر ─────────────────────────────────────────────── */
  let encErr = null;
  const venc = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: e => { encErr = e; },
  });
  venc.configure({
    codec: vc.codec, width, height,
    bitrate, framerate: fps,
    latencyMode: 'quality',
    ...(vc.mux === 'avc' ? { avc: { format: 'avc' } } : {}),
  });

  const FRAME_US = 1e6 / fps;
  for (let i = 0; i < total; i++) {
    if (signal?.aborted) { venc.close(); throw new Error('لغو شد'); }
    if (encErr) throw encErr;

    R.renderFrame(from + i / fps);

    const frame = new VideoFrame(canvas, {
      timestamp: Math.round(i * FRAME_US),
      duration: Math.round(FRAME_US),
    });
    // هر ۲ ثانیه یک کی‌فریم — مثل -g 120 در نسخهٔ پایتون
    venc.encode(frame, { keyFrame: i % (fps * 2) === 0 });
    frame.close();

    // صف را خالی نگه دار تا حافظه نترکد
    if (venc.encodeQueueSize > 8) {
      await new Promise(r => setTimeout(r, 0));
      while (venc.encodeQueueSize > 4) await new Promise(r => setTimeout(r, 4));
    }
    if (i % 10 === 0 || i === total - 1) {
      const el = (performance.now() - t0) / 1000;
      onProgress({
        phase: 'video', done: i + 1, total,
        pct: (i + 1) / total,
        fps: (i + 1) / Math.max(0.001, el),
        eta: el / Math.max(1, i + 1) * (total - i - 1),
      });
      await new Promise(r => setTimeout(r, 0));   // رابط کاربری نفس بکشد
    }
  }
  await venc.flush();
  venc.close();

  /* ── صدا ───────────────────────────────────────────────── */
  if (ac && audioUrl) {
    onProgress({ phase: 'audio', pct: 1, done: total, total });
    const rendered = await loadAudioSlice(audioUrl, from, to);
    const aenc = new AudioEncoder({
      output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
      error: e => { encErr = e; },
    });
    aenc.configure({
      codec: ac.codec, sampleRate: 48000, numberOfChannels: 2, bitrate: 224000,
    });
    const CH = 2, SR = 48000, BLOCK = 4800;
    const L = rendered.getChannelData(0);
    const Rr = rendered.numberOfChannels > 1 ? rendered.getChannelData(1) : L;
    for (let off = 0; off < L.length; off += BLOCK) {
      const n = Math.min(BLOCK, L.length - off);
      const inter = new Float32Array(n * CH);
      for (let j = 0; j < n; j++) { inter[j * CH] = L[off + j]; inter[j * CH + 1] = Rr[off + j]; }
      aenc.encode(new AudioData({
        format: 'f32', sampleRate: SR, numberOfFrames: n, numberOfChannels: CH,
        timestamp: Math.round((off / SR) * 1e6), data: inter,
      }));
      if (aenc.encodeQueueSize > 16) await new Promise(r => setTimeout(r, 2));
    }
    await aenc.flush();
    aenc.close();
  }

  if (encErr) throw encErr;
  muxer.finalize();
  onProgress({ phase: 'done', pct: 1, done: total, total, codec: vc.label,
               seconds: (performance.now() - t0) / 1000 });
  return new Blob([target.buffer], { type: 'video/mp4' });
}
