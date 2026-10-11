import * as REEL from '../../engine/reelfx.js';

/**
 * اجراکنندهٔ «کد وارد‌شده» داخل لایهٔ کد
 * ─────────────────────────────────────────────────────────────
 * کد بوم اصلی (همان render(ctx, t) یا حلقهٔ requestAnimationFrame) را
 * بدون تغییر اجرا می‌کند. document/window/canvas شبیه‌سازی می‌شوند تا
 * کد فکر کند در صفحهٔ خودش است، و هر فریم روی بوم لایه کشیده شود.
 * مقدارهای قابل‌تغییر از $T خوانده می‌شوند (کد بازنویسی‌شده: 1300 ← $T.galaxy_vortex_n).
 */

/** شیء «هرچه بخواهی» برای چیزهایی که در برنامه وجود ندارند (دکمه، صدا، …) */
export function deep() {
  const f = function () {};
  return new Proxy(f, {
    get: (o, k) => (k === Symbol.toPrimitive ? () => 0 : k === 'then' ? undefined : k === 'length' ? 0
      : k === 'toString' || k === 'valueOf' ? () => '' : k === Symbol.iterator ? function* () {} : deep()),
    set: () => true, apply: () => deep(), construct: () => deep(), has: () => true,
  });
}
/** شیء با حافظه: هر چه رویش بنویسند نگه می‌دارد؛ بقیه deep */
function store(base = {}) {
  const mem = { ...base };
  return new Proxy(mem, { get: (o, k) => (k in o ? o[k] : k === 'then' || typeof k === 'symbol' ? undefined : (o[k] = deep())), set: (o, k, v) => { o[k] = v; return true; } });
}

const REEL_NAMES = Object.keys(REEL).filter(k => k !== 'reelApi');
export { REEL_NAMES };
export const PRELUDE_NAMES = () => [...INJECT];
const INJECT = ['document', 'window', 'self', 'globalThis', 'requestAnimationFrame', 'cancelAnimationFrame', 'setTimeout', 'setInterval',
  'clearTimeout', 'clearInterval', 'performance', 'Date', 'location', 'Audio', 'AudioContext', 'webkitAudioContext', 'fetch', 'alert',
  'localStorage', 'sessionStorage', 'addEventListener', 'removeEventListener', 'innerWidth', 'innerHeight', 'devicePixelRatio', 'navigator', 'history', 'screen'];

function smallCanvas(w, h) {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas'); c.width = w; c.height = h; return c;
}

/** بوم ساختگی + ctx واسط که هر فریم به بوم واقعی لایه وصل می‌شود */
function makeStage(W0, H0) {
  const S = { target: null, base: null, W: W0, H: H0, saves: 0, onText: null };
  const dummy = smallCanvas(4, 4).getContext('2d');
  const cache = new Map();
  const ctx = new Proxy({}, {
    get(o, k) {
      if (k === 'canvas') return canvas;
      const T = S.target || dummy;
      if (k === 'setTransform') return (...a) => { T.setTransform(S.base || new DOMMatrix()); if (a.length === 1 && a[0]) T.transform(a[0].a, a[0].b, a[0].c, a[0].d, a[0].e, a[0].f); else if (a.length >= 6) T.transform(...a); };
      if (k === 'resetTransform') return () => T.setTransform(S.base || new DOMMatrix());
      if (k === 'save') return () => { S.saves++; T.save(); };
      if (k === 'restore') return () => { if (S.saves > 0) { S.saves--; T.restore(); } };
      if ((k === 'fillText' || k === 'strokeText') && S.onText) return (s, ...a) => { S.onText(String(s)); return T[k](s, ...a); };
      const v = T[k];
      if (typeof v !== 'function') return v;
      let b = cache.get(k);
      if (!b || b.T !== T) { b = { T, f: v.bind(T) }; cache.set(k, b); }
      return b.f;
    },
    set(o, k, v) { const T = S.target || dummy; try { T[k] = v; } catch { /* */ } return true; },
  });
  const canvasBase = {
    getContext: () => ctx, addEventListener() {}, removeEventListener() {}, toDataURL: () => '', toBlob() {},
    getBoundingClientRect: () => ({ left: 0, top: 0, x: 0, y: 0, width: S.W, height: S.H, right: S.W, bottom: S.H }),
    style: store(), classList: deep(), dataset: {}, captureStream: () => deep(), requestFullscreen() {}, focus() {},
    textContent: '', value: '', innerHTML: '', nodeName: 'CANVAS', tagName: 'CANVAS',
  };
  const canvas = new Proxy(canvasBase, {
    get: (o, k) => (k === 'width' || k === 'clientWidth' || k === 'offsetWidth' ? S.W : k === 'height' || k === 'clientHeight' || k === 'offsetHeight' ? S.H
      : k in o ? o[k] : typeof k === 'symbol' || k === 'then' ? undefined : (o[k] = deep())),
    set: (o, k, v) => { if (k === 'width') S.W0set = +v; else if (k === 'height') S.H0set = +v; else o[k] = v; return true; },
  });
  return { S, ctx, canvas };
}

