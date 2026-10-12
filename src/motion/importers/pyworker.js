/**
 * کارگر پایتون واقعی (Web Worker)
 * ─────────────────────────────────────────────────────────────
 * Pyodide و کد پایتون وارد‌شده این‌جا، بیرون از رشتهٔ اصلی صفحه اجرا می‌شوند تا
 * رابط برنامه و پخش هیچ‌وقت منتظر پایتون نمانند. هر فریم روی OffscreenCanvas کشیده
 * و به‌صورت ImageBitmap (بدون کپی) به صفحه فرستاده می‌شود (pyhost.js).
 */
import { loadReal, realInstAsync, realFrame, realAudio, realError } from './pyreal.js';
import { webfontsPending } from '../webfonts.js';

let chain = Promise.resolve();
const reply = (m, tr) => self.postMessage(m, tr || []);

async function handle(m) {
  if (m.type === 'init') {
    if (m.py) globalThis.WV_PYODIDE_URL = m.py;
    if (m.fonts) globalThis.WV_FONTS_URL = m.fonts;
    const py = await loadReal();
    return reply({ id: m.id, ok: !!py, reason: py ? null : realError() });
  }
  if (m.type === 'frame') {
    const RI = await realInstAsync(m.src, m.fnName);
    if (!RI) throw new Error(realError() || 'Python unavailable');
    if (RI.error) throw RI.error;
    const { w, h, opt } = m;
    const c = new OffscreenCanvas(w, h), g = c.getContext('2d');
    const draw = () => {
      g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, w, h);
      g.scale(w / opt.W0, h / opt.H0);
      realFrame(RI, m.fn, g, m.t, opt);
    };
    draw();
    // فونتی که همین حالا خواسته شد ← صبر و کشیدن دوباره (فقط بار اول)
    const fp = webfontsPending();
    if (fp) { await fp; draw(); }
    const bmp = c.transferToImageBitmap();
    return reply({ id: m.id, bmp, warning: RI.warning || null }, [bmp]);
  }
  if (m.type === 'audio') {
    const wav = await realAudio(m.src, m.fnName, m.frameFn);
    if (!wav) return reply({ id: m.id, wav: null });
    const u8 = new Uint8Array(wav);
    return reply({ id: m.id, wav: u8 }, [u8.buffer]);
  }
  throw new Error('unknown message ' + m.type);
}

self.onmessage = ev => {
  const m = ev.data;
  // یکی‌یکی (پایتون یک‌رشته‌ای است و حالت کد بین فریم‌ها مشترک است)
  chain = chain.then(() => handle(m)).catch(e => reply({ id: m.id, err: String(e?.message || e) }));
};
