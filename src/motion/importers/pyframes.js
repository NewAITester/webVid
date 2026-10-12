/**
 * پایتون «فریم‌به‌فریم» با pycairo (+ numpy)
 * ─────────────────────────────────────────────────────────────
 * خود کد پایتون با مفسر داخلی اجرا می‌شود و دستورهای cairo مستقیم روی بوم لایه کشیده
 * می‌شوند — هر فریم تابع render(fi) / make_frame(t) / … همان کد صدا زده می‌شود.
 * پس‌پردازش‌های پیکسلی (OpenCV: bloom، grain، …) اجرا نمی‌شوند: به محض خواندن پیکسل‌های
 * قاب اصلی (get_data) فریم تمام‌شده حساب می‌شود.
 */
import { Interp, PyModule, PyFunc, PyError, Unk, nat, tup, isTuple } from './pyinterp.js';
import { numpyModule, Bytes, ND } from './pynumpy.js';

class FrameDone { }
const num = v => (typeof v === 'number' ? v : typeof v === 'boolean' ? +v : v instanceof ND ? v.data[0] : v == null ? 0 : +v);
function offscreen(w, h) {
  w = Math.max(1, Math.round(w)); h = Math.max(1, Math.round(h));
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas'); c.width = w; c.height = h; return c;
}
let _meas = null;
const measCache = new Map();
function measure(font, s) {
  const key = font + '\u0000' + s;
  let m = measCache.get(key);
  if (m) return m;
  if (!_meas) { _meas = offscreen(8, 8).getContext('2d'); _meas.direction = 'ltr'; _meas.textAlign = 'left'; }
  if (_meas.font !== font) _meas.font = font;
  const r = _meas.measureText(s);
  const L = r.actualBoundingBoxLeft || 0, Rr = r.actualBoundingBoxRight ?? r.width, A = r.actualBoundingBoxAscent || 0, D = r.actualBoundingBoxDescent || 0;
  m = { xb: -L, yb: -A, w: L + Rr, h: A + D, adv: r.width, fa: r.fontBoundingBoxAscent, fd: r.fontBoundingBoxDescent };
  if (s === ' ' || !s.trim()) { m.w = 0; m.h = 0; m.xb = 0; m.yb = 0; }
  if (measCache.size > 6000) measCache.clear();
  measCache.set(key, m);
  return m;
}

/* ── ثابت‌ها ── */
const OPS = ['copy', 'copy', 'source-over', 'source-in', 'source-out', 'source-atop', 'destination-over', 'destination-over', 'destination-in', 'destination-out', 'destination-atop', 'xor', 'lighter', 'lighter',
  'multiply', 'screen', 'overlay', 'darken', 'lighten', 'color-dodge', 'color-burn', 'hard-light', 'soft-light', 'difference', 'exclusion', 'hue', 'saturation', 'color', 'luminosity'];
const OPN = ['CLEAR', 'SOURCE', 'OVER', 'IN', 'OUT', 'ATOP', 'DEST', 'DEST_OVER', 'DEST_IN', 'DEST_OUT', 'DEST_ATOP', 'XOR', 'ADD', 'SATURATE', 'MULTIPLY', 'SCREEN', 'OVERLAY', 'DARKEN', 'LIGHTEN',
  'COLOR_DODGE', 'COLOR_BURN', 'HARD_LIGHT', 'SOFT_LIGHT', 'DIFFERENCE', 'EXCLUSION', 'HSL_HUE', 'HSL_SATURATION', 'HSL_COLOR', 'HSL_LUMINOSITY'];
const CAPS = ['butt', 'round', 'square'], JOINS = ['miter', 'round', 'bevel'];
const FORMATS = { INVALID: -1, ARGB32: 0, RGB24: 1, A8: 2, A1: 3, RGB16_565: 4, RGB30: 5 };
const ns = (name, o) => new PyModule(name, o);

const rgba = (r, g, b, a = 1) => `rgba(${Math.round(Math.max(0, Math.min(1, num(r))) * 255)},${Math.round(Math.max(0, Math.min(1, num(g))) * 255)},${Math.round(Math.max(0, Math.min(1, num(b))) * 255)},${Math.max(0, Math.min(1, num(a)))})`;
function fontFamily(face) {
  const f = String(face || 'sans-serif');
  const generic = /mono|courier|consol|menlo|code/i.test(f) ? 'monospace' : /serif/i.test(f) && !/sans/i.test(f) || /times|georgia|garamond/i.test(f) ? 'serif' : 'sans-serif';
  if (/^(sans|sans-serif|serif|monospace|mono)$/i.test(f)) return generic;
  const alt = generic === 'monospace' ? '"Liberation Mono", "DejaVu Sans Mono", Menlo, Consolas, "Courier New"' : generic === 'serif' ? '"Times New Roman", "Liberation Serif"' : 'Arial, "Liberation Sans", Helvetica';
  return `"${f.replace(/"/g, '')}", ${alt}, ${generic}`;
}

