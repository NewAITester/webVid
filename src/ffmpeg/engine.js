/**
 * موتور FFmpeg داخل برنامه (ffmpeg.wasm)
 * ─────────────────────────────────────────────────────────────
 * همان ffmpeg معروف، کامپایل‌شده به WebAssembly. نسخهٔ تک‌رشته‌ای
 * استفاده شده چون در WebView اندروید SharedArrayBuffer همیشه در
 * دسترس نیست.
 *
 * هسته فقط با تأیید کاربر دانلود و در حافظهٔ جدا ذخیره می‌شود.
 * هیچ fallback شبکه‌ای خودکار وجود ندارد.
 *
 * فقط وقتی بار می‌شود که کاربر واقعاً لازمش داشته باشد — حجم اولیهٔ
 * برنامه تغییری نمی‌کند.
 */

import { runtimeBase } from '../tools/manager.js';
let ff = null;
let loading = null;
let running = false;

/** آیا این دستگاه می‌تواند ffmpeg.wasm را اجرا کند؟ */
export function ffmpegSupported() {
  return typeof WebAssembly === 'object' && typeof Worker === 'function';
}

/**
 * بار کردن (یک‌بار). onStatus پیام فارسی وضعیت می‌گیرد.
 * @returns {Promise<import('@ffmpeg/ffmpeg').FFmpeg>}
 */
export async function loadFFmpeg(onStatus = () => {}) {
  if (ff) return ff;
  if (loading) return loading;
  loading = (async () => {
    onStatus('در حال بار کردن FFmpeg…');
    const base = await runtimeBase('ffmpeg');
    const { FFmpeg } = await import('@ffmpeg/ffmpeg');
    const inst = new FFmpeg();
    try {
      // Same-origin URLs are served from verified storage; no network fallback.
      await inst.load({ coreURL: base + 'ffmpeg-core.js', wasmURL: base + 'ffmpeg-core.wasm' });
      ff = inst;
      onStatus('FFmpeg آماده است (از حافظهٔ ابزارها)');
      return ff;
    } catch (e) { inst.terminate(); throw e; }
  })();
  try { return await loading; } finally { loading = null; }
}

/** طول یک فایل صوتی/تصویری با کمک خود مرورگر (سریع‌تر از ffprobe) */
export function probeDuration(blob) {
  return new Promise(res => {
    const isAudio = blob.type?.startsWith('audio');
    const el = document.createElement(isAudio ? 'audio' : 'video');
    const url = URL.createObjectURL(blob);
    let finished = false, timer;
    const done = v => {
      if (finished) return;
      finished = true; clearTimeout(timer);
      el.onloadedmetadata = el.onerror = null;
      el.removeAttribute('src'); el.load(); URL.revokeObjectURL(url);
      res(Number.isFinite(v) ? v : 0);
    };
    el.preload = 'metadata';
    el.onloadedmetadata = () => done(el.duration);
    el.onerror = () => done(0);
    timer = setTimeout(() => done(el.duration || 0), 6000);
    el.src = url;
  });
}

/**
 * اجرای یک دستور
 * @param {object} o
 * @param {Blob}   o.input
 * @param {string} o.inName    نام فایل ورودی که در args آمده
 * @param {string[]} o.args
 * @param {string} o.outName
 * @param {string} o.mime
 * @param {(p:number)=>void} o.onProgress   ۰..۱
 * @param {(line:string)=>void} o.onLog
 * @param {AbortSignal} o.signal
 * @returns {Promise<Blob>}
 */
export async function runFFmpeg({ input, inName, args, outName, mime, onProgress = () => {}, onLog = () => {}, signal }) {
  if (signal?.aborted) throw new Error('لغو شد');
  if (running) throw new Error('FFmpeg مشغول اجرای دستور دیگری است');
  running = true;
  let f;
  try { f = await loadFFmpeg(onLog); } catch (e) { running = false; throw e; }
  if (signal?.aborted) { running = false; throw new Error('لغو شد'); }
  const onP = ({ progress }) => onProgress(Math.max(0, Math.min(1, progress || 0)));
  const onL = ({ message }) => onLog(message);
  f.on('progress', onP);
  f.on('log', onL);
  const abort = () => { try { f.terminate(); } catch { /* */ } ff = null; };
  signal?.addEventListener('abort', abort, { once: true });
  try {
    await f.writeFile(inName, new Uint8Array(await input.arrayBuffer()));
    const code = await f.exec(args);
    if (signal?.aborted) throw new Error('لغو شد');
    if (code !== 0) throw new Error(`ffmpeg با کد ${code} متوقف شد — گزارش را ببینید`);
    const data = await f.readFile(outName);
    return new Blob([data.buffer ?? data], { type: mime });
  } finally {
    signal?.removeEventListener('abort', abort);
    try { f.off('progress', onP); f.off('log', onL); } catch { /* terminated worker */ }
    if (ff === f) {
      // حافظهٔ wasm محدود است؛ فایل‌ها را پاک کن
      try { await f.deleteFile(inName); } catch { /* */ }
      try { await f.deleteFile(outName); } catch { /* */ }
    }
    running = false;
  }
}