/** ساخت یک نمونهٔ اجراشده از برنامه */
function instantiate(program, T, run) {
  const W0 = run.W0 || 1920, H0 = run.H0 || 1080;
  const { S, ctx, canvas } = makeStage(W0, H0);
  const clock = { t: 0 };
  const inst = { S, ctx, canvas, clock, raf: null, intervals: [], timers: [], error: null, out: null, run };
  const RealDate = Date;
  class FakeDate extends RealDate {
    constructor(...a) { if (a.length) super(...a); else super(1767225600000 + clock.t * 1000); }
    static now() { return 1767225600000 + clock.t * 1000; }
  }
  const realDoc = typeof document !== 'undefined' ? document : null;
  const doc = store({
    getElementById: () => canvas, querySelector: s => (/canvas|#/.test(String(s)) ? canvas : deep()), querySelectorAll: s => (/canvas/.test(String(s)) ? [canvas] : []),
    getElementsByTagName: t => (/canvas/i.test(t) ? [canvas] : []),
    createElement: tag => (/^canvas$/i.test(tag) && realDoc ? realDoc.createElement('canvas') : store({ style: store(), classList: deep(), appendChild() {}, addEventListener() {}, setAttribute() {}, click() {} })),
    createElementNS: () => deep(), addEventListener() {}, removeEventListener() {}, body: store({ appendChild() {}, classList: deep(), style: store() }),
    documentElement: store({ style: store() }), head: store({ appendChild() {} }), readyState: 'complete', hidden: false, visibilityState: 'visible',
    fonts: { ready: Promise.resolve(), load: () => Promise.resolve([]), add() {}, check: () => true, addEventListener() {} },
  });
  const mem = new Map();
  const g = {
    document: doc, location: { search: '', hash: '', href: 'about:blank', pathname: '/', origin: '' },
    requestAnimationFrame: cb => { inst.raf = cb; return 1; }, cancelAnimationFrame() {},
    setTimeout: (fn, ms) => { if (typeof fn === 'function') inst.timers.push([fn, +ms || 0]); return inst.timers.length; },
    setInterval: (fn, ms) => { if (typeof fn === 'function') inst.intervals.push([fn, +ms || 16]); return inst.intervals.length; },
    clearTimeout() {}, clearInterval() {},
    performance: { now: () => clock.t * 1000, mark() {}, measure() {} }, Date: FakeDate,
    Audio: function () { return deep(); }, AudioContext: function () { return deep(); }, webkitAudioContext: function () { return deep(); },
    fetch: () => new Promise(() => {}), alert() {}, addEventListener() {}, removeEventListener() {},
    localStorage: { getItem: k => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: k => mem.delete(k), clear: () => mem.clear() },
    innerWidth: W0, innerHeight: H0, devicePixelRatio: 1, navigator: typeof navigator !== 'undefined' ? navigator : deep(), history: deep(), screen: { width: W0, height: H0 },
  };
  g.sessionStorage = g.localStorage;
  const win = new Proxy(g, {
    get: (o, k) => (k in o ? o[k] : k === 'OfflineAudioContext' || k === 'webkitOfflineAudioContext' ? globalThis.OfflineAudioContext : k in globalThis ? globalThis[k] : undefined),
    set: (o, k, v) => { o[k] = v; return true; },
  });
  g.window = g.self = g.globalThis = win;
  const declared = new Set(run.declared || []);
  const pre = [];
  for (const k of INJECT) if (!declared.has(k)) pre.push(`var ${k} = $rt.g.${k};`);
  for (const k of REEL_NAMES) if (!declared.has(k) && (run.uses || REEL_NAMES).includes(k)) pre.push(`var ${k} = $rt.reel.${k};`);
  const valNames = ['DURATION', 'DUR', 'duration', 'LENGTH', 'TOTAL', 'TOTAL_TIME', 'BPM', 'bpm', 'TEMPO', 'FPS', 'fps', 'BAR', 'ORDER'];
  const mainRef = run.fn ? `typeof ${run.fn} === 'function' ? ${run.fn} : null` : 'null';
  const holder = run.holder ? `typeof ${run.holder} !== 'undefined' ? ${run.holder} : undefined` : 'undefined';
  const epi = `\n;return { main: ${mainRef}, holder: ${holder}, synth: typeof synthTrack === 'function' ? synthTrack : null, wav: typeof wavBytes === 'function' ? wavBytes : null, vals: { ${valNames.map(k => `${k}: typeof ${k} !== 'undefined' ? ${k} : undefined`).join(', ')} } };`;
  const $rt = { g, reel: run.reelSpy || REEL, mod: p => (/reelfx/.test(p) ? REEL : deep()) };
  S.target = run.initTarget || null;
  try {
    // eslint-disable-next-line no-new-func
    const fac = new Function('$T', '$rt', pre.join('\n') + '\n' + program + epi);
    inst.out = fac(T, $rt);
    for (const [fn] of inst.timers.splice(0)) { try { fn(0); } catch (err) { inst.error ||= err; } }
  } catch (err) { inst.error = err; inst.out = inst.out || { main: null, holder: undefined, vals: {} }; }
  S.target = null;
  inst.lastRaf = inst.raf;
  return inst;
}

/** آرگومان‌های تابع اصلی از روی نام پارامترها */
function argsFor(params, ctx, t, W, H, fps = 30) {
  return (params || []).map((p, i) => {
    const n = String(p).replace(/=.*$/, '').trim();
    if (/^(ctx|c|g|cx|context|x|ctx2d|context2d|gfx)$/i.test(n) && i === 0) return ctx;
    if (/^(ctx|context|gfx)$/i.test(n)) return ctx;
    if (/^(t|time|sec|secs|seconds|s|now|tt|u|currentTime|elapsed|progressTime)$/.test(n)) return t;
    if (/^(ms|timestamp|ts|millis|stamp|tms)$/i.test(n)) return t * 1000;
    if (/^(W|w|width|cw|WIDTH)$/.test(n)) return W;
    if (/^(H|h|height|ch|HEIGHT)$/.test(n)) return H;
    if (/^(f|frame|fr|i|n|fi|frameIndex|frameNo)$/.test(n)) return Math.round(t * fps);
    if (/^(p|progress)$/.test(n)) return undefined;
    return undefined;
  });
}

/** یک فریم از نمونه روی ctx (مبدأ گوشهٔ بالا-چپ، اندازه w×h) */
function frame(inst, ctx, t, w, h) {
  const run = inst.run, { S } = inst;
  const W0 = run.W0 || 1920, H0 = run.H0 || 1080;
  ctx.save();
  let W = w, H = h;
  if (!run.adaptive) {
    const s = run.fit === 'contain' ? Math.min(w / W0, h / H0) : Math.max(w / W0, h / H0);
    ctx.translate((w - W0 * s) / 2, (h - H0 * s) / 2); ctx.scale(s, s); W = W0; H = H0;
  }
  S.W = W; S.H = H; S.base = ctx.getTransform(); S.target = ctx; S.saves = 0;
  inst.clock.t = t;
  const pass = run.passProxy ? inst.ctx : ctx;
  try {
    if (run.mode === 'call' && inst.out.main) inst.out.main(...argsFor(run.params, pass, t, W, H, run.fps));
    else if (run.mode === 'raf') {
      const cb = inst.raf || inst.lastRaf; inst.raf = null;
      if (cb) cb(t * 1000);
      inst.lastRaf = inst.raf || cb;
    } else if (run.mode === 'interval') for (const [fn] of inst.intervals) fn();
  } finally {
    while (S.saves > 0) { S.saves--; ctx.restore(); }
    S.target = null;
    ctx.restore();
  }
}

const _inst = new Map();
/**
 * از لایهٔ کد صدا زده می‌شود:  return e.runImported(ctx, e, PROGRAM, $T, RUN)
 * RUN: { mode: 'call'|'raf'|'interval'|'static', fn, params, W0, H0, adaptive, start, holder, declared, uses }
 */
export function runImported(ctx, e, program, T, run) {
  const w = e.w, h = e.h, t = (run.start || 0) + e.t;
  ctx.save(); ctx.translate(-w / 2, -h / 2);
  try {
    if (run.mode === 'static') {
      const W0 = run.W0 || 1920, H0 = run.H0 || 1080;
      const s = Math.max(w / W0, h / H0);
      ctx.translate((w - W0 * s) / 2, (h - H0 * s) / 2); ctx.scale(s, s);
      instantiate(program, T, { ...run, initTarget: ctx });
      return;
    }
    const key = program.length + ':' + hashStr(program) + JSON.stringify(T) + run.mode + (run.fn || '');
    let inst = _inst.get(key);
    if (!inst) {
      inst = instantiate(program, T, run);
      if (_inst.size > 24) _inst.delete(_inst.keys().next().value);
      _inst.set(key, inst);
    }
    if (inst.error && !inst.out?.main && run.mode === 'call') throw inst.error;
    frame(inst, ctx, t, w, h);
  } finally { ctx.restore(); }
}
function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i += 7) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; }