/* ── الگوها ── */
class Pattern {
  constructor(kind, a) { this.kind = kind; this.a = a; this.stops = []; this._m = new Map(); }
  __pyget(name) {
    let f = this._m.get(name);
    if (f) return f;
    const P = this;
    const M = {
      add_color_stop_rgb: ([o, r, g, b]) => { P.stops.push([num(o), rgba(r, g, b, 1)]); return null; },
      add_color_stop_rgba: ([o, r, g, b, a]) => { P.stops.push([num(o), rgba(r, g, b, a)]); return null; },
      set_extend: () => null, set_filter: () => null, set_matrix: () => null, get_extend: () => 0,
    }[name];
    if (!M) return undefined;
    f = nat(M, name); this._m.set(name, f); return f;
  }
  style(g) {
    if (this.kind === 'solid') return this.a[0];
    if (this.kind === 'surface') { try { return g.createPattern(this.a[0].canvas, 'no-repeat'); } catch { return '#000'; } }
    const a = this.a.map(num);
    let gr;
    try { gr = this.kind === 'linear' ? g.createLinearGradient(a[0], a[1], a[2], a[3]) : g.createRadialGradient(a[0], a[1], Math.max(0, a[2]), a[3], a[4], Math.max(0, a[5])); } catch { return '#000'; }
    const st = this.stops.slice().sort((x, y) => x[0] - y[0]);
    for (const [o, c] of st) try { gr.addColorStop(Math.max(0, Math.min(1, o)), c); } catch { /* */ }
    return gr;
  }
}

/* ── سطح (ImageSurface) ── */
class Surface {
  constructor(R, fmt, w, h) {
    this.fmt = num(fmt); this.w = Math.round(num(w)) || 1; this.h = Math.round(num(h)) || 1; this._m = new Map();
    if (R.frame && !R.bound) {                  // اولین سطح داخل تابع فریم ← قاب خروجی = بوم لایه
      R.bound = true; this.target = true; this.g = R.target; this.base = R.base; this.R = R;
      if (this.fmt === 1 || this.fmt === 4) { const g = this.g; g.save(); g.setTransform(this.base); g.fillStyle = '#000'; g.fillRect(0, 0, R.W0, R.H0); g.restore(); }
      this.sx = R.W0 / this.w; this.sy = R.H0 / this.h;
      if (Math.abs(this.sx - 1) > 1e-6 || Math.abs(this.sy - 1) > 1e-6) this.base = this.base.scale(this.sx, this.sy);
    } else {
      if (this.w * this.h > 4.2e6) { this.w = Math.min(this.w, 2048); this.h = Math.min(this.h, 2048); }
      this.canvas = offscreen(this.w, this.h); this.g = this.canvas.getContext('2d', { willReadFrequently: true }); this.base = new DOMMatrix();
      if (this.fmt === 1 || this.fmt === 4) { this.g.fillStyle = '#000'; this.g.fillRect(0, 0, this.w, this.h); }
    }
  }
  __pyget(name) {
    let f = this._m.get(name);
    if (f) return f;
    const S = this;
    const stride = () => (S.fmt === 2 ? (S.w + 3) & ~3 : S.fmt === 3 ? ((S.w + 31) >> 5) * 4 : S.w * 4);
    const M = {
      get_width: () => S.w, get_height: () => S.h, get_format: () => S.fmt, get_stride: stride,
      flush: () => null, mark_dirty: () => null, finish: () => null, set_device_scale: () => null, set_device_offset: () => null,
      get_data: () => {
        if (S.target) throw new FrameDone();
        const id = S.g.getImageData(0, 0, S.w, S.h).data, st = stride();
        if (S.fmt === 2) { const out = new Uint8Array(st * S.h); for (let y = 0; y < S.h; y++) for (let x = 0; x < S.w; x++) out[y * st + x] = id[(y * S.w + x) * 4 + 3]; return new Bytes(out); }
        const out = new Uint8Array(S.w * S.h * 4);
        for (let i = 0; i < out.length; i += 4) { out[i] = id[i + 2]; out[i + 1] = id[i + 1]; out[i + 2] = id[i]; out[i + 3] = S.fmt === 1 ? 255 : id[i + 3]; }
        return new Bytes(out);
      },
      write_to_png: () => { if (S.target) throw new FrameDone(); return null; },
    }[name];
    if (!M) return undefined;
    f = nat(M, name); this._m.set(name, f); return f;
  }
}

