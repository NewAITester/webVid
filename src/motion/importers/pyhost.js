/**
 * میزبان کارگر پایتون (رشتهٔ اصلی)
 * ─────────────────────────────────────────────────────────────
 * قبلاً هر بار که بوم کشیده می‌شد، کد پایتون همان لحظه روی رشتهٔ اصلی اجرا می‌شد؛
 * کد سنگین (PIL، numpy، matplotlib، …) کل برنامه را کند و پخش را پرپرش می‌کرد.
 * حالا:
 *  • پایتون در pyworker.js (پس‌زمینه) اجرا می‌شود و رابط هیچ‌وقت قفل نمی‌شود؛
 *  • فریم‌های ساخته‌شده نگه داشته می‌شوند (LRU، ImageBitmap) ← پخش دوباره روان است؛
 *  • فریم‌های بعدی از قبل ساخته می‌شوند (پیش‌خوانی) و تا فریم دقیق برسد نزدیک‌ترین
 *    فریم آماده نمایش داده می‌شود؛ خروجی ویدیو (domSettle) برای هر فریم صبر می‌کند.
 */
import { addPending } from './domframes.js';
import { pyodideBase } from './pyreal.js';
import { webfontsBase } from '../webfonts.js';

const BUDGET = (globalThis.WV_PY_CACHE_MB || 320) * 1024 * 1024;
const AHEAD = 12;
const STEPS = [320, 480, 640, 960, 1280, 1600, 1920, 2560, 3840];

let worker = null, wfail = null, ready = false, initP = null, seq = 0;
const calls = new Map();
const cache = new Map();         // key ← { sk, fi, w, bmp, bytes }
let bytes = 0;
const srcs = new Map();          // sk ← { err, warned }
const waiters = new Map();       // key ← [resolve]
let want = null, busy = false;

const fire = () => { try { window.dispatchEvent(new Event('wv-dom-frame')); } catch { /* */ } };
const abs = u => { try { return new URL(u, document.baseURI).href; } catch { return u; } };
const hashStr = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return (h >>> 0).toString(36) + ':' + s.length; };

export function hostAvailable() {
  if (wfail || globalThis.WV_PY_NO_WORKER || globalThis.WV_NO_REAL_PY) return false;
  return typeof document !== 'undefined' && typeof Worker !== 'undefined' && typeof OffscreenCanvas !== 'undefined' && typeof createImageBitmap === 'function';
}
export const hostState = () => (wfail ? 'failed' : ready ? 'ready' : worker ? 'loading' : 'idle');

function fail(msg) {
  if (!wfail) { wfail = msg || 'worker failed'; console.warn('کارگر پایتون — اجرای مستقیم:', wfail); }
  for (const c of calls.values()) c.rej(new Error(wfail));
  calls.clear();
  for (const list of waiters.values()) list.forEach(f => f());
  waiters.clear();
  try { worker?.terminate(); } catch { /* */ }
  fire();
}
function call(msg, transfer) {
  return new Promise((res, rej) => {
    const id = ++seq;
    calls.set(id, { res, rej });
    worker.postMessage({ ...msg, id }, transfer || []);
  });
}
function getWorker() {
  if (worker || wfail) return wfail ? null : worker;
  try { worker = new Worker(new URL('./pyworker.js', import.meta.url), { type: 'module' }); } catch (e) { fail(String(e?.message || e)); return null; }
  worker.onmessage = ev => {
    const m = ev.data, c = calls.get(m.id);
    if (!c) return;
    calls.delete(m.id);
    if (m.err != null) c.rej(Object.assign(new Error(m.err), { py: true })); else c.res(m);
  };
  worker.onerror = e => { e.preventDefault?.(); fail(e.message || 'worker error'); };
  initP = call({ type: 'init', py: abs(pyodideBase()), fonts: abs(webfontsBase()) })
    .then(r => { if (r.ok) { ready = true; fire(); } else fail(r.reason || 'Python unavailable'); return r.ok; }, e => { fail(String(e?.message || e)); return false; });
  return worker;
}

/** اندازهٔ خروجی: کوچک‌ترین پله‌ای که از اندازهٔ واقعی روی بوم کمتر نیست */
export function hostWidth(need, W0) {
  const cap = Math.max(16, Math.min(3840, W0 * 2));
  for (const s of STEPS) if (s >= need * 0.98) return Math.min(s, cap);
  return cap;
}

function put(k, e) {
  if (cache.has(k)) drop(k);
  cache.set(k, e); bytes += e.bytes;
  for (const [ok] of cache) { if (bytes <= BUDGET || cache.size <= 2) break; drop(ok); }
}
function drop(k) { const e = cache.get(k); if (!e) return; cache.delete(k); bytes -= e.bytes; try { e.bmp.close(); } catch { /* */ } }
function settle(k) { const l = waiters.get(k); if (l) { waiters.delete(k); l.forEach(f => f()); } }

