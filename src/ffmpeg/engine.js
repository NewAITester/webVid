/**
 * موتور FFmpeg داخل برنامه (ffmpeg.wasm)
 * ─────────────────────────────────────────────────────────────
 * همان ffmpeg معروف، کامپایل‌شده به WebAssembly. نسخهٔ تک‌رشته‌ای
 * استفاده شده چون در WebView اندروید SharedArrayBuffer همیشه در
 * دسترس نیست.
 *
 * فایل‌های هسته (حدود ۳۱ مگابایت) موقع بیلد از node_modules در
 * public/ffmpeg کپی می‌شوند (scripts/copy-ffmpeg.mjs) تا بدون
 * اینترنت هم کار کند. اگر نبودند، از CDN بار می‌شوند.
 *
 * فقط وقتی بار می‌شود که کاربر واقعاً لازمش داشته باشد — حجم اولیهٔ
 * برنامه تغییری نمی‌کند.
 */

const CDN = 'https://unpkg.com/@ffmpeg/core@0.12.10/dist/esm';
let ff = null;
let loading = null;

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
    const [{ FFmpeg }, { toBlobURL }] = await Promise.all([import('@ffmpeg/ffmpeg'), import('@ffmpeg/util')]);
    const local = `${import.meta.env.BASE_URL}ffmpeg`;
    let lastErr = null;
    for (const base of [local, CDN]) {
      try {
        const inst = new FFmpeg();
        await inst.load({
          coreURL: await toBlobURL(`${base}/ffmpeg-core.js`, 'text/javascript'),
          wasmURL: await toBlobURL(`${base}/ffmpeg-core.wasm`, 'application/wasm'),
        });
        ff = inst;
        onStatus(base === local ? 'FFmpeg آماده است (آفلاین)' : 'FFmpeg آماده است (از اینترنت)');
        return ff;
      } catch (e) { lastErr = e; }
    }
    throw new Error('FFmpeg بار نشد: ' + (lastErr?.message || lastErr));
  })();
  try { return await loading; } finally { loading = null; }
}

/** طول یک فایل صوتی/تصویری با کمک خود مرورگر (سریع‌تر از ffprobe) */
export function probeDuration(blob) {
  return new Promise(res => {
    const isAudio = blob.type?.startsWith('audio');
    const el = document.createElement(isAudio ? 'audio' : 'video');
    const url = URL.createObjectURL(blob);
    const done = v => { URL.revokeObjectURL(url); res(Number.isFinite(v) ? v : 0); };
    el.preload = 'metadata';
    el.onloadedmetadata = () => done(el.duration);
    el.onerror = () => done(0);
    setTimeout(() => done(el.duration || 0), 6000);
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
  const f = await loadFFmpeg(onLog);
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
    if (ff) {
      f.off('progress', onP); f.off('log', onL);
      // حافظهٔ wasm محدود است؛ فایل‌ها را پاک کن
      try { await f.deleteFile(inName); } catch { /* */ }
      try { await f.deleteFile(outName); } catch { /* */ }
    }
  }
}