/* ── Context ── */
class Ctx {
  constructor(surface) {
    this.s = surface; this.g = surface.g; this.base = surface.base;
    this.font = { face: 'sans-serif', slant: 0, weight: 0, size: 10 }; this.fstr = null; this.stack = [];
    this.cp = null; this.sub = false; this.texts = []; this.rule = 'nonzero'; this.saves = 0; this.src = null;
    this._m = new Map();
    const g = this.g; g.save(); if (surface.target) surface.R.ctxs.push(this); g.setTransform(this.base); g.beginPath(); g.fillStyle = '#000'; g.strokeStyle = '#000'; g.lineWidth = 2; g.lineCap = 'butt'; g.lineJoin = 'miter'; g.globalCompositeOperation = 'source-over'; g.setLineDash([]);
    g.textAlign = 'left'; g.textBaseline = 'alphabetic'; g.direction = 'ltr'; g.globalAlpha = 1; g.shadowBlur = 0; g.shadowColor = 'transparent'; g.filter = 'none'; g.miterLimit = 10; g.lineDashOffset = 0;
    try { g.letterSpacing = '0px'; g.wordSpacing = '0px'; g.fontKerning = 'auto'; } catch { /* */ }
    this.applyFont();
  }
  applyFont() { const F = this.font; this.fstr = `${F.slant === 1 ? 'italic ' : F.slant === 2 ? 'oblique ' : ''}${F.weight ? 'bold ' : ''}${Math.max(0.05, F.size)}px ${fontFamily(F.face)}`; this.g.font = this.fstr; }
  fix() { const c = this.cp; if (c && !c.dev) c.dev = this.g.getTransform().transformPoint({ x: c.x, y: c.y }); }
  getCP() { const c = this.cp; if (!c) return null; if (!c.dev) return c; const p = this.g.getTransform().inverse().transformPoint(c.dev); return { x: p.x, y: p.y }; }
  setCP(x, y) { this.cp = { x, y, dev: null }; }
  clearPath() { this.g.beginPath(); this.texts.length = 0; this.cp = null; this.sub = false; }
  drawTexts(stroke) {
    const g = this.g;
    for (const T of this.texts) { g.save(); g.setTransform(T.m); g.font = T.font; if (stroke) g.strokeText(T.s, T.x, T.y); else g.fillText(T.s, T.x, T.y); g.restore(); }
  }
  srcSurface() { return this.src && this.src.kind === 'surface' ? this.src : null; }
  fillPath(preserve) {
    const g = this.g, sp = this.srcSurface();
    if (sp) { g.save(); g.clip(this.rule); g.drawImage(sp.a[0].canvas, num(sp.a[1]), num(sp.a[2])); g.restore(); }
    else { g.fill(this.rule); if (this.texts.length) this.drawTexts(false); }
    if (!preserve) this.clearPath();
  }
  strokePath(preserve) {
    const g = this.g; g.stroke(); if (this.texts.length) this.drawTexts(true);
    if (!preserve) this.clearPath();
  }
  paint(alpha = 1) {
    const g = this.g, sp = this.srcSurface();
    g.save(); if (alpha < 1) g.globalAlpha = alpha;
    if (sp) g.drawImage(sp.a[0].canvas, num(sp.a[1]), num(sp.a[2]));
    else {
      // مستطیل کل قاب (در فضای کاربر فعلی تا گرادیان‌ها درست بمانند)
      const inv = g.getTransform().inverse().multiply(this.base), W = this.s.target ? this.s.w : this.s.w, H = this.s.h;
      const pts = [[0, 0], [W, 0], [0, H], [W, H]].map(([x, y]) => inv.transformPoint({ x, y }));
      const xs = pts.map(p => p.x), ys = pts.map(p => p.y), x0 = Math.min(...xs), y0 = Math.min(...ys);
      if ([x0, y0].every(Number.isFinite)) g.fillRect(x0 - 2, y0 - 2, Math.max(...xs) - x0 + 4, Math.max(...ys) - y0 + 4);
      else { g.setTransform(this.base); g.fillRect(-2, -2, W + 4, H + 4); }
    }
    g.restore();
  }
  __pyget(name) {
    let f = this._m.get(name);
    if (f) return f;
    const M = CTX[name];
    if (!M) return undefined;
    const C = this;
    f = nat((a, k) => M(C, a, k), name); this._m.set(name, f); return f;
  }
}
const setStyle = (C, st) => { C.g.fillStyle = st; C.g.strokeStyle = st; };
const CTX = {
  set_source_rgb: (C, [r, g, b]) => { C.src = null; setStyle(C, rgba(r, g, b, 1)); return null; },
  set_source_rgba: (C, [r, g, b, a = 1]) => { C.src = null; setStyle(C, rgba(r, g, b, a)); return null; },
  set_source: (C, [p]) => { if (p instanceof Pattern) { C.src = p.kind === 'surface' ? p : null; if (p.kind !== 'surface') setStyle(C, p.style(C.g)); } return null; },
  set_source_surface: (C, [s, x = 0, y = 0]) => { if (s instanceof Surface && s.canvas) C.src = new Pattern('surface', [s, x, y]); return null; },
  get_source: C => C.src || new Pattern('solid', [C.g.fillStyle]),
  paint: C => { C.paint(1); return null; },
  paint_with_alpha: (C, [a]) => { C.paint(Math.max(0, Math.min(1, num(a)))); return null; },
  mask_surface: () => null, mask: () => null,
  move_to: (C, [x, y]) => { x = num(x); y = num(y); C.g.moveTo(x, y); C.setCP(x, y); C.sub = false; return null; },
  line_to: (C, [x, y]) => { x = num(x); y = num(y); if (C.cp || !C.sub) C.g.lineTo(x, y); else C.g.moveTo(x, y); C.setCP(x, y); C.sub = false; return null; },
  rel_move_to: (C, [dx, dy]) => { const p = C.getCP() || { x: 0, y: 0 }; return CTX.move_to(C, [p.x + num(dx), p.y + num(dy)]); },
  rel_line_to: (C, [dx, dy]) => { const p = C.getCP() || { x: 0, y: 0 }; return CTX.line_to(C, [p.x + num(dx), p.y + num(dy)]); },
  curve_to: (C, a) => { const [x1, y1, x2, y2, x3, y3] = a.map(num); if (!C.cp) C.g.moveTo(x1, y1); C.g.bezierCurveTo(x1, y1, x2, y2, x3, y3); C.setCP(x3, y3); C.sub = false; return null; },
  rel_curve_to: (C, a) => { const p = C.getCP() || { x: 0, y: 0 }; const v = a.map(num); return CTX.curve_to(C, [p.x + v[0], p.y + v[1], p.x + v[2], p.y + v[3], p.x + v[4], p.y + v[5]]); },
  arc: (C, a) => arc(C, a, false), arc_negative: (C, a) => arc(C, a, true),
  rectangle: (C, a) => { const [x, y, w, h] = a.map(num); C.g.rect(x, y, w, h); C.setCP(x, y); C.sub = false; return null; },
  close_path: C => { C.g.closePath(); return null; },
  new_path: C => { C.clearPath(); return null; },
  new_sub_path: C => { C.sub = true; C.cp = null; return null; },
  fill: C => { C.fillPath(false); return null; }, fill_preserve: C => { C.fillPath(true); return null; },
  stroke: C => { C.strokePath(false); return null; }, stroke_preserve: C => { C.strokePath(true); return null; },
  clip: C => { C.g.clip(C.rule); C.clearPath(); return null; }, clip_preserve: C => { C.g.clip(C.rule); return null; },
  reset_clip: () => null,
  save: C => { C.g.save(); C.saves++; C.stack.push({ font: { ...C.font }, src: C.src, rule: C.rule }); return null; },
  restore: C => { if (C.saves > 0) { C.fix(); C.g.restore(); C.saves--; const s = C.stack.pop(); C.font = s.font; C.src = s.src; C.rule = s.rule; C.fstr = C.g.font; } return null; },
  translate: (C, [x, y]) => { C.fix(); C.g.translate(num(x), num(y)); return null; },
  scale: (C, [x, y]) => { C.fix(); C.g.scale(num(x), y === undefined ? num(x) : num(y)); return null; },
  rotate: (C, [a]) => { C.fix(); C.g.rotate(num(a)); return null; },
  identity_matrix: C => { C.fix(); C.g.setTransform(C.base); return null; },
  transform: (C, [m]) => { if (m?.m) { C.fix(); C.g.transform(...m.m); } return null; },
  set_matrix: (C, [m]) => { if (m?.m) { C.fix(); C.g.setTransform(C.base); C.g.transform(...m.m); } return null; },
  get_matrix: C => { const m = C.base.inverse().multiply(C.g.getTransform()); return matrix([m.a, m.b, m.c, m.d, m.e, m.f]); },
  user_to_device: (C, [x, y]) => { const p = C.base.inverse().multiply(C.g.getTransform()).transformPoint({ x: num(x), y: num(y) }); return tup([p.x, p.y]); },
  device_to_user: (C, [x, y]) => { const p = C.base.inverse().multiply(C.g.getTransform()).inverse().transformPoint({ x: num(x), y: num(y) }); return tup([p.x, p.y]); },
  set_line_width: (C, [w]) => { C.g.lineWidth = Math.max(0, num(w)) || 0.0001; return null; },
  get_line_width: C => C.g.lineWidth,
  set_line_cap: (C, [c]) => { C.g.lineCap = CAPS[num(c)] || 'butt'; return null; },
  set_line_join: (C, [j]) => { C.g.lineJoin = JOINS[num(j)] || 'miter'; return null; },
  set_miter_limit: (C, [m]) => { C.g.miterLimit = num(m); return null; },
  set_dash: (C, [d, off = 0]) => { try { C.g.setLineDash(d instanceof Unk ? [] : [...(d?.__iter ? d.__iter() : d || [])].map(num)); C.g.lineDashOffset = num(off); } catch { /* */ } return null; },
  set_fill_rule: (C, [r]) => { C.rule = num(r) === 1 ? 'evenodd' : 'nonzero'; return null; },
  set_operator: (C, [o]) => { C.g.globalCompositeOperation = OPS[num(o)] || 'source-over'; return null; },
  get_operator: C => Math.max(0, OPS.indexOf(C.g.globalCompositeOperation)),
  set_antialias: () => null, set_tolerance: () => null, push_group: () => null, pop_group_to_source: () => null, set_font_options: () => null,
  select_font_face: (C, [face = 'sans-serif', slant = 0, weight = 0]) => { C.font.face = String(face); C.font.slant = num(slant); C.font.weight = num(weight); C.applyFont(); return null; },
  set_font_size: (C, [s]) => { C.font.size = num(s); C.applyFont(); return null; },
  set_font_face: () => null,
  text_extents: (C, [s]) => { const m = measure(C.fstr, String(s ?? '')); return tup([m.xb, m.yb, m.w, m.h, m.adv, 0]); },
  font_extents: C => { const m = measure(C.fstr, 'Hg'), sz = C.font.size; const a = m.fa ?? sz * 0.9, d = m.fd ?? sz * 0.22; return tup([a, d, a + d, sz, 0]); },
  show_text: (C, [s]) => { s = String(s ?? ''); const p = C.getCP() || { x: 0, y: 0 }; C.g.fillText(s, p.x, p.y); C.setCP(p.x + measure(C.fstr, s).adv, p.y); C.g.moveTo(C.cp.x, C.cp.y); return null; },
  text_path: (C, [s]) => { s = String(s ?? ''); const p = C.getCP() || { x: 0, y: 0 }; C.texts.push({ s, x: p.x, y: p.y, m: C.g.getTransform(), font: C.fstr }); C.setCP(p.x + measure(C.fstr, s).adv, p.y); return null; },
  get_current_point: C => { const p = C.getCP(); return tup(p ? [p.x, p.y] : [0, 0]); },
  has_current_point: C => !!C.cp,
  get_target: C => C.s,
  get_group_target: C => C.s,
};
function arc(C, a, neg) {
  const [x, y, r0, a1, a2] = a.map(num), r = Math.max(0, r0 || 0);
  if (C.sub || !C.cp) { C.g.moveTo(x + r * Math.cos(a1), y + r * Math.sin(a1)); }
  let b = a2;
  if (!neg && b < a1) { b = a1 + ((((b - a1) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)); }
  if (neg && b > a1) { b = a1 - ((((a1 - b) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)); }
  C.g.arc(x, y, r, a1, b, neg);
  C.setCP(x + r * Math.cos(b), y + r * Math.sin(b)); C.sub = false;
  return null;
}
function matrix(m) {
  const o = { m: m.map(num) };
  o.__pyget = name => ({
    xx: o.m[0], yx: o.m[1], xy: o.m[2], yy: o.m[3], x0: o.m[4], y0: o.m[5],
    translate: nat(([x, y]) => { const d = new DOMMatrix(o.m).translate(num(x), num(y)); o.m = [d.a, d.b, d.c, d.d, d.e, d.f]; return null; }),
    scale: nat(([x, y]) => { const d = new DOMMatrix(o.m).scale(num(x), num(y ?? x)); o.m = [d.a, d.b, d.c, d.d, d.e, d.f]; return null; }),
    rotate: nat(([r]) => { const d = new DOMMatrix(o.m).rotate(num(r) * 180 / Math.PI); o.m = [d.a, d.b, d.c, d.d, d.e, d.f]; return null; }),
    transform_point: nat(([x, y]) => { const p = new DOMMatrix(o.m).transformPoint({ x: num(x), y: num(y) }); return tup([p.x, p.y]); }),
  })[name];
  return o;
}

/* ── ماژول cairo ── */
function cairoModule(R) {
  const d = {
    ImageSurface: Object.assign(nat(([f, w, h]) => new Surface(R, f, w, h), 'ImageSurface'), {
      __pyget: n => (n === 'create_from_png' ? nat(() => new Surface(R, 0, 1, 1)) : n === 'format_stride_for_width' ? nat(([f, w]) => (num(f) === 2 ? (num(w) + 3) & ~3 : num(w) * 4)) : undefined),
    }),
    Context: nat(([s]) => new Ctx(s instanceof Surface ? s : new Surface({ frame: false }, 0, 8, 8)), 'Context'),
    LinearGradient: nat(a => new Pattern('linear', a), 'LinearGradient'),
    RadialGradient: nat(a => new Pattern('radial', a), 'RadialGradient'),
    SolidPattern: nat(([r, g, b, a = 1]) => new Pattern('solid', [rgba(r, g, b, a)]), 'SolidPattern'),
    SurfacePattern: nat(([s]) => new Pattern('surface', [s, 0, 0]), 'SurfacePattern'),
    Matrix: nat(([xx = 1, yx = 0, xy = 0, yy = 1, x0 = 0, y0 = 0], k) => matrix([k.xx ?? xx, k.yx ?? yx, k.xy ?? xy, k.yy ?? yy, k.x0 ?? x0, k.y0 ?? y0]), 'Matrix'),
    FONT_SLANT_NORMAL: 0, FONT_SLANT_ITALIC: 1, FONT_SLANT_OBLIQUE: 2, FONT_WEIGHT_NORMAL: 0, FONT_WEIGHT_BOLD: 1,
    LINE_CAP_BUTT: 0, LINE_CAP_ROUND: 1, LINE_CAP_SQUARE: 2, LINE_JOIN_MITER: 0, LINE_JOIN_ROUND: 1, LINE_JOIN_BEVEL: 2,
    FILL_RULE_WINDING: 0, FILL_RULE_EVEN_ODD: 1, ANTIALIAS_DEFAULT: 0, ANTIALIAS_NONE: 1, ANTIALIAS_GRAY: 2, ANTIALIAS_SUBPIXEL: 3, ANTIALIAS_FAST: 4, ANTIALIAS_GOOD: 5, ANTIALIAS_BEST: 6,
    EXTEND_NONE: 0, EXTEND_REPEAT: 1, EXTEND_REFLECT: 2, EXTEND_PAD: 3, FILTER_FAST: 0, FILTER_GOOD: 1, FILTER_BEST: 2, FILTER_NEAREST: 3, FILTER_BILINEAR: 4,
    FontSlant: ns('FontSlant', { NORMAL: 0, ITALIC: 1, OBLIQUE: 2 }), FontWeight: ns('FontWeight', { NORMAL: 0, BOLD: 1 }),
    LineCap: ns('LineCap', { BUTT: 0, ROUND: 1, SQUARE: 2 }), LineJoin: ns('LineJoin', { MITER: 0, ROUND: 1, BEVEL: 2 }),
    FillRule: ns('FillRule', { WINDING: 0, EVEN_ODD: 1 }), Format: ns('Format', { ...FORMATS }),
    Operator: ns('Operator', Object.fromEntries(OPN.map((n, i) => [n, i]))),
    Antialias: ns('Antialias', { DEFAULT: 0, NONE: 1, GRAY: 2, SUBPIXEL: 3, FAST: 4, GOOD: 5, BEST: 6 }), Extend: ns('Extend', { NONE: 0, REPEAT: 1, REFLECT: 2, PAD: 3 }), Filter: ns('Filter', { FAST: 0, GOOD: 1, BEST: 2, NEAREST: 3, BILINEAR: 4 }),
  };
  for (const [n, v] of Object.entries(FORMATS)) d['FORMAT_' + n] = v;
  OPN.forEach((n, i) => { d['OPERATOR_' + n] = i; });
  return new PyModule('cairo', d);
}
/* ── صدا: wave / scipy.io.wavfile فقط ضبط می‌کنند ── */
function waveModule(R) {
  return new PyModule('wave', {
    open: nat(([path, mode = 'rb']) => {
      if (!/w/.test(String(mode))) return new Unk('wave.open');
      const W = { ch: 1, sw: 2, sr: 44100, parts: [] };
      R.wav = W;
      const o = {};
      const M = {
        setnchannels: ([n]) => { W.ch = num(n); return null; }, setsampwidth: ([n]) => { W.sw = num(n); return null; }, setframerate: ([n]) => { W.sr = num(n); return null; },
        setparams: ([p]) => { if (Array.isArray(p)) { W.ch = num(p[0]); W.sw = num(p[1]); W.sr = num(p[2]); } return null; },
        writeframes: ([b]) => { if (b instanceof Bytes) W.parts.push(b.u8); return null; }, writeframesraw: ([b]) => { if (b instanceof Bytes) W.parts.push(b.u8); return null; },
        setnframes: () => null, setcomptype: () => null, close: () => null, __exit__: () => null,
        __enter__: () => o,
      };
      o.__pyget = n => (M[n] ? nat(M[n], n) : undefined);
      return o;
    }),
  });
}
function wavfileModule(R) {
  return new PyModule('scipy.io.wavfile', {
    write: nat(([path, sr, data]) => {
      if (!(data instanceof ND)) return null;
      const ch = data.ndim > 1 ? data.shape[1] : 1, isF = /float/.test(data.dtype);
      const b = new Int16Array(data.size);
      for (let i = 0; i < data.size; i++) { const v = data.data[i]; b[i] = isF ? Math.max(-1, Math.min(1, v)) * 32767 : data.dtype === 'int32' ? v / 65536 : v; }
      R.wav = { ch, sw: 2, sr: num(sr), parts: [new Uint8Array(b.buffer)] };
      return null;
    }),
  });
}
function wavBytes(W) {
  const len = W.parts.reduce((a, p) => a + p.length, 0), dv = new DataView(new ArrayBuffer(44 + len)), bps = W.sw * 8;
  const w = (o, s) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); dv.setUint32(4, 36 + len, true); w(8, 'WAVEfmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, W.ch, true);
  dv.setUint32(24, W.sr, true); dv.setUint32(28, W.sr * W.ch * W.sw, true); dv.setUint16(32, W.ch * W.sw, true); dv.setUint16(34, bps, true); w(36, 'data'); dv.setUint32(40, len, true);
  const u = new Uint8Array(dv.buffer); let o = 44; for (const p of W.parts) { u.set(p, o); o += p.length; }
  return u;
}
const AUDIO_FN = ['make_audio', 'synth_audio', 'build_audio', 'generate_audio', 'render_audio', 'make_music', 'synth', 'make_sound', 'audio', 'music', 'soundtrack', 'make_soundtrack'];
export function pyAudioFn(inst) {
  const V = inst.I.globals.vars;
  for (const n of AUDIO_FN) if (V[n] instanceof PyFunc) return n;
  const m = /^def\s+([A-Za-z_]\w*)\s*\([^)]*\)[^\n]*:[\s\S]*?(?:wave\.open|wavfile\.write)/m.exec(inst.src);
  return m && V[m[1]] instanceof PyFunc ? m[1] : null;
}
/** صدای ساخته‌شده با خود کد (make_audio → wave) ← بایت‌های WAV */
export async function pyAudio(program, T, run = {}) {
  const inst = getPyInst(program, T, run), fn = pyAudioFn(inst);
  if (!fn) return null;
  const { I, R } = inst, f = I.globals.vars[fn];
  R.wav = null; I.steps = 0; I.maxSteps = 2e7;
  const req = (f.params || []).filter(p => p.def == null && !p.star).length;
  I.call(f, req ? ['audio.wav'] : [], {});
  if (!R.wav || !R.wav.parts.length) return null;
  return wavBytes(R.wav);
}

let _dead = null;
const DEAD = () => (_dead ||= offscreen(4, 4).getContext('2d'));
const stub = name => { const m = new PyModule(name, {}); m.unknown = true; return m; };

/* ── تحلیل و اجرا ── */
const FRAME_FN = ['render', 'render_frame', 'make_frame', 'draw_frame', 'frame', 'draw', 'generate_frame', 'make', 'paint_frame'];
export function looksPyCairo(src) { return /^\s*(import\s+cairo\b|from\s+cairo\s+import|import\s+cairocffi)/m.test(String(src || '')); }

function findFrameFn(V, src) {
  const isF = v => v instanceof PyFunc;
  const pick = name => {
    const f = V[name]; if (!isF(f)) return null;
    const ps = (f.params || []).filter(p => !p.star).map(p => p.name);
    const req = (f.params || []).filter(p => p.def == null && !p.star).length;
    let mode = 'fi', ctxArg = false;
    if (ps.length >= 2 && /^(ctx|cr|c|context|g|cx)$/i.test(ps[0])) { ctxArg = true; mode = /^(fi|i|n|f|frame|idx|index|frame_?i(dx)?|k)$/i.test(ps[1]) ? 'fi' : 't'; }
    else if (req > 1) return null;
    else if (/^(t|time|sec|secs|seconds|tt|ts)$/i.test(ps[0] || '')) mode = 't';
    else if (/^(p|progress|u)$/i.test(ps[0] || '')) mode = 'p';
    return { name, mode, ctxArg };
  };
  for (const n of FRAME_FN) { const r = pick(n); if (r) return r; }
  // تابعی که ImageSurface می‌سازد و یک پارامتر دارد
  const re = /^def\s+([A-Za-z_]\w*)\s*\(([^)]*)\)\s*(?:->[^:]*)?:([\s\S]*?)(?=^\S)/gm;
  let m;
  while ((m = re.exec(src + '\n#'))) {
    if (/ImageSurface\s*\(/.test(m[3]) && /\.(paint|fill|stroke|show_text)\s*\(/.test(m[3]) && m[2].split(',').filter(x => x.trim() && !/=/.test(x)).length === 1) { const r = pick(m[1]); if (r) return r; }
  }
  return null;
}
const firstNum = (V, names) => { for (const n of names) if (typeof V[n] === 'number' && Number.isFinite(V[n]) && V[n] > 0) return V[n]; return null; };

/** اجرای سطح بالای کد (یک بار) */
export function instantiatePy(src) {
  const R = { frame: false, bound: false, target: null, base: null, W0: 1920, H0: 1080, ctxs: [] };
  const I = new Interp({ modules: {
    numpy: () => numpyModule(), cairo: cairoModule(R), cairocffi: cairoModule(R),
    cv2: stub('cv2'), subprocess: stub('subprocess'), wave: waveModule(R), 'scipy.io.wavfile': wavfileModule(R), 'scipy.io': new PyModule('scipy.io', { wavfile: wavfileModule(R) }), multiprocessing: stub('multiprocessing'), PIL: stub('PIL'), imageio: stub('imageio'), tqdm: stub('tqdm'), scipy: stub('scipy'),
  }, maxSteps: 1.2e7 });
  I.builtins.__name__ = 'webvid';
  const inst = { I, R, error: null, warnings: I.warnings, src };
  try { I.run(src); } catch (e) { if (!(e instanceof FrameDone)) inst.error = e; }
  const V = I.globals.vars;
  const W0 = firstNum(V, ['W', 'WIDTH', 'width', 'Wd', 'IMG_W', 'VIDEO_W']) || 1920, H0 = firstNum(V, ['H', 'HEIGHT', 'height', 'Ht', 'IMG_H', 'VIDEO_H']) || 1080;
  R.W0 = Math.round(W0); R.H0 = Math.round(H0);
  const fps = firstNum(V, ['FPS', 'fps', 'FRAME_RATE', 'FRAMERATE', 'frame_rate', 'RATE']) || 30;
  let dur = firstNum(V, ['DUR', 'DURATION', 'duration', 'SECONDS', 'LENGTH', 'TOTAL', 'T_TOTAL']);
  if (!dur) { const n = firstNum(V, ['N', 'NFRAMES', 'N_FRAMES', 'FRAMES', 'TOTAL_FRAMES', 'NUM_FRAMES', 'frames']); dur = n ? n / fps : 10; }
  inst.fps = fps; inst.dur = Math.min(dur, 600); inst.W0 = R.W0; inst.H0 = R.H0;
  inst.fn = findFrameFn(V, src);
  if (!inst.fn && !inst.error) inst.error = new PyError('تابع فریم (مثلاً render(fi) یا make_frame(t)) پیدا نشد', 0);
  // صحنه‌ها: SCENES = [(t0, fn, 'name'), …]
  const sc = V.SCENES || V.scenes || V.TIMELINE;
  inst.scenes = [];
  if (Array.isArray(sc)) {
    for (const it of sc) {
      const a = isTuple(it) || Array.isArray(it) ? it : null; if (!a) continue;
      const t0 = a.find(x => typeof x === 'number'), f = a.find(x => x instanceof PyFunc), nm = a.find(x => typeof x === 'string');
      if (t0 == null) continue;
      inst.scenes.push({ t0, name: nm || f?.name || `صحنهٔ ${inst.scenes.length + 1}`, fn: f?.name || null });
    }
    inst.scenes.sort((x, y) => x.t0 - y.t0);
    inst.scenes.forEach((s, i) => { s.t1 = i + 1 < inst.scenes.length ? inst.scenes[i + 1].t0 : inst.dur; });
    inst.scenes = inst.scenes.filter(s => s.t1 - s.t0 > 0.05 && s.t0 < inst.dur);
  }
  if (!inst.scenes.length) inst.scenes = [{ t0: 0, t1: inst.dur, name: 'کل ویدیو' }];
  return inst;
}

/** یک فریم روی ctx (فضای قاب اصلی W0×H0 در تبدیل فعلی ctx) */
export function pyFrame(inst, ctx, t) {
  const { I, R } = inst;
  if (!inst.fn) throw inst.error || new Error('no frame fn');
  const f = I.globals.vars[inst.fn.name];
  const fi = Math.max(0, Math.round(t * inst.fps));
  const arg = inst.fn.mode === 't' ? t : inst.fn.mode === 'p' ? Math.max(0, Math.min(1, t / inst.dur)) : fi;
  ctx.save();
  R.frame = true; R.bound = false; R.target = ctx; R.base = ctx.getTransform(); R.ctxs = [];
  I.steps = 0; I.maxSteps = 6e6;
  try {
    const args = [arg];
    if (inst.fn.ctxArg) { const s = new Surface(R, 0, R.W0, R.H0); args.unshift(new Ctx(s)); }
    I.call(f, args, {});
  } catch (e) {
    if (!(e instanceof FrameDone)) { inst.lastError = e; throw e; }
  } finally {
    for (const C of R.ctxs.reverse()) { for (let i = 0; i <= C.saves; i++) ctx.restore(); C.saves = 0; C.g = DEAD(); }
    R.frame = false; R.target = null; R.ctxs = [];
    ctx.restore();
  }
}

const _inst = new Map();
function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; }
export function applyPyTweaks(src, tweaks, values) {
  if (!tweaks?.length || !values) return src;
  const eds = [];
  for (const t of tweaks) {
    if (!(t.id in values) || values[t.id] === t.def) continue;
    const v = values[t.id];
    const text = t.type === 'num' ? String(+v) : (t.quote || "'") + String(v).replace(/\\/g, '\\\\').split(t.quote || "'").join('\\' + (t.quote || "'")).replace(/\n/g, '\\n') + (t.quote || "'");
    eds.push({ s: t.s, e: t.e, text });
  }
  eds.sort((a, b) => b.s - a.s);
  let out = src;
  for (const ed of eds) out = out.slice(0, ed.s) + ed.text + out.slice(ed.e);
  return out;
}
export function getPyInst(program, T, run = {}) {
  const src = applyPyTweaks(program, run.tweaks, T);
  const key = src.length + ':' + hashStr(src);
  let inst = _inst.get(key);
  if (!inst) {
    inst = instantiatePy(src);
    if (_inst.size > 6) _inst.delete(_inst.keys().next().value);
    _inst.set(key, inst);
  }
  return inst;
}

/** از runImported برای run.lang === 'py' */
export function runPyFrame(ctx, e, program, T, run) {
  const w = e.w, h = e.h, t = (run.start || 0) + e.t;
  const inst = getPyInst(program, T, run);
  if (!inst.fn) throw inst.error;
  ctx.save();
  try {
    ctx.translate(-w / 2, -h / 2);
    const s = Math.max(w / inst.W0, h / inst.H0);
    ctx.translate((w - inst.W0 * s) / 2, (h - inst.H0 * s) / 2); ctx.scale(s, s);
    pyFrame(inst, ctx, t);
  } finally { ctx.restore(); }
}

/** تصویر کوچک یک لحظه */
export function pyThumb(inst, t, w = 192, h = 108) {
  const c = offscreen(w, h), g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
  const s = Math.max(w / inst.W0, h / inst.H0);
  g.translate((w - inst.W0 * s) / 2, (h - inst.H0 * s) / 2); g.scale(s, s);
  pyFrame(inst, g, t);
  return c;
}