/**
 * تحلیل اجرایی: کد را با فریم‌های نمونه اجرا می‌کند تا بفهمد کدام صحنه کی پخش
 * می‌شود، چه المان‌هایی صدا زده می‌شوند و چه متن‌هایی کشیده می‌شوند.
 * @returns {{ ok, error, duration, bpm, segments:[{key,label,t0,t1,calls,texts}], hasAudio, thumbs }}
 */
export function analyzeRun(program, T, run, { duration: durHint, thumbs = true, fps = 15 } = {}) {
  const calls = new Map(); let curSeg = null;
  const reelSpy = {};
  for (const k of REEL_NAMES) {
    const f = REEL[k];
    reelSpy[k] = typeof f === 'function' && /^[a-z]/.test(k) && !['clamp', 'hash', 'lerp', 'rgba', 'mixHex', 'envFromBeats', 'envFromSong'].includes(k)
      ? function (...a) { if (curSeg != null) { const m = calls.get(curSeg) || {}; m[k] = (m[k] || 0) + 1; calls.set(curSeg, m); } return f.apply(this, a); }
      : f;
  }
  const inst = instantiate(program, T, { ...run, reelSpy });
  const out = { ok: true, error: inst.error ? String(inst.error.message || inst.error) : null, duration: 0, bpm: null, segments: [], hasAudio: !!inst.out?.synth, thumbs: {} };
  if (run.mode === 'call' && !inst.out?.main) { out.ok = false; out.error ||= `تابع ${run.fn} پیدا نشد`; return out; }
  const v = inst.out?.vals || {};
  let dur = [v.DURATION, v.DUR, v.duration, v.LENGTH, v.TOTAL, v.TOTAL_TIME].find(x => typeof x === 'number' && x > 0 && x < 3600);
  if (!dur && Array.isArray(v.ORDER) && typeof v.BAR === 'number') dur = v.ORDER.length * v.BAR;
  dur = dur || durHint || 10;
  out.duration = dur; out.durationFound = !!(dur && dur !== 10) || !!durHint;
  out.bpm = [v.BPM, v.bpm, v.TEMPO].find(x => typeof x === 'number' && x > 20 && x < 400) || null;
  // جاسوسی روی صحنه‌ها
  const H = inst.out?.holder;
  let active = null, depth = 0;
  const keys = [];
  const spy = (obj, k, key) => {
    const f = obj[k];
    if (typeof f !== 'function') return;
    obj[k] = function (...a) { if (depth === 0 && active == null) active = key; depth++; try { return f.apply(this, a); } finally { depth--; } };
    keys.push(key);
  };
  if (H && run.holderKind === 'obj') for (const k of Object.keys(H)) spy(H, k, k);
  else if (H && run.holderKind === 'arr' && Array.isArray(H)) H.forEach((it, i) => { if (typeof it === 'function') spy(H, i, String(i)); else if (it && typeof it === 'object') { const fk = Object.keys(it).find(q => typeof it[q] === 'function'); if (fk) spy(it, fk, String(i)); } });
  const cv = smallCanvas(192, 108), c2 = cv.getContext('2d');
  const texts = new Map();
  inst.S.onText = s => { if (curSeg != null) { const m = texts.get(curSeg) || new Map(); m.set(s, (m.get(s) || 0) + 1); texts.set(curSeg, m); } };
  run = { ...run, passProxy: true };
  inst.run = run;
  const probe = t => { active = null; depth = 0; c2.clearRect(0, 0, 192, 108); try { frame(inst, c2, t, 192, 108); } catch (err) { out.error ||= String(err?.message || err); } return active ?? '__'; };
  const N = Math.max(2, Math.ceil(dur * fps)), seq = [];
  for (let i = 0; i <= N; i++) { const t = Math.min(dur - 1e-4, (i / N) * dur); curSeg = null; const a = probe(t); seq.push([t, a]); }
  // بخش‌ها + مرز دقیق با دوبخشی
  const segs = [];
  for (let i = 0; i < seq.length; i++) {
    const [t, a] = seq[i];
    if (!segs.length || segs[segs.length - 1].key !== a) {
      let t0 = t;
      if (segs.length) {
        let lo = seq[i - 1][0], hi = t;
        for (let k = 0; k < 8; k++) { const m = (lo + hi) / 2; if (probe(m) === a) hi = m; else lo = m; }
        t0 = hi; segs[segs.length - 1].t1 = t0;
      }
      segs.push({ key: a, t0: i === 0 ? 0 : t0, t1: dur });
    }
  }
  const seen = {};
  for (const s of segs) {
    seen[s.key] = (seen[s.key] || 0) + 1;
    s.n = seen[s.key];
    s.t0 = +s.t0.toFixed(3); s.t1 = +s.t1.toFixed(3);
  }
  // المان‌ها و متن‌های هر بخش
  segs.forEach((s, si) => {
    curSeg = si;
    for (let k = 0; k < 5; k++) { probe(s.t0 + (s.t1 - s.t0) * (k + 0.5) / 5); }
    curSeg = null;
    s.calls = calls.get(si) || {};
    s.texts = [...(texts.get(si) || new Map()).entries()].sort((a, b) => b[1] - a[1]).map(x => x[0]).filter(x => x.trim()).slice(0, 8);
    if (thumbs) {
      try {
        const tc = smallCanvas(192, 108), tx = tc.getContext('2d');
        tx.fillStyle = '#000'; tx.fillRect(0, 0, 192, 108);
        frame(inst, tx, s.t0 + (s.t1 - s.t0) * 0.6, 192, 108);
        out.thumbs[si] = tc;
      } catch { /* */ }
    }
  });
  out.segments = segs.filter(s => s.t1 - s.t0 > 0.01);
  out.inst = inst;
  return out;
}

/** موسیقی کد (synthTrack) ← بایت‌های WAV */
export async function synthAudio(program, T, run) {
  const inst = instantiate(program, T, run);
  if (!inst.out?.synth) return null;
  const buf = await inst.out.synth();
  if (!buf || !buf.getChannelData) return null;
  return wavEncode(buf);
}
export function wavEncode(buf) {
  const ch = buf.numberOfChannels, n = buf.length, sr = buf.sampleRate, dv = new DataView(new ArrayBuffer(44 + n * ch * 2));
  const w = (o, s) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); dv.setUint32(4, 36 + n * ch * 2, true); w(8, 'WAVEfmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, ch, true);
  dv.setUint32(24, sr, true); dv.setUint32(28, sr * ch * 2, true); dv.setUint16(32, ch * 2, true); dv.setUint16(34, 16, true); w(36, 'data'); dv.setUint32(40, n * ch * 2, true);
  const d = [...Array(ch)].map((_, c) => buf.getChannelData(c));
  let o = 44; for (let i = 0; i < n; i++) for (let c = 0; c < ch; c++) { dv.setInt16(o, Math.max(-1, Math.min(1, d[c][i])) * 0x7fff, true); o += 2; }
  return new Uint8Array(dv.buffer);
}
