/**
 * ردیاب بوم: یک ctx واسط که هر دستور رسم را (در فضای قاب اصلی) ثبت می‌کند.
 * برای «تشخیص خودکار افکت‌ها» در کدهای وارد‌شده (pycairo و بوم JS) استفاده می‌شود.
 * رویدادها:
 *   text  { s, x, y, size, sx, sy, a, c, mono, op, clip, stroke, align }
 *   fill / stroke / clip  { arcs, small, maxR, rects, lines, moves, wedge, rw, rh, c, a, op, n }
 *   paint { c, stops, a }       (پر کردن کل قاب)
 */
const hx = n => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0').toUpperCase();
export function parseColor(st) {
  if (st && typeof st === 'object') return { c: st.__stops ? 'grad' : 'grad', a: 1, stops: st.__stops || null };
  const s = String(st || '#000');
  let m = /^#([0-9a-f]{6})$/i.exec(s);
  if (m) return { c: '#' + m[1].toUpperCase(), a: 1 };
  m = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)$/i.exec(s);
  if (m) return { c: '#' + hx(+m[1]) + hx(+m[2]) + hx(+m[3]), a: m[4] == null ? 1 : +m[4] };
  return { c: s, a: 1 };
}
const fontPx = f => { const m = /([\d.]+)px/.exec(f || ''); return m ? +m[1] : 10; };

export function makeTracer(real, W0, H0) {
  const T = { ev: [], inv: new DOMMatrix(), depth: 0, stack: [], ps: null, W0, H0 };
  const newPS = () => ({ arcs: 0, small: 0, maxR: 0, rects: 0, lines: 0, moves: 0, wedge: false, rw: 0, rh: 0, ops: 0, m0: null, pts: [] });
  T.ps = newPS();
  const M = () => T.inv.multiply(real.getTransform());
  const scl = m => Math.sqrt(Math.abs(m.a * m.d - m.b * m.c)) || 1;
  const sum = (k, extra) => {
    const ps = T.ps, col = parseColor(k === 'stroke' ? real.strokeStyle : real.fillStyle);
    const e = { k, arcs: ps.arcs, small: ps.small, maxR: ps.maxR, rects: ps.rects, lines: ps.lines, moves: ps.moves, wedge: ps.wedge, rw: ps.rw, rh: ps.rh,
      c: col.c, stops: col.stops, a: col.a * real.globalAlpha, op: real.globalCompositeOperation, clip: T.depth, lw: k === 'stroke' ? real.lineWidth * scl(M()) : 0, ...extra };
    if (k === 'clip' || (ps.lines >= 2 && ps.lines <= 6 && !ps.arcs && !ps.rects)) e.pts = ps.pts.slice(0, 8);
    T.ev.push(e);
  };
  const point = (x, y) => { const p = M().transformPoint({ x, y }); return [p.x, p.y]; };
  const textEv = (s, x, y, stroke) => {
    const m = M(), p = m.transformPoint({ x, y }), sx = Math.hypot(m.a, m.b), sy = Math.hypot(m.c, m.d), f = real.font || '';
    const col = parseColor(stroke ? real.strokeStyle : real.fillStyle);
    T.ev.push({ k: 'text', s: String(s), x: p.x, y: p.y, sx, sy, size: fontPx(f) * sy, a: col.a * real.globalAlpha, c: col.c, mono: /mono|courier|consol|menlo/i.test(f),
      op: real.globalCompositeOperation, clip: T.depth, stroke: !!stroke, align: real.textAlign, rot: Math.atan2(m.b, m.a) });
  };
  const H = {
    beginPath: () => { T.ps = newPS(); real.beginPath(); },
    moveTo: (x, y) => { const ps = T.ps; ps.moves++; ps.ops++; if (ps.ops === 1) ps.m0 = [x, y]; if (ps.pts.length < 8) ps.pts.push(point(x, y)); real.moveTo(x, y); },
    lineTo: (x, y) => { const ps = T.ps; ps.lines++; ps.ops++; if (ps.pts.length < 8) ps.pts.push(point(x, y)); real.lineTo(x, y); },
    arc: (x, y, r, a0, a1, ccw) => {
      const ps = T.ps, rr = r * scl(M());
      ps.arcs++; ps.ops++; if (rr < 16) ps.small++; ps.maxR = Math.max(ps.maxR, rr);
      if (ps.ops === 2 && ps.m0 && Math.hypot(ps.m0[0] - x, ps.m0[1] - y) < 1e-3 * (1 + Math.abs(r))) ps.wedge = true;
      real.arc(x, y, r, a0, a1, ccw);
    },
    ellipse: (...a) => { const ps = T.ps; ps.arcs++; ps.ops++; real.ellipse(...a); },
    rect: (x, y, w, h) => { const ps = T.ps, m = M(); ps.rects++; ps.ops++; ps.rw = Math.max(ps.rw, Math.abs(w) * Math.hypot(m.a, m.b)); ps.rh = Math.max(ps.rh, Math.abs(h) * Math.hypot(m.c, m.d)); real.rect(x, y, w, h); },
    roundRect: (x, y, w, h, r) => { const ps = T.ps; ps.rects++; ps.ops++; real.roundRect(x, y, w, h, r); },
    fill: (...a) => { sum('fill'); real.fill(...a); },
    stroke: (...a) => { sum('stroke'); real.stroke(...a); },
    clip: (...a) => { sum('clip'); T.depth++; real.clip(...a); },
    save: () => { T.stack.push(T.depth); real.save(); },
    restore: () => { if (T.stack.length) T.depth = T.stack.pop(); real.restore(); },
    fillRect: (x, y, w, h) => {
      const m = M(), aw = Math.abs(w) * Math.hypot(m.a, m.b), ah = Math.abs(h) * Math.hypot(m.c, m.d), col = parseColor(real.fillStyle);
      if (aw >= W0 * 0.95 && ah >= H0 * 0.95) T.ev.push({ k: 'paint', c: col.c, stops: col.stops, a: col.a * real.globalAlpha, op: real.globalCompositeOperation, clip: T.depth });
      else T.ev.push({ k: 'fill', arcs: 0, small: 0, maxR: 0, rects: 1, lines: 0, moves: 0, rw: aw, rh: ah, c: col.c, a: col.a * real.globalAlpha, op: real.globalCompositeOperation, clip: T.depth });
      real.fillRect(x, y, w, h);
    },
    fillText: (s, x, y, mw) => { textEv(s, x, y, false); mw === undefined ? real.fillText(s, x, y) : real.fillText(s, x, y, mw); },
    strokeText: (s, x, y, mw) => { textEv(s, x, y, true); mw === undefined ? real.strokeText(s, x, y) : real.strokeText(s, x, y, mw); },
  };
  const cache = new Map();
  const proxy = new Proxy(real, {
    get(o, k) {
      if (k in H) return H[k];
      const v = real[k];
      if (typeof v !== 'function') return v;
      let f = cache.get(k); if (!f) { f = v.bind(real); cache.set(k, f); } return f;
    },
    set(o, k, v) { try { real[k] = v; } catch { /* */ } return true; },
  });
  return {
    ctx: proxy,
    /** شروع یک فریم: تبدیل فعلی ctx = فضای قاب اصلی */
    begin() { T.ev = []; T.depth = 0; T.stack = []; T.ps = newPS(); T.inv = real.getTransform().inverse(); },
    end() { return T.ev; },
  };
}