/** کار بعدی: اول فریم خواسته‌شده، بعد چند فریم جلوتر */
function nextJob() {
  const W = want;
  if (!W || srcs.get(W.sk)?.err) return null;
  const max = Math.max(0, Math.ceil(W.dur * W.fps) - 1);
  const ahead = Math.max(0, Math.min(AHEAD, Math.floor(BUDGET / (W.w * W.h * 4) / 3)));
  for (let i = 0; i <= ahead; i++) {
    const fi = Math.min(max, W.fi + i), k = `${W.sk}|${fi}|${W.w}`;
    if (!cache.has(k)) return { ...W, fi, k };
    if (fi === max) break;
  }
  return null;
}
async function pump() {
  if (busy) return;
  busy = true;
  try {
    if (!(await initP)) return;
    let J;
    while ((J = nextJob())) {
      try {
        const r = await call({ type: 'frame', src: J.src, fnName: J.fnName, fn: J.fn, t: J.fi / J.fps, w: J.w, h: J.h,
          opt: { fps: J.fps, dur: J.dur, W0: J.W0, H0: J.H0 } });
        put(J.k, { sk: J.sk, fi: J.fi, w: J.w, bmp: r.bmp, bytes: J.w * J.h * 4 });
        if (r.warning) { const S = srcs.get(J.sk); if (S && !S.warned) { S.warned = true; console.warn('پایتون:', r.warning); } }
      } catch (e) {
        if (wfail) return;
        const S = srcs.get(J.sk);
        if (S) S.err = e;
        console.warn('پایتون واقعی (فریم):', e);
        fire();
      }
      settle(J.k);
      if (want && J.fi === want.fi && J.sk === want.sk) fire();
    }
  } finally {
    busy = false;
    for (const k of [...waiters.keys()]) if (cache.has(k) || wfail || srcs.get(k.split('|').slice(0, 2).join('|'))?.err) settle(k);
  }
}

const fnInfo = f => ({ name: f.name, anim: !!f.anim, mode: f.mode, ctxArg: !!f.ctxArg, surfArg: !!f.surfArg, extra: [...(f.extra || [])] });

/**
 * فریم لحظهٔ t: { bmp } (دقیق یا نزدیک‌ترین آماده) | { wait } | { error } | { fail }
 * inst: نمونهٔ pyframes (src، fn، fps، dur، W0، H0)
 */
export function hostFrame(inst, t, outW) {
  if (!getWorker()) return { fail: true };
  const fnName = inst.fn.anim ? '__wv_anim__' : inst.fn.name;
  const sk = hashStr(inst.src) + '|' + fnName;
  let S = srcs.get(sk);
  if (!S) { srcs.set(sk, (S = { err: null, warned: false })); if (srcs.size > 16) srcs.delete(srcs.keys().next().value); }
  if (S.err) return { error: S.err };
  const fps = inst.fps || 30, W0 = inst.W0, H0 = inst.H0;
  const fi = Math.max(0, Math.round(t * fps));
  const w = Math.max(16, Math.round(outW)), h = Math.max(16, Math.round(outW * H0 / W0));
  const k = `${sk}|${fi}|${w}`;
  want = { sk, src: inst.src, fnName, fn: fnInfo(inst.fn), fps, dur: inst.dur || 10, W0, H0, w, h, fi };
  // فقط آخرین فریم خواسته‌شده حتماً ساخته می‌شود؛ منتظران قبلی آزاد (تا خروجی گیر نکند)
  for (const k0 of [...waiters.keys()]) if (k0 !== k) settle(k0);
  const hit = cache.get(k);
  if (hit) { cache.delete(k); cache.set(k, hit); pump(); return { bmp: hit.bmp, exact: true }; }
  // منتظر این فریم (خروجی ویدیو با domSettle صبر می‌کند)
  addPending(new Promise(res => {
    const l = waiters.get(k) || [];
    l.push(res); waiters.set(k, l);
    setTimeout(res, 120000);
  }));
  pump();
  // نزدیک‌ترین فریم آماده از همین کد
  let best = null;
  for (const e of cache.values()) {
    if (e.sk !== sk) continue;
    const sc = Math.abs(e.fi - fi) + (e.w === w ? 0 : 0.5) + (e.fi > fi ? 0.25 : 0);
    if (!best || sc < best.sc) best = { sc, e };
  }
  return best ? { bmp: best.e.bmp, exact: false } : { wait: true };
}

/** صدای کد با پایتون واقعی در کارگر ← بایت‌های WAV | null؛ اگر کارگر نیست undefined */
export async function hostAudio(src, fnName, frameFn) {
  if (!getWorker() || !(await initP)) return undefined;
  const r = await call({ type: 'audio', src, fnName, frameFn });
  return r.wav || null;
}
/** برای آزمون‌ها */
export const _hostDebug = () => ({ cache: cache.size, bytes, ready, wfail, busy, want: want && { fi: want.fi, w: want.w } });
