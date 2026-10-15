import { CACHE, cacheKey, plan, valid } from './plan.js';
const base = () => new URL('./', document.baseURI).href;
let manifestJob, setupJob, active = null, cancelRequested = false;
const emit = detail => window.dispatchEvent(new CustomEvent('wv-tools-status', { detail }));
export function getManifest() {
  return manifestJob ||= fetch(new URL('tools-manifest.json', base())).then(r => {
    if (!r.ok) throw new Error('فهرست ابزارها پیدا نشد؛ ابتدا بیلد برنامه را بسازید.');
    return r.json().then(m => { navigator.serviceWorker?.controller?.postMessage({ type:'reset-manifest' }); return m; });
  }).catch(e => { manifestJob = null; throw e; });
}
export function setupTools() {
  return setupJob ||= (async () => {
    if (!window.isSecureContext || !navigator.serviceWorker || !globalThis.caches || !globalThis.Worker) {
      throw new Error('ذخیرهٔ آفلاین ابزارها در این مرورگر/WebView پشتیبانی نمی‌شود. از HTTPS یا WebView به‌روز استفاده کنید.');
    }
    let registration, registerTimer;
    try {
      registration = await Promise.race([
        navigator.serviceWorker.register(new URL('tools-sw.js', base()), { scope:new URL('./', base()).pathname }),
        new Promise((_, reject) => { registerTimer = setTimeout(() => reject(new Error('ServiceWorker registration timed out')), 12000); }),
      ]);
    } catch (error) {
      const nativeAndroid = window.Capacitor?.getPlatform?.() === 'android';
      const hint = nativeAndroid
        ? 'اتصال فایل‌های داخلی ابزارها به WebView برقرار نشد. APK اصلاح‌شده را با همان امضا نصب کنید؛ پاک کردن داده‌ها لازم نیست.'
        : 'اتصال حافظهٔ آفلاین ابزارها برقرار نشد. دسترسی مرورگر به فایل tools-sw.js را بررسی کنید.';
      throw new Error(hint + '\n' + String(error?.message || error));
    } finally { clearTimeout(registerTimer); }
    if (!navigator.serviceWorker.controller) {
      await new Promise((resolve, reject) => {
        const done = () => { clearTimeout(timer); navigator.serviceWorker.removeEventListener('controllerchange', done); resolve(); };
        const timer = setTimeout(() => { navigator.serviceWorker.removeEventListener('controllerchange', done); reject(new Error('اتصال حافظهٔ ابزارها آماده نشد؛ برنامه را دوباره باز کنید.')); }, 12000);
        navigator.serviceWorker.addEventListener('controllerchange', done);
        if (navigator.serviceWorker.controller) done();
      });
    }
    return registration;
  })().catch(e => { setupJob = null; throw e; });
}
export async function missingFiles(ids) {
  const manifest = await getManifest(), cache = await caches.open(CACHE);
  const files = plan(manifest, ids), missing = [];
  for (const f of files) if (!valid(await cache.match(cacheKey(f, base())), f)) missing.push(f);
  return missing;
}
export async function requireTools(ids) {
  await setupTools();
  const missing = await missingFiles(ids);
  if (missing.length) {
    window.dispatchEvent(new CustomEvent('wv-tools-needed', { detail:{ ids } }));
    throw new Error('ابزار نصب نیست؛ از «مدیریت ابزارها» دانلود اختیاری را انتخاب کنید.');
  }
  return getManifest();
}
export async function runtimeBase(id) {
  const m = await requireTools([id]);
  const folder = id === 'ffmpeg' ? `ffmpeg/${m.ffmpegVersion}/` : `pyodide/${m.pythonVersion}/`;
  return new URL('runtime/' + folder, base()).href;
}
export function downloadTools(ids) {
  if (active) return Promise.reject(new Error('یک دانلود دیگر در حال انجام است.'));
  cancelRequested = false;
  // Lock before awaiting setup so two buttons cannot create concurrent workers.
  const job = (async () => {
    await setupTools();
    if (cancelRequested) throw new Error('دانلود لغو شد');
    const files = await missingFiles(ids);
    if (!files.length) { emit({ type:'done' }); return; }
    const required = files.reduce((s,f) => s + f.bytes, 0);
    const estimate = await navigator.storage?.estimate?.();
    if (estimate?.quota && estimate.quota - (estimate.usage || 0) < required * 1.2) throw new Error('فضای کافی برای ابزارهای انتخاب‌شده نیست.');
    try { await navigator.storage?.persist?.(); } catch { /* best effort; explain storage limits in UI */ }
    if (cancelRequested) throw new Error('دانلود لغو شد');
    await new Promise((resolve, reject) => {
      const worker = new Worker(new URL('./download-worker.js', import.meta.url), { type:'module' });
      const stop = () => worker.postMessage({ type:'cancel' });
      window.addEventListener('wv-tools-cancel', stop);
      const finish = (error) => {
        worker.terminate(); window.removeEventListener('wv-tools-cancel', stop);
        if (error) reject(error); else resolve();
      };
      worker.onerror = e => finish(new Error(e.message || 'اتصال به دانلودکننده قطع شد'));
      worker.onmessage = ({ data }) => {
        emit(data);
        if (data.type === 'done') finish();
        if (data.type === 'error') finish(new Error(data.message));
      };
      worker.postMessage({ files, base:base() });
    });
  })();
  active = job;
  return job.finally(() => {
    active = null;
    window.dispatchEvent(new Event('wv-tools-changed'));
  });
}
export function cancelDownload() { cancelRequested = true; window.dispatchEvent(new Event('wv-tools-cancel')); }
export const downloadActive = () => !!active;
