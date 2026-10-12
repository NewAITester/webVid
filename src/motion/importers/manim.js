import { nat, PyModule, PyFunc, PyClass, NativeClass, Unk, tup, repr } from './pyinterp.js';
import { toHex } from './emit.js';

/**
 * آداپتور Manim (Community و ManimGL)
 * ─────────────────────────────────────────────────────────────
 * construct() هر کلاس Scene اجرا می‌شود؛ self.play / self.wait / self.add
 * زمان‌بندی را می‌سازند و هر شیء (متن، دایره، مربع، …) یک «مسیر» با
 * کی‌فریم‌های جا، اندازه، چرخش، شفافیت و رنگ می‌شود.
 * مختصات منیم: واحد = H/8 پیکسل، y رو به بالا.
 */
const C = {
  WHITE: '#FFFFFF', BLACK: '#000000', GRAY: '#888888', GREY: '#888888', LIGHT_GRAY: '#BBBBBB', LIGHT_GREY: '#BBBBBB', DARK_GRAY: '#444444', DARK_GREY: '#444444', DARKER_GRAY: '#222222',
  RED: '#FC6255', BLUE: '#58C4DD', GREEN: '#83C167', YELLOW: '#FFFF00', GOLD: '#F0AC5F', TEAL: '#5CD0B3', PURPLE: '#9A72AC', ORANGE: '#FF862F', PINK: '#D147BD', MAROON: '#C55F73',
  PURE_RED: '#FF0000', PURE_GREEN: '#00FF00', PURE_BLUE: '#0000FF', DARK_BLUE: '#236B8E', DARK_BROWN: '#8B4513', LIGHT_BROWN: '#CD853F', LIGHT_PINK: '#DC75CD',
};
const SHADES = {
  BLUE: ['#C7E9F1', '#9CDCEB', '#58C4DD', '#29ABCA', '#236B8E'], RED: ['#F7A1A3', '#FF8080', '#FC6255', '#E65A4C', '#CF5044'], GREEN: ['#C9E2AE', '#A6CF8C', '#83C167', '#77B05D', '#699C52'],
  YELLOW: ['#FFF1B6', '#FFEA94', '#FFFF00', '#F4D345', '#E8C11C'], TEAL: ['#ACEAD7', '#76DDC0', '#5CD0B3', '#55C1A7', '#49A88F'], PURPLE: ['#CAA3E8', '#B189C6', '#9A72AC', '#715582', '#644172'],
  GOLD: ['#F7C797', '#F9B775', '#F0AC5F', '#E1A158', '#C78D46'], MAROON: ['#ECABC1', '#EC92AB', '#C55F73', '#A24D61', '#94424F'], GRAY: ['#DDDDDD', '#BBBBBB', '#888888', '#444444', '#222222'],
};
for (const [k, arr] of Object.entries(SHADES)) 'ABCDE'.split('').forEach((s, i) => { C[`${k}_${s}`] = arr[i]; if (k === 'GRAY') C[`GREY_${s}`] = arr[i]; });

/** بردار numpy-مانند (UP * 2 + LEFT …) */
export class Vec {
  constructor(a) { this.a = [...a].map(Number); while (this.a.length < 3) this.a.push(0); }
  __op(op, o, rev) {
    if (op === 'neg') return new Vec(this.a.map(x => -x));
    if (op === 'abs') return new Vec(this.a.map(Math.abs));
    const b = o instanceof Vec ? o.a : Array.isArray(o) ? o.map(Number) : typeof o === 'number' ? [o, o, o] : null;
    if (!b) return undefined;
    const A = rev ? b : this.a, B = rev ? this.a : b;
    const f = { '+': (x, y) => x + y, '-': (x, y) => x - y, '*': (x, y) => x * y, '/': (x, y) => x / y, '**': (x, y) => x ** y }[op];
    return f ? new Vec([0, 1, 2].map(i => f(A[i] ?? 0, B[i] ?? 0))) : undefined;
  }
  __getitem(k) { return this.a[k < 0 ? 3 + k : k] ?? 0; }
  __setitem(k, v) { this.a[k] = +v; }
  __iter() { return this.a.slice(); }
  __len() { return 3; }
  __repr() { return `array([${this.a.join(', ')}])`; }
  __eq(o) { return o instanceof Vec && o.a.every((x, i) => x === this.a[i]); }
  __pyget(n) { if (n === 'copy') return nat(() => new Vec(this.a)); if (n === 'tolist') return nat(() => this.a.slice()); return undefined; }
}
const V = (x, y, z = 0) => new Vec([x, y, z]);
const DIRS = { ORIGIN: V(0, 0), UP: V(0, 1), DOWN: V(0, -1), LEFT: V(-1, 0), RIGHT: V(1, 0), UL: V(-1, 1), UR: V(1, 1), DL: V(-1, -1), DR: V(1, -1), IN: V(0, 0, -1), OUT: V(0, 0, 1) };

let SEQ = 0;
export class Mob {
  constructor(kind, o = {}) {
    this.id = ++SEQ; this.kind = kind;
    Object.assign(this, { x: 0, y: 0, w: 1, h: 1, rot: 0, sc: 1, stroke: '#FFFFFF', strokeW: 4, fill: '#FFFFFF', fillOp: 0, opacity: 1, text: null, fontSize: 48, font: null, kids: null, z: 0 }, o);
  }
  leaves() { return this.kids ? this.kids.flatMap(k => k.leaves()) : [this]; }
  bbox() {
    if (this.kids) {
      if (!this.kids.length) return [this.x, this.y, this.x, this.y];
      const bs = this.kids.map(k => k.bbox());
      return [Math.min(...bs.map(b => b[0])), Math.min(...bs.map(b => b[1])), Math.max(...bs.map(b => b[2])), Math.max(...bs.map(b => b[3]))];
    }
    const c = Math.abs(Math.cos(this.rot)), s = Math.abs(Math.sin(this.rot));
    const hw = (this.w * c + this.h * s) * this.sc / 2, hh = (this.w * s + this.h * c) * this.sc / 2;
    return [this.x - hw, this.y - hh, this.x + hw, this.y + hh];
  }
  center() { const b = this.bbox(); return [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2, 0]; }
  get width() { const b = this.bbox(); return b[2] - b[0]; }
  get height() { const b = this.bbox(); return b[3] - b[1]; }
  shift(d) { for (const m of this.leaves()) { m.x += d[0]; m.y += d[1]; } }
  scaleAbout(f, cx, cy) { for (const m of this.leaves()) { m.x = cx + (m.x - cx) * f; m.y = cy + (m.y - cy) * f; m.sc *= f; } }
  rotateAbout(a, cx, cy) { const c = Math.cos(a), s = Math.sin(a); for (const m of this.leaves()) { const dx = m.x - cx, dy = m.y - cy; m.x = cx + dx * c - dy * s; m.y = cy + dx * s + dy * c; m.rot += a; } }
  snap() { return this.leaves().map(m => ({ m, x: m.x, y: m.y, sc: m.sc, rot: m.rot, opacity: m.opacity, fill: m.fill, stroke: m.stroke, fillOp: m.fillOp })); }
  clone() { const c = Object.assign(new Mob(this.kind), this, { kids: this.kids ? this.kids.map(k => k.clone()) : null, track: null }); c.id = ++SEQ; return c; }
  copyLook(o) {
    for (const k of ['kind', 'w', 'h', 'rot', 'sc', 'stroke', 'strokeW', 'fill', 'fillOp', 'opacity', 'text', 'fontSize', 'font', 'sides', 'inner', 'radius', 'x', 'y']) this[k] = o[k];
    this.kids = o.kids ? o.kids.map(k => k.clone()) : null;
  }
  __repr() { return `<${this.kind}>`; }
}
const vecOf = v => (v instanceof Vec ? v.a : v instanceof Mob ? v.center() : Array.isArray(v) ? [+v[0] || 0, +v[1] || 0, +v[2] || 0] : typeof v === 'number' ? [v, v, v] : [0, 0, 0]);

function manimCore(S) {
  const n = nat;
  const FW = () => 4 * (S.W0 || 1920) / (S.H0 || 1080), FH = 4;      // نیم‌پهنا/نیم‌ارتفاع قاب (واحد)
  const col = (c, d) => (c == null || c instanceof Unk ? d : toHex(c?.hex ?? c, d, '1'));
  const txtSize = (s, fs) => { const ls = String(s).split('\n'); const L = Math.max(1, ...ls.map(l => [...l].length)); return { w: L * fs * 0.0105, h: ls.length * fs * 0.011 }; };
  const plainTex = s => String(s).replace(/\\(text|mathrm|mathbf|textbf|mathit|operatorname)\{([^}]*)\}/g, '$2').replace(/\\frac\{([^}]*)\}\{([^}]*)\}/g, '($1)/($2)').replace(/\\sqrt\{([^}]*)\}/g, '√($1)')
    .replace(/\\(alpha|beta|gamma|delta|theta|lambda|mu|pi|sigma|phi|omega|infty|cdot|times|pm|leq|geq|neq|approx|rightarrow|to|sum|int|partial)\b/g, (m, k) => ({ alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', theta: 'θ', lambda: 'λ', mu: 'μ', pi: 'π', sigma: 'σ', phi: 'φ', omega: 'ω', infty: '∞', cdot: '·', times: '×', pm: '±', leq: '≤', geq: '≥', neq: '≠', approx: '≈', rightarrow: '→', to: '→', sum: 'Σ', int: '∫', partial: '∂' })[k])
    .replace(/\\(sin|cos|tan|log|ln|exp|lim|max|min|det)\b/g, '$1 ').replace(/\^\{?([0-9n+\-]+)\}?/g, (m, d) => [...d].map(c => '⁰¹²³⁴⁵⁶⁷⁸⁹'[c] ?? { n: 'ⁿ', '+': '⁺', '-': '⁻' }[c] ?? c).join('')).replace(/\^\{([^}]*)\}/g, '^$1').replace(/_\{([^}]*)\}/g, '_$1').replace(/\\\\/g, '\n').replace(/\\[a-zA-Z]+/g, '').replace(/[{}$]/g, '').trim();
  const style = (m, k, defStroke, defFillOp = 0) => {
    const c = k.color != null ? col(k.color, defStroke) : null;
    m.stroke = col(k.stroke_color, c ?? defStroke);
    m.fill = col(k.fill_color, c ?? m.stroke);
    m.fillOp = k.fill_opacity != null ? +k.fill_opacity : defFillOp;
    if (k.stroke_width != null) m.strokeW = +k.stroke_width;
    if (k.opacity != null) m.opacity = +k.opacity;
    return m;
  };
  const mk = (name, fn) => n((a, k) => { const m = fn(a, k); m.ctor = name; return m; }, name);
  const textCtor = isTex => (a, k) => {
    const raw = a.filter(x => typeof x === 'string').join(isTex ? ' ' : '');
    const s = isTex ? plainTex(raw) : raw;
    const fs = +(k.font_size ?? 48) || 48;
    const m = new Mob('text', { text: s, fontSize: fs, ...txtSize(s, fs), font: k.font ? String(k.font) : null, strokeW: 0, fillOp: 1 });
    m.fill = m.stroke = col(k.color ?? k.fill_color, '#FFFFFF');
    if (k.weight && /BOLD|HEAVY|BLACK/i.test(repr(k.weight))) m.bold = true;
    return m;
  };
  function lineMob(kind, p0, p1, k) {
    const dx = p1[0] - p0[0], dy = p1[1] - p0[1], len = Math.hypot(dx, dy) || 0.01;
    const m = style(new Mob(kind, { x: (p0[0] + p1[0]) / 2, y: (p0[1] + p1[1]) / 2, w: len, h: kind === 'arrow' ? 0.25 : 0.05, rot: Math.atan2(dy, dx) }), k, C.WHITE, kind === 'arrow' ? 1 : 0);
    if (kind === 'line') m.fillOp = 0;
    return m;
  }
  const around = (t, buff) => { const b = t instanceof Mob ? t.bbox() : [-1, -1, 1, 1]; return { x: (b[0] + b[2]) / 2, y: (b[1] + b[3]) / 2, w: b[2] - b[0] + 2 * buff, h: b[3] - b[1] + 2 * buff, b }; };
  const media = (a, kind) => { S.media.push({ kind, file: String(a[0]) }); return new Mob('image', { w: 4, h: 3, file: String(a[0]) }); };
  const P = (a, k, key, i, d) => vecOf(k[key] ?? a[i] ?? d);
  const rng = (r, d) => { const v = Array.isArray(r) ? r.map(Number) : d; return [v[0] ?? d[0], v[1] ?? d[1], v[2] ?? 1]; };
  /** محورها: دو پیکان + نگاشت مختصات برای c2p و plot */
  function makeAxes(k, a) {
    const xr = rng(k.x_range ?? a[0], [-7, 7]), yr = rng(k.y_range ?? a[1], [-4, 4]);
    const L = +(k.x_length ?? 12) || 12, H = +(k.y_length ?? 6) || 6;
    const st = { stroke_width: 2, color: col((k.axis_config && k.axis_config.__pyget ? null : null) ?? C.WHITE) };
    const zx = Math.min(Math.max(0, xr[0]), xr[1]), zy = Math.min(Math.max(0, yr[0]), yr[1]);
    const ax = { xr, yr, L, H, ox: 0, oy: 0 };
    const px = x => -L / 2 + (x - xr[0]) / ((xr[1] - xr[0]) || 1) * L, py = y => -H / 2 + (y - yr[0]) / ((yr[1] - yr[0]) || 1) * H;
    const xa = lineMob('arrow', [-L / 2, py(zy), 0], [L / 2, py(zy), 0], st), ya = lineMob('arrow', [px(zx), -H / 2, 0], [px(zx), H / 2, 0], st);
    xa.h = ya.h = 0.18;
    const m = new Mob('group', { kids: [xa, ya] });
    m.ax = ax; ax.ref = xa; ax.x0 = xa.x; ax.y0 = ya.y;
    return m;
  }
  S._axesPoint = (m, x, y) => {      // مختصات محور ← نقطهٔ صحنه (با جابه‌جایی بعدی گروه)
    const A = m.ax, xa = A.ref || m;
    const cx = (m.kids ? m.kids[0].x : m.x) - (A.x0 ?? 0), cy = (m.kids ? m.kids[1].y : m.y) - (A.y0 ?? 0);
    const px = -A.L / 2 + (x - A.xr[0]) / ((A.xr[1] - A.xr[0]) || 1) * A.L;
    const py = A.H ? -A.H / 2 + (y - A.yr[0]) / ((A.yr[1] - A.yr[0]) || 1) * A.H : 0;
    return [px + cx + (A.ox || 0), py + cy + (A.oy || 0)];
  };
  S._polyline = (pts, k) => {         // منحنی ← یک شیء «curve» (بعداً یک لایهٔ کد)
    pts = pts.filter(p => isFinite(p[0]) && isFinite(p[1]));
    if (pts.length < 2) return new Mob('group', { kids: [] });
    const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys), cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    const m = style(new Mob('curve', { x: cx, y: cy, w: Math.max(0.05, x1 - x0), h: Math.max(0.05, y1 - y0), pts: pts.map(p => [p[0] - cx, p[1] - cy]) }), { color: C.YELLOW, ...k }, C.YELLOW, 0);
    m.fillOp = 0;
    return m;
  };
  const shapes = {
    Circle: mk('Circle', (a, k) => { const r = +(k.radius ?? a[0] ?? 1); return style(new Mob('ellipse', { w: 2 * r, h: 2 * r }), k, C.RED); }),
    Dot: mk('Dot', (a, k) => { const p = P(a, k, 'point', 0, DIRS.ORIGIN), r = +(k.radius ?? 0.08); return style(new Mob('ellipse', { x: p[0], y: p[1], w: 2 * r, h: 2 * r, strokeW: 0 }), k, C.WHITE, 1); }),
    Square: mk('Square', (a, k) => { const s = +(k.side_length ?? a[0] ?? 2); return style(new Mob('rect', { w: s, h: s }), k, C.WHITE); }),
    Rectangle: mk('Rectangle', (a, k) => style(new Mob('rect', { w: +(k.width ?? 4), h: +(k.height ?? 2) }), k, C.WHITE)),
    RoundedRectangle: mk('RoundedRectangle', (a, k) => style(new Mob('rect', { w: +(k.width ?? 4), h: +(k.height ?? 2), radius: +(k.corner_radius ?? 0.5) }), k, C.WHITE)),
    Ellipse: mk('Ellipse', (a, k) => style(new Mob('ellipse', { w: +(k.width ?? 2), h: +(k.height ?? 1) }), k, C.WHITE)),
    Triangle: mk('Triangle', (a, k) => style(new Mob('polygon', { w: 2, h: 2, sides: 3 }), k, C.WHITE)),
    RegularPolygon: mk('RegularPolygon', (a, k) => style(new Mob('polygon', { w: 2, h: 2, sides: +(k.n ?? a[0] ?? 6) }), k, C.WHITE)),
    Star: mk('Star', (a, k) => { const r = +(k.outer_radius ?? 1); return style(new Mob('star', { w: 2 * r, h: 2 * r, sides: +(k.n ?? a[0] ?? 5), inner: Math.round(100 * (k.inner_radius != null ? k.inner_radius / r : 0.38)) }), k, C.WHITE); }),
    Annulus: mk('Annulus', (a, k) => { const r = +(k.outer_radius ?? 1); return style(new Mob('ring', { w: 2 * r, h: 2 * r }), k, C.WHITE, 1); }),
    Arc: mk('Arc', (a, k) => { const r = +(k.radius ?? 1); return style(new Mob('ellipse', { w: 2 * r, h: 2 * r, trimE: Math.round(100 * Math.min(1, (+(k.angle ?? Math.PI / 2)) / (2 * Math.PI))) }), k, C.WHITE); }),
    Line: mk('Line', (a, k) => lineMob('line', P(a, k, 'start', 0, DIRS.LEFT), P(a, k, 'end', 1, DIRS.RIGHT), k)),
    DashedLine: mk('DashedLine', (a, k) => lineMob('line', P(a, k, 'start', 0, DIRS.LEFT), P(a, k, 'end', 1, DIRS.RIGHT), k)),
    Arrow: mk('Arrow', (a, k) => lineMob('arrow', P(a, k, 'start', 0, DIRS.LEFT), P(a, k, 'end', 1, DIRS.RIGHT), k)),
    DoubleArrow: mk('DoubleArrow', (a, k) => lineMob('arrow', P(a, k, 'start', 0, DIRS.LEFT), P(a, k, 'end', 1, DIRS.RIGHT), k)),
    Vector: mk('Vector', (a, k) => lineMob('arrow', [0, 0, 0], P(a, k, 'direction', 0, DIRS.RIGHT), k)),
    Polygon: mk('Polygon', (a, k) => { const pts = a.map(vecOf), xs = pts.map(p => p[0]), ys = pts.map(p => p[1]); return style(new Mob('polygon', { sides: Math.max(3, pts.length), x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2, w: Math.max(0.2, Math.max(...xs) - Math.min(...xs)), h: Math.max(0.2, Math.max(...ys) - Math.min(...ys)) }), k, C.BLUE); }),
    Cross: mk('Cross', (a, k) => style(new Mob('cross', { w: 1, h: 1, rot: Math.PI / 4, fillOp: 1 }), k, C.RED, 1)),
    Text: mk('Text', textCtor(false)), MarkupText: mk('MarkupText', (a, k) => textCtor(false)(a.map(x => (typeof x === 'string' ? x.replace(/<[^>]+>/g, '') : x)), k)),
    Paragraph: mk('Paragraph', (a, k) => textCtor(false)([a.filter(x => typeof x === 'string').join('\n')], k)),
    Tex: mk('Tex', textCtor(true)), MathTex: mk('MathTex', textCtor(true)),
    Title: mk('Title', (a, k) => { const m = textCtor(true)(a, k); m.y = FH - 0.5 - m.h / 2; return m; }),
    Integer: mk('Integer', (a, k) => textCtor(false)([String(Math.round(+(k.number ?? a[0] ?? 0)))], k)),
    DecimalNumber: mk('DecimalNumber', (a, k) => textCtor(false)([(+(k.number ?? a[0] ?? 0)).toFixed(k.num_decimal_places ?? 2)], k)),
    ImageMobject: mk('ImageMobject', a => media(a, 'تصویر')), SVGMobject: mk('SVGMobject', a => media(a, 'SVG')),
    NumberPlane: mk('NumberPlane', () => { S.warn('NumberPlane به «شبکهٔ نقطه‌ای» تقریبی تبدیل شد.'); return new Mob('grid', { w: FW() * 2, h: FH * 2, stroke: C.BLUE_D }); }),
    Axes: mk('Axes', (a, k) => makeAxes(k, a)), ThreeDAxes: mk('ThreeDAxes', (a, k) => makeAxes(k, a)),
    NumberLine: mk('NumberLine', (a, k) => {
      const xr = rng(k.x_range ?? a[0], [-8, 8]), L = +(k.length ?? k.unit_size * (xr[1] - xr[0]) ?? 0) || Math.min(12, xr[1] - xr[0]);
      const m = lineMob('line', [-L / 2, 0, 0], [L / 2, 0, 0], { stroke_width: 2, ...k });
      m.ax = { xr, yr: [0, 1], L, H: 0, ox: 0, oy: 0 }; return m;
    }),
    SurroundingRectangle: mk('SurroundingRectangle', (a, k) => { const r = around(a[0], +(k.buff ?? 0.1)); return style(new Mob('rect', r), k, C.YELLOW); }),
    BackgroundRectangle: mk('BackgroundRectangle', (a, k) => { const r = around(a[0], 0.2); return style(new Mob('rect', { ...r, strokeW: 0 }), { color: C.BLACK, ...k }, C.BLACK, k.fill_opacity ?? 0.75); }),
    Brace: mk('Brace', (a, k) => { const r = around(a[0], 0); return lineMob('line', [r.b[0], r.b[1] - 0.25, 0], [r.b[2], r.b[1] - 0.25, 0], k); }),
    Underline: mk('Underline', (a, k) => { const r = around(a[0], 0); return lineMob('line', [r.b[0], r.b[1] - 0.1, 0], [r.b[2], r.b[1] - 0.1, 0], k); }),
  };
  const group = mk('VGroup', a => new Mob('group', { kids: a.flatMap(x => (Array.isArray(x) ? x : [x])).filter(x => x instanceof Mob) }));

  /* ── متدهای شیء (همه self برمی‌گردانند) ── */
  const change = (m, fn) => { const r = S.cur; const before = m.snap(); fn(); if (r && !r.inAnim) r.instant(before); return m; };
  const edgeOf = p => { if (p instanceof Mob) return p.bbox(); const q = vecOf(p); return [q[0], q[1], q[0], q[1]]; };
  const M = {
    shift: (m, a) => change(m, () => { let d = [0, 0]; for (const v of a) { const q = vecOf(v); d = [d[0] + q[0], d[1] + q[1]]; } m.shift(d); }),
    move_to: (m, [p]) => change(m, () => { const c = m.center(), t = vecOf(p); m.shift([t[0] - c[0], t[1] - c[1]]); }),
    next_to: (m, [p, dir], k) => change(m, () => {
      const d = vecOf(k.direction ?? dir ?? DIRS.RIGHT), buff = +(k.buff ?? 0.25), tb = edgeOf(p), c = m.center();
      let x = (tb[0] + tb[2]) / 2, y = (tb[1] + tb[3]) / 2;
      if (d[0] > 0) x = tb[2] + buff + m.width / 2; else if (d[0] < 0) x = tb[0] - buff - m.width / 2;
      if (d[1] > 0) y = tb[3] + buff + m.height / 2; else if (d[1] < 0) y = tb[1] - buff - m.height / 2;
      m.shift([x - c[0], y - c[1]]);
    }),
    to_edge: (m, [dir], k) => change(m, () => { const d = vecOf(k.edge ?? dir ?? DIRS.LEFT), buff = +(k.buff ?? 0.5), c = m.center(); let [x, y] = c; if (d[0]) x = Math.sign(d[0]) * (FW() - buff - m.width / 2); if (d[1]) y = Math.sign(d[1]) * (FH - buff - m.height / 2); m.shift([x - c[0], y - c[1]]); }),
    to_corner: (m, [dir], k) => change(m, () => { const d = vecOf(k.corner ?? dir ?? DIRS.DL), buff = +(k.buff ?? 0.5), c = m.center(); m.shift([(d[0] >= 0 ? 1 : -1) * (FW() - buff - m.width / 2) - c[0], (d[1] >= 0 ? 1 : -1) * (FH - buff - m.height / 2) - c[1]]); }),
    align_to: (m, [p, dir]) => change(m, () => { const d = vecOf(dir ?? DIRS.LEFT), tb = edgeOf(p), b = m.bbox(); m.shift([d[0] < 0 ? tb[0] - b[0] : d[0] > 0 ? tb[2] - b[2] : 0, d[1] > 0 ? tb[3] - b[3] : d[1] < 0 ? tb[1] - b[1] : 0]); }),
    center: m => change(m, () => { const c = m.center(); m.shift([-c[0], -c[1]]); }),
    set_x: (m, [x]) => change(m, () => m.shift([x - m.center()[0], 0])), set_y: (m, [y]) => change(m, () => m.shift([0, y - m.center()[1]])),
    scale: (m, [f], k) => change(m, () => { const c = k.about_point ? vecOf(k.about_point) : m.center(); m.scaleAbout(+f || 1, c[0], c[1]); }),
    rotate: (m, [ang], k) => change(m, () => { const c = k.about_point ? vecOf(k.about_point) : m.center(); m.rotateAbout(+(k.angle ?? ang) || 0, c[0], c[1]); }),
    set_color: (m, [c], k) => change(m, () => { const h = col(k.color ?? c, '#FFFFFF'); for (const l of m.leaves()) { l.stroke = h; l.fill = h; } }),
    set_fill: (m, [c, op], k) => change(m, () => { for (const l of m.leaves()) { if ((k.color ?? c) != null) l.fill = col(k.color ?? c, l.fill); const o = k.opacity ?? op; if (o != null) l.fillOp = +o; } }),
    set_stroke: (m, [c, w], k) => change(m, () => { for (const l of m.leaves()) { if ((k.color ?? c) != null) l.stroke = col(k.color ?? c, l.stroke); if ((k.width ?? w) != null) l.strokeW = +(k.width ?? w); } }),
    set_opacity: (m, [o]) => change(m, () => { for (const l of m.leaves()) l.opacity = +o; }),
    fade: (m, [d = 0.5]) => change(m, () => { for (const l of m.leaves()) l.opacity = 1 - +d; }),
    set_color_by_gradient: (m, cs) => change(m, () => { const ls = m.leaves(), hs = cs.map(c => col(c, '#FFFFFF')); ls.forEach((l, i) => { l.fill = l.stroke = hs[Math.min(hs.length - 1, Math.floor(i * hs.length / ls.length))]; }); }),
    scale_to_fit_width: (m, [w]) => M.scale(m, [w / (m.width || 1)], {}), scale_to_fit_height: (m, [h]) => M.scale(m, [h / (m.height || 1)], {}),
    set_width: (m, [w]) => M.scale(m, [w / (m.width || 1)], {}), set_height: (m, [h]) => M.scale(m, [h / (m.height || 1)], {}),
    match_width: (m, [o]) => M.scale(m, [(o?.width || 1) / (m.width || 1)], {}), match_height: (m, [o]) => M.scale(m, [(o?.height || 1) / (m.height || 1)], {}),
    set: (m, a, k) => { if (k.width != null) M.set_width(m, [k.width]); if (k.height != null) M.set_height(m, [k.height]); if (k.color != null) M.set_color(m, [k.color], {}); if (k.opacity != null) M.set_opacity(m, [k.opacity]); return m; },
    arrange: (m, [dir], k) => change(m, () => {
      const d = vecOf(k.direction ?? dir ?? DIRS.RIGHT), buff = +(k.buff ?? 0.25), kids = m.kids || [];
      if (!kids.length) return;
      const c0 = m.center(); let cur = 0;
      for (const kd of kids) { const sz = d[0] ? kd.width : kd.height, c = kd.center(), t = cur + sz / 2; if (d[0]) kd.shift([t * Math.sign(d[0]) - c[0], -c[1]]); else kd.shift([-c[0], t * Math.sign(d[1]) - c[1]]); cur += sz + buff; }
      const c1 = m.center(); m.shift([c0[0] - c1[0], c0[1] - c1[1]]);
    }),
    arrange_in_grid: (m, a, k) => change(m, () => {
      const kids = m.kids || []; if (!kids.length) return;
      const cols = +(k.cols ?? Math.ceil(Math.sqrt(kids.length))), buff = +(k.buff ?? 0.25), rows = Math.ceil(kids.length / cols);
      const cw = Math.max(...kids.map(x => x.width)) + buff, ch = Math.max(...kids.map(x => x.height)) + buff;
      kids.forEach((kd, i) => { const c = kd.center(); kd.shift([(i % cols - (cols - 1) / 2) * cw - c[0], ((rows - 1) / 2 - Math.floor(i / cols)) * ch - c[1]]); });
    }),
    add: (m, a) => { if (m.kids) m.kids.push(...a.filter(x => x instanceof Mob)); return m; },
    remove: (m, a) => { if (m.kids) m.kids = m.kids.filter(x => !a.includes(x)); return m; },
    copy: m => m.clone(), deepcopy: m => m.clone(), generate_target: m => { m.target = m.clone(); return m.target; },
    become: (m, [o]) => change(m, () => m.copyLook(o)),
    get_center: m => new Vec(m.center()), get_x: m => m.center()[0], get_y: m => m.center()[1], get_width: m => m.width, get_height: m => m.height,
    get_top: m => { const b = m.bbox(); return V((b[0] + b[2]) / 2, b[3]); }, get_bottom: m => { const b = m.bbox(); return V((b[0] + b[2]) / 2, b[1]); },
    get_left: m => { const b = m.bbox(); return V(b[0], (b[1] + b[3]) / 2); }, get_right: m => { const b = m.bbox(); return V(b[2], (b[1] + b[3]) / 2); },
    get_corner: (m, [d]) => { const b = m.bbox(), q = vecOf(d); return V(q[0] >= 0 ? b[2] : b[0], q[1] >= 0 ? b[3] : b[1]); },
    get_start: m => { const l = m.leaves()[0]; return V(l.x - Math.cos(l.rot) * l.w * l.sc / 2, l.y - Math.sin(l.rot) * l.w * l.sc / 2); },
    get_end: m => { const l = m.leaves()[0]; return V(l.x + Math.cos(l.rot) * l.w * l.sc / 2, l.y + Math.sin(l.rot) * l.w * l.sc / 2); },
    get_color: m => m.leaves()[0]?.stroke,
    add_updater: m => { S.warn('add_updater (حرکت با تابع) پشتیبانی نمی‌شود؛ شیء ثابت می‌ماند.'); return m; },
  };
  for (const k of ['flip', 'stretch', 'clear_updaters', 'suspend_updating', 'resume_updating', 'add_background_rectangle', 'set_sheen', 'round_corners', 'set_z_index_by_z_coordinate', 'put_start_and_end_on']) M[k] = m => m;
  M.set_z_index = (m, [z]) => { m.leaves().forEach(l => (l.z = +z)); return m; };
  const fnv = (f, x) => { const r = S.interp.call(f, [x], {}); return typeof r === 'number' ? r : (r?.__getitem ? +r.__getitem(1) : +r) || 0; };
  const AXM = {
    c2p: (m, [x = 0, y = 0]) => { const v = Array.isArray(x) || x?.a ? vecOf(x) : [x, y]; return new Vec(S._axesPoint(m, +v[0], +v[1])); },
    plot: (m, [f], k) => {
      const xr = rng(k.x_range, m.ax.xr), N = 40, pts = [];
      for (let i = 0; i <= N; i++) { const x = xr[0] + (xr[1] - xr[0]) * i / N; let y = 0; try { y = fnv(f, x); } catch { /* */ } if (isFinite(y)) pts.push(S._axesPoint(m, x, Math.max(m.ax.yr[0] - 2, Math.min(m.ax.yr[1] + 2, y)))); }
      return S._polyline(pts, k);
    },
    plot_line_graph: (m, [xs, ys], k) => S._polyline((k.x_values ?? xs ?? []).map((x, i) => S._axesPoint(m, +x, +((k.y_values ?? ys ?? [])[i] ?? 0))), { color: k.line_color, ...k }),
    get_axis_labels: (m, [xl = 'x', yl = 'y'], k) => {
      const a = [k.x_label ?? xl, k.y_label ?? yl].map(v => (v instanceof Mob ? v : shapes.MathTex.__call ? null : null) || (v instanceof Mob ? v : textCtor(true)([String(v)], { font_size: 32 })));
      const [x1, y1] = S._axesPoint(m, m.ax.xr[1], 0), [x2, y2] = S._axesPoint(m, 0, m.ax.yr[1]);
      a[0].x = x1 + 0.4; a[0].y = y1 - 0.35; a[1].x = x2 + 0.4; a[1].y = y2 - 0.2;
      return new Mob('group', { kids: a });
    },
    get_x_axis: m => m.kids?.[0] ?? m, get_y_axis: m => m.kids?.[1] ?? m, add_coordinates: m => m, add_tip: m => m,
    n2p: (m, [x]) => new Vec(S._axesPoint(m, +x, 0)), number_to_point: (m, [x]) => new Vec(S._axesPoint(m, +x, 0)),
    p2c: (m, [p]) => { const v = vecOf(p), [ox, oy] = S._axesPoint(m, 0, 0), [ux] = S._axesPoint(m, 1, 0), [, uy] = S._axesPoint(m, 0, 1); return tup([(v[0] - ox) / ((ux - ox) || 1), (v[1] - oy) / ((uy - oy) || 1)]); },
    i2gp: (m, [x, g]) => new Vec(S._axesPoint(m, +x, 0)),
    get_area: () => new Mob('group', { kids: [] }), get_riemann_rectangles: () => new Mob('group', { kids: [] }),
    get_vertical_line: (m, [p]) => { const v = vecOf(p), [, oy] = S._axesPoint(m, 0, 0); return lineMob('line', [v[0], oy, 0], [v[0], v[1], 0], { stroke_width: 2 }); },
  };
  AXM.coords_to_point = AXM.c2p; AXM.get_graph = AXM.plot; AXM.point_to_coords = AXM.p2c; AXM.input_to_graph_point = AXM.i2gp;
  Mob.prototype.__pyget = function (name) {
    const m = this;
    if (name === 'animate') return animProxy(m);
    if (name === 'width') return m.width; if (name === 'height') return m.height;
    if (name === 'submobjects') return m.kids || []; if (name === 'text') return m.text ?? ''; if (name === 'target') return m.target;
    if (name === 'color') return m.leaves()[0]?.stroke; if (name === 'font_size') return m.fontSize;
    if (m.ax && AXM[name]) return nat((a, k) => AXM[name](m, a, k), name);
    const f = M[name];
    if (f) { const b = nat((a, k) => f(m, a, k), name); b.__mob = m; b.__mname = name; return b; }
    return new Unk('mobject.' + name);
  };
  Mob.prototype.__pyset = function (name, v) { if (name === 'width') M.set_width(this, [v]); else if (name === 'height') M.set_height(this, [v]); else this[name] = v; };
  Mob.prototype.__getitem = function (k) { if (this.kids) { const i = typeof k === 'number' ? (k < 0 ? this.kids.length + k : k) : 0; return this.kids[i] ?? this; } return this; };
  Mob.prototype.__iter = function () { return this.kids ? this.kids.slice() : [this]; };
  Mob.prototype.__len = function () { return this.kids ? this.kids.length : 1; };
  function animProxy(m) {
    const P2 = { __anim: 'animate', mob: m, calls: [], kw: {} };
    P2.__pyget = name => { if (name === 'set_run_time') return nat(([t]) => { P2.kw.run_time = t; return P2; }); const f = M[name]; return nat((a, k) => { if (f) P2.calls.push([f, a, k]); return P2; }); };
    P2.__pycall = (a, k) => { Object.assign(P2.kw, k); return P2; };
    return P2;
  }
  S._M = M; S._col = col; S._vecOf = vecOf; S._FW = FW;
  return { n, shapes, group, col, C, DIRS, FW, FH };
}

/* ── انیمیشن‌ها و ضبط زمان ─────────────────────────────────── */
const RATE = { linear: 'linear', smooth: 'inOutCubic', rush_into: 'inQuad', rush_from: 'outQuad', there_and_back: 'inOutSine', double_smooth: 'inOutCubic', slow_into: 'outCirc', exponential_decay: 'outExpo', lingering: 'outQuad',
  ease_in_sine: 'inSine', ease_out_sine: 'outSine', ease_in_out_sine: 'inOutSine', ease_in_quad: 'inQuad', ease_out_quad: 'outQuad', ease_in_out_quad: 'inOutQuad', ease_in_cubic: 'inCubic', ease_out_cubic: 'outCubic', ease_in_out_cubic: 'inOutCubic',
  ease_out_back: 'outBack', ease_in_back: 'inBack', ease_out_bounce: 'inBounce', ease_out_elastic: 'outElastic', ease_in_expo: 'inExpo', ease_out_expo: 'outExpo' };
const DRAWABLE = ['ellipse', 'rect', 'polygon', 'star', 'line', 'ring', 'arrow', 'cross', 'curve'];

class Recorder {
  constructor(S, name, t0) { this.S = S; this.name = name; this.T = t0; this.on = new Set(); this.inAnim = false; this.bg = null; }
  track(l) {
    if (!l.track || l.track.closed) {
      l.track = { look: { ...l, kids: null, track: null }, t0: this.T, t1: null, base: { x: l.x, y: l.y, sc: l.sc, rot: l.rot, opacity: l.opacity, fill: l.fill, stroke: l.stroke, fillOp: l.fillOp }, keys: {}, enter: null, exit: null, scene: this.name };
      this.S.tracks.push(l.track);
    }
    return l.track;
  }
  show(m) { if (!(m instanceof Mob)) return; for (const l of m.leaves()) if (!this.on.has(l)) { this.on.add(l); this.track(l); } }
  hide(m, t = this.T) { if (!(m instanceof Mob)) return; for (const l of m.leaves()) if (this.on.has(l)) { this.on.delete(l); l.track.t1 = t; l.track.closed = true; } }
  key(tr, p, t, v, e) { (tr.keys[p] ||= []).push([t, v, e]); }
  diff(tr, s, l, ta, tb, e) {
    for (const p of ['x', 'y', 'sc', 'rot', 'opacity', 'fill', 'stroke', 'fillOp']) {
      if (s[p] === l[p]) continue;
      if (!tr.keys[p]?.length) this.key(tr, p, tr.t0, tr.base[p], 'hold');
      this.key(tr, p, ta, s[p], e); this.key(tr, p, tb, l[p], 'linear');
    }
  }
  instant(before) { for (const s of before) if (this.on.has(s.m)) this.diff(s.m.track, s, s.m, this.T, this.T + 0.001, 'hold'); }
  play(items, k) {
    const rt = +(k.run_time ?? 1) || 1, ease = k.rate_func?.__ease || 'inOutCubic', lag = +(k.lag_ratio ?? 0);
    const list = items.flat().filter(Boolean), T0 = this.T;
    list.forEach((a, i) => this.anim(a, T0 + i * lag * rt, rt, ease));
    this.T = T0 + rt + Math.max(0, list.length - 1) * lag * rt;
  }
  anim(a, t0, rt, ease) {
    const S = this.S, M = S._M, vecOf = S._vecOf;
    if (!a) return;
    if (a instanceof Mob) { this.show(a); return; }
    const kw = a.kw || {};
    if (kw.run_time != null) rt = +kw.run_time;
    if (kw.rate_func?.__ease) ease = kw.rate_func.__ease;
    const t1 = t0 + rt, type = a.__anim || (a.__mob ? 'ApplyMethod' : null);
    const mob = a.mob || a.args?.find(x => x instanceof Mob);
    const leaves = mob instanceof Mob ? mob.leaves() : [];
    const K = (l, p, va, vb, e = ease) => { const tr = l.track; this.key(tr, p, t0, va, e); this.key(tr, p, t1, vb, 'linear'); };
    const morph = (m, fn) => { const before = m.snap(); this.inAnim = true; try { fn(); } finally { this.inAnim = false; } for (const s of before) { if (!this.on.has(s.m)) { const keep = { ...s.m }; Object.assign(s.m, s); this.show(s.m); Object.assign(s.m, keep); } this.diff(s.m.track, s, s.m, t0, t1, ease); } };
    const appear = () => { const T = this.T; this.T = t0; this.show(mob); this.T = T; };
    switch (type) {
      case 'animate': morph(a.mob, () => { for (const [f, ar, kk] of a.calls) f(a.mob, ar, kk); }); return;
      case 'ApplyMethod': { const f = a.__mob ? a : a.args?.[0]; if (f?.__mob) morph(f.__mob, () => M[f.__mname](f.__mob, a.__mob ? [] : a.args.slice(1), {})); return; }
      case 'MoveToTarget': if (mob?.target instanceof Mob) morph(mob, () => mob.copyLook(mob.target)); return;
      case 'Create': case 'ShowCreation': case 'DrawBorderThenFill': case 'DrawBorder': case 'Write': case 'AddTextLetterByLetter': case 'AddTextWordByWord':
        appear();
        for (const l of leaves) {
          if (l.kind === 'text') l.track.enter = [type === 'AddTextWordByWord' ? 'wordsFade' : 'typewriter', rt];
          else if (DRAWABLE.includes(l.kind)) { K(l, 'trimE', 0, 100); if (l.fillOp > 0 && type !== 'Create') { this.key(l.track, 'fillOp', t0, 0, 'hold'); this.key(l.track, 'fillOp', t0 + rt / 2, 0, ease); this.key(l.track, 'fillOp', t1, l.fillOp, 'linear'); } }
          else l.track.enter = ['fade', rt];
        }
        return;
      case 'FadeIn': case 'FadeInFromLarge': {
        appear();
        const sh = kw.shift != null ? vecOf(kw.shift) : null, scl = kw.scale != null ? +kw.scale : type === 'FadeInFromLarge' ? 2 : null;
        for (const l of leaves) { K(l, 'opacity', 0, l.opacity); if (sh) { K(l, 'x', l.x - sh[0], l.x); K(l, 'y', l.y - sh[1], l.y); } if (scl) K(l, 'sc', l.sc * scl, l.sc); }
        return;
      }
      case 'GrowFromCenter': case 'GrowFromPoint': case 'GrowFromEdge': case 'GrowArrow': case 'SpinInFromNothing':
        appear();
        for (const l of leaves) { K(l, 'sc', l.sc * 0.001, l.sc, ease === 'inOutCubic' ? 'outBack' : ease); if (type === 'SpinInFromNothing') K(l, 'rot', l.rot - Math.PI, l.rot); }
        return;
      case 'FadeOut': case 'Uncreate': case 'Unwrite': case 'ShrinkToCenter': {
        const sh = kw.shift != null ? vecOf(kw.shift) : null;
        for (const l of leaves) {
          if (!this.on.has(l)) continue;
          if (type === 'FadeOut') { K(l, 'opacity', l.opacity, 0); if (sh) { K(l, 'x', l.x, l.x + sh[0]); K(l, 'y', l.y, l.y + sh[1]); } }
          else if (type === 'ShrinkToCenter') K(l, 'sc', l.sc, l.sc * 0.001);
          else if (l.kind === 'text') l.track.exit = ['fade', rt];
          else K(l, 'trimE', 100, 0);
        }
        this.hide(mob, t1);
        return;
      }
      case 'Transform': case 'ReplacementTransform': case 'TransformMatchingTex': case 'TransformMatchingShapes': case 'FadeTransform': case 'ClockwiseTransform': case 'CounterclockwiseTransform': case 'TransformFromCopy': {
        const src = a.args[0], dst = a.args[1];
        if (!(src instanceof Mob) || !(dst instanceof Mob)) return;
        const copy = type === 'TransformFromCopy';
        const sc = src.center();
        if (!copy) { for (const l of src.leaves()) if (this.on.has(l)) K(l, 'opacity', l.opacity, 0); this.hide(src, t1); }
        let target = dst;
        if (type === 'Transform' || type === 'ClockwiseTransform' || type === 'CounterclockwiseTransform') { src.copyLook(dst); src.leaves().forEach(l => (l.track = null)); target = src; }
        const tc = target.center(), T = this.T; this.T = t0;
        for (const l of target.leaves()) if (!this.on.has(l)) l.track = null;
        this.show(target); this.T = T;
        const far = Math.hypot(sc[0] - tc[0], sc[1] - tc[1]) > 0.05;
        for (const l of target.leaves()) { K(l, 'opacity', 0, l.opacity); if (far) { K(l, 'x', l.x + sc[0] - tc[0], l.x); K(l, 'y', l.y + sc[1] - tc[1], l.y); } }
        return;
      }
      case 'Indicate': case 'Circumscribe': case 'Flash': case 'Wiggle': case 'ApplyWave': case 'FocusOn': case 'ShowPassingFlash': case 'Blink': case 'ScaleInPlace': {
        const f = type === 'ScaleInPlace' ? +(a.args[1] ?? 1.2) : +(kw.scale_factor ?? 1.2);
        for (const l of leaves) {
          if (!this.on.has(l)) this.show(l);
          const tr = l.track;
          this.key(tr, 'sc', t0, l.sc, 'inOutSine'); this.key(tr, 'sc', t0 + rt / 2, l.sc * f, 'inOutSine'); this.key(tr, 'sc', t1, type === 'ScaleInPlace' ? l.sc * f : l.sc, 'linear');
          if (type === 'ScaleInPlace') l.sc *= f;
          if (type === 'Indicate') { const c0 = l.fill, ic = S._col(kw.color, C.YELLOW); this.key(tr, 'fill', t0, c0, 'hold'); this.key(tr, 'fill', t0 + rt * 0.1, ic, 'hold'); this.key(tr, 'fill', t1, c0, 'hold'); }
        }
        return;
      }
      case 'Rotate': case 'Rotating': {
        const ang = +(kw.angle ?? a.args[1] ?? (type === 'Rotating' ? 2 * Math.PI : Math.PI));
        morph(mob, () => { const c = kw.about_point ? vecOf(kw.about_point) : mob.center(); mob.rotateAbout(ang, c[0], c[1]); });
        return;
      }
      case 'MoveAlongPath': {
        const path = a.args[1]; if (!(path instanceof Mob)) return;
        const pl = path.leaves()[0], N = 16;
        for (const l of leaves) {
          if (!this.on.has(l)) this.show(l);
          for (let i = 0; i <= N; i++) {
            const u = i / N; let px, py;
            if (pl.kind === 'line' || pl.kind === 'arrow') { px = pl.x + Math.cos(pl.rot) * pl.w * pl.sc * (u - 0.5); py = pl.y + Math.sin(pl.rot) * pl.w * pl.sc * (u - 0.5); }
            else { const an = 2 * Math.PI * u; px = pl.x + Math.cos(an) * pl.w * pl.sc / 2; py = pl.y + Math.sin(an) * pl.h * pl.sc / 2; }
            this.key(l.track, 'x', t0 + u * rt, px, 'linear'); this.key(l.track, 'y', t0 + u * rt, py, 'linear');
            if (i === N) { l.x = px; l.y = py; }
          }
        }
        return;
      }
      case 'AnimationGroup': case 'LaggedStart': case 'LaggedStartMap': case 'Succession': {
        const list = a.list;
        if (type === 'Succession') { let t = t0; const each = rt / Math.max(1, list.length); for (const x of list) { const d = x.kw?.run_time ?? each; this.anim(x, t, d, ease); t += d; } }
        else { const lag = +(kw.lag_ratio ?? (type === 'AnimationGroup' ? 0 : 0.05)), each = rt / (1 + lag * Math.max(0, list.length - 1)); list.forEach((x, i) => this.anim(x, t0 + i * lag * each, each, ease)); }
        return;
      }
      case 'Wait': return;
      default: if (mob instanceof Mob) appear();
    }
  }
}

export function manimModules(S) {
  const core = manimCore(S);
  const { n, shapes, group, col, DIRS: D, FW, FH } = core;
  S.makeRec = (name, t0) => new Recorder(S, name, t0);
  const A = type => n((a, k) => ({ __anim: type, args: a, kw: k, mob: a.find(x => x instanceof Mob) }), type);
  const ANIMS = {};
  for (const t of ['Create', 'Write', 'DrawBorderThenFill', 'ShowCreation', 'AddTextLetterByLetter', 'AddTextWordByWord', 'Unwrite', 'Uncreate', 'FadeIn', 'FadeOut', 'FadeInFromLarge', 'GrowFromCenter', 'GrowFromPoint', 'GrowFromEdge', 'GrowArrow', 'SpinInFromNothing', 'ShrinkToCenter',
    'Transform', 'ReplacementTransform', 'TransformMatchingTex', 'TransformMatchingShapes', 'FadeTransform', 'TransformFromCopy', 'ClockwiseTransform', 'CounterclockwiseTransform', 'MoveToTarget', 'ApplyMethod',
    'Indicate', 'Circumscribe', 'Flash', 'Wiggle', 'ApplyWave', 'FocusOn', 'ShowPassingFlash', 'Rotate', 'Rotating', 'MoveAlongPath', 'Wait', 'DrawBorder', 'ScaleInPlace', 'Blink']) ANIMS[t] = A(t);
  for (const t of ['AnimationGroup', 'Succession', 'LaggedStart']) ANIMS[t] = n((a, k) => ({ __anim: t, list: a.flat().filter(x => x && (x.__anim || x.__mob)), kw: k }), t);
  ANIMS.LaggedStartMap = n(([f, g], k) => ({ __anim: 'LaggedStart', list: (g?.kids || []).map(m => S.interp.call(f, [m], {})), kw: k }));
  ANIMS.FadeInFrom = ANIMS.FadeIn; ANIMS.FadeOutAndShift = ANIMS.FadeOut; ANIMS.ShowCreationThenDestruction = ANIMS.Create;
  const rateMod = new PyModule('rate_functions', Object.fromEntries(Object.entries(RATE).map(([k, v]) => [k, Object.assign(n(([t]) => t, k), { __ease: v })])));

  const meth = (f, name) => { f.__native = true; f.__method = true; f.__name = name; return f; };
  const showAll = a => { for (const m of a.flat()) if (m instanceof Mob) S.cur?.show(m); return null; };
  const methods = {
    construct: () => null, setup: () => null,
    play: ([, ...a], k) => { S.cur?.play(a, k); return null; },
    wait: ([, t = 1], k) => { if (S.cur) S.cur.T += +(k.duration ?? t) || 1; return null; },
    pause: ([, t = 1]) => { if (S.cur) S.cur.T += +t || 1; return null; },
    add: ([, ...a]) => showAll(a), add_foreground_mobject: ([, ...a]) => showAll(a), add_foreground_mobjects: ([, ...a]) => showAll(a),
    remove: ([, ...a]) => { for (const m of a.flat()) if (m instanceof Mob) S.cur?.hide(m); return null; },
    clear: () => { if (S.cur) for (const l of [...S.cur.on]) S.cur.hide(l); return null; },
    bring_to_front: ([, ...a]) => { for (const m of a) if (m instanceof Mob) m.leaves().forEach(l => (l.z = 100 + (S.zc = (S.zc || 0) + 1))); return null; },
    bring_to_back: ([, ...a]) => { for (const m of a) if (m instanceof Mob) m.leaves().forEach(l => (l.z = -100 - (S.zc = (S.zc || 0) + 1))); return null; },
    add_sound: ([, f]) => { S.audio.push(String(f)); return null; }, next_section: () => null,
    set_camera_orientation: () => null, move_camera: ([], k) => { if (S.cur) S.cur.T += +(k.run_time ?? 1); return null; }, begin_ambient_camera_rotation: () => null,
  };
  for (const [k, f] of Object.entries(methods)) meth(f, k);
  const camera = { __pyset(k, v) { if (k === 'background_color') { if (S.cur) S.cur.bg = col(v, '#000000'); else S.bg = col(v, '#000000'); } }, __pyget(k) { if (k === 'background_color') return S.cur?.bg ?? S.bg; if (k === 'frame') { S.warn('حرکت دوربین (camera.frame) نادیده گرفته شد.'); return new Mob('group', { kids: [] }); } return new Unk('camera.' + k); } };
  const Scene = new NativeClass('Scene', { init: () => {}, methods, attrs: { camera } });
  const config = { __pyset(k, v) { if (k === 'background_color') S.bg = col(v, '#000000'); if (k === 'pixel_width') S.W0 = +v; if (k === 'pixel_height') S.H0 = +v; }, __pyget(k) { return { frame_width: FW() * 2, frame_height: FH * 2, pixel_width: S.W0 || 1920, pixel_height: S.H0 || 1080, background_color: S.bg, frame_rate: 30 }[k] ?? new Unk('config.' + k); }, __getitem(k) { return this.__pyget(k); }, __setitem(k, v) { this.__pyset(k, v); } };
  const vecOf = S._vecOf;
  const np = new PyModule('numpy', {
    array: n(([a]) => (Array.isArray(a) && a.length <= 3 && a.every(x => typeof x === 'number') ? new Vec(a) : a)), pi: Math.PI, e: Math.E, inf: Infinity,
    linspace: n(([a, b, k = 50]) => [...Array(k)].map((_, i) => a + (b - a) * (k === 1 ? 0 : i / (k - 1)))), arange: n(([a, b, st = 1]) => { if (b == null) { b = a; a = 0; } const o = []; for (let x = a; st > 0 ? x < b : x > b; x += st) o.push(x); return o; }),
    sin: n(([x]) => Math.sin(x)), cos: n(([x]) => Math.cos(x)), tan: n(([x]) => Math.tan(x)), sqrt: n(([x]) => Math.sqrt(x)), exp: n(([x]) => Math.exp(x)), abs: n(([x]) => Math.abs(x)), arctan2: n(([a, b]) => Math.atan2(a, b)),
    radians: n(([x]) => x * Math.PI / 180), degrees: n(([x]) => x * 180 / Math.PI), clip: n(([x, a, b]) => Math.max(a, Math.min(b, x))), floor: n(([x]) => Math.floor(x)), ceil: n(([x]) => Math.ceil(x)),
    zeros: n(([k]) => (k === 3 ? new Vec([0, 0, 0]) : Array(+k || 0).fill(0))), ones: n(([k]) => Array(+k || 0).fill(1)), dot: n(([a, b]) => vecOf(a).reduce((s, x, i) => s + x * vecOf(b)[i], 0)),
    random: new PyModule('numpy.random', { random: n(() => Math.random()), uniform: n(([a = 0, b = 1]) => a + (b - a) * Math.random()), randint: n(([a, b]) => a + Math.floor(Math.random() * (b - a))), seed: n(() => null) }),
    linalg: new PyModule('linalg', { norm: n(([v]) => Math.hypot(...vecOf(v))) }),
  });
  const d = {
    ...C, ...D, ...shapes, ...ANIMS, VGroup: group, Group: group, VMobject: n(() => new Mob('group', { kids: [] })), Mobject: n(() => new Mob('group', { kids: [] })),
    Scene, MovingCameraScene: Scene, ThreeDScene: Scene, ZoomedScene: Scene, InteractiveScene: Scene, VectorScene: Scene,
    config, np, PI: Math.PI, TAU: 2 * Math.PI, DEGREES: Math.PI / 180, SMALL_BUFF: 0.1, MED_SMALL_BUFF: 0.25, MED_LARGE_BUFF: 0.5, LARGE_BUFF: 1,
    FRAME_WIDTH: FW() * 2, FRAME_HEIGHT: 8, BOLD: 'BOLD', ITALIC: 'ITALIC', NORMAL: 'NORMAL', ...rateMod.d, rate_functions: rateMod,
    interpolate_color: n(([a, b, u]) => { const A2 = col(a, '#000000'), B2 = col(b, '#000000'), h = (s, i) => parseInt(s.slice(1 + i * 2, 3 + i * 2), 16); return '#' + [0, 1, 2].map(i => Math.round(h(A2, i) + (h(B2, i) - h(A2, i)) * u).toString(16).padStart(2, '0')).join('').toUpperCase(); }),
    rgb_to_color: n(([c]) => toHex(c, '#FFFFFF', '1')), ManimColor: n(([c]) => col(c, '#FFFFFF')), random_color: n(() => C.BLUE), random_bright_color: n(() => C.GREEN),
    color_gradient: n(([cs, k]) => { const l = Array.isArray(cs) ? cs : []; return [...Array(+k || 2)].map((_, i) => l[Math.min(l.length - 1, Math.floor(i * l.length / (+k || 2)))]); }),
    ValueTracker: n(([v = 0]) => { S.warn('ValueTracker / always_redraw فقط تقریبی خوانده می‌شود.'); const o = { v: +v }; o.__pyget = k => (k === 'get_value' ? nat(() => o.v) : k === 'set_value' ? nat(([x]) => { o.v = +x; return o; }) : k === 'increment_value' ? nat(([x]) => { o.v += +x; return o; }) : k === 'animate' ? { __anim: 'Wait', __pyget: () => nat(function () { return this; }) } : new Unk('tracker.' + k)); return o; }),
    always_redraw: n(([f]) => { try { const r = S.interp.call(f, [], {}); return r instanceof Mob ? r : new Mob('group', { kids: [] }); } catch { return new Mob('group', { kids: [] }); } }),
  };
  const mod = new PyModule('manim', d);
  return { manim: mod, manimlib: mod, 'manim.*': mod, 'manimlib.*': mod, numpy: np, 'numpy.*': np, __Scene: Scene };
}

/** اجرای construct همهٔ کلاس‌های صحنه، پشت سر هم */
export function runManimScenes(S, globals, I, Scene) {
  const all = Object.values(globals).filter(v => v instanceof PyClass && I.nativeBase(v) === Scene && I.classLookup(v, 'construct') instanceof PyFunc);
  const leaf = all.filter(c => !all.some(o => o !== c && o.bases.includes(c)));
  const scenes = []; let T = 0;
  for (const cls of leaf) {
    S.cur = S.makeRec(cls.name, T);
    const inst = I.instantiate(cls, [], {});
    for (const nm of ['setup', 'construct']) {
      const f = I.classLookup(cls, nm);
      if (f instanceof PyFunc) { try { I.callFunc(f, [inst], {}); } catch (e) { S.warn(`خطا در ${cls.name}.${nm} (خط ${e.line ?? I.line}): ${e.message}`); } }
    }
    const end = Math.max(S.cur.T, T + 0.5);
    for (const l of [...S.cur.on]) S.cur.hide(l, end);
    scenes.push({ name: cls.name, t0: T, t1: end, bg: S.cur.bg || S.bg || '#000000' });
    T = end;
  }
  S.cur = null;
  return scenes;
}

/** مسیرها ← مدل میانی */
export function manimModel(S, scenes, { source = 'scene.py' } = {}) {
  const W0 = S.W0 || 1920, H0 = S.H0 || 1080, U = H0 / 8, k1080 = H0 / 1080;
  const items = scenes.map(sc => ({ type: 'bg', c: sc.bg, t0: sc.t0, t1: sc.t1, z: -1e6 }));
  const deg = r => +(-r * 180 / Math.PI).toFixed(2);
  const hexA = (h, a) => (a >= 0.999 ? h : String(h).slice(0, 7) + Math.round(Math.max(0, Math.min(1, a)) * 255).toString(16).padStart(2, '0').toUpperCase());
  const NAMES = { ellipse: 'دایره', rect: 'مستطیل', polygon: 'چندضلعی', star: 'ستاره', line: 'خط', arrow: 'پیکان', ring: 'حلقه', cross: 'ضربدر' };
  for (const tr of S.tracks) {
    if (tr.t1 == null || tr.t1 - tr.t0 < 0.01) continue;
    const L = tr.look, b = tr.base;
    const it = { t0: tr.t0, t1: tr.t1, z: L.z || 0, x: b.x * U, y: -b.y * U, rot: deg(b.rot), opacity: b.opacity };
    const conv = { x: v => v * U, y: v => -v * U, rot: deg, opacity: v => v, sc: v => v / (b.sc || 1), fill: v => v, stroke: v => v, trimE: v => v };
    const keys = {};
    for (const [p, arr] of Object.entries(tr.keys)) if (conv[p]) keys[p] = arr.map(([t, v, e]) => [t, conv[p](v), e]);
    if (tr.keys.fillOp && L.kind !== 'text') keys.fill = tr.keys.fillOp.map(([t, v, e]) => [t, hexA(b.fill, v), e]);
    it.keys = keys;
    if (tr.enter) it.enter = tr.enter; if (tr.exit) it.exit = tr.exit;
    const w = L.w * b.sc * U, h = L.h * b.sc * U, sw = (L.strokeW ?? 4) * 1.3 * k1080;
    if (L.kind === 'text') {
      Object.assign(it, { type: 'text', str: L.text, size: Math.round(L.fontSize * 2 * k1080 * b.sc), color: b.fill, font: /mono|courier/i.test(L.font || '') ? 'mono' : /serif|times/i.test(L.font || '') && !/sans/i.test(L.font || '') ? 'serif' : L.bold ? 'black' : 'bold' });
    } else if (L.kind === 'image') {
      Object.assign(it, { type: 'shape', kind: 'rect', w, h, fill: '#23232E', stroke: '#8A8AA0', strokeW: 4, name: `📁 ${String(L.file).split('/').pop()}` });
      items.push(it);
      items.push({ type: 'text', t0: it.t0, t1: it.t1, z: it.z + 0.1, x: it.x, y: it.y, str: `🖼 ${String(L.file).split('/').pop()}`, size: 28, color: '#C8C8D8', font: 'mono', keys: { x: keys.x, y: keys.y, opacity: keys.opacity } });
      continue;
    } else if (L.kind === 'curve') {
      const k = b.sc || 1, P = L.pts.map(([x, y]) => [+(x * U * k).toFixed(1), +(-y * U * k).toFixed(1)]);
      const w0 = Math.max(1, L.w * k * U);
      if (keys.trimE) { keys.p1 = keys.trimE; delete keys.trimE; }
      Object.assign(it, { type: 'code', w: +w0.toFixed(1), h: +Math.max(1, L.h * k * U).toFixed(1), p1: keys.p1 ? undefined : 100, name: '〰 منحنی', src: [
        '// 〰 منحنی (از Manim) — نقطه‌ها پیکسل از وسط، در قاب اصلی',
        `const PTS = ${JSON.stringify(P)};`,
        `const COLOR = '${b.stroke}', WIDTH = ${+sw.toFixed(1)};   // رنگ و ضخامت خط`,
        `const W0 = ${+w0.toFixed(1)};   // پهنای اصلی (برای مقیاس)`,
        'const k = e.w / W0, n = Math.max(1, Math.round((PTS.length - 1) * Math.min(1, e.p1 / 100)));',
        "ctx.save(); ctx.scale(k, k); ctx.strokeStyle = COLOR; ctx.lineWidth = WIDTH; ctx.lineJoin = 'round'; ctx.lineCap = 'round';",
        'ctx.beginPath(); PTS.slice(0, n + 1).forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));',
        'ctx.stroke(); ctx.restore();'].join('\n') });
      if (it.keys.sc) delete it.keys.sc;
    } else if (L.kind === 'grid') {
      Object.assign(it, { type: 'el', kind: 'dotGrid', p: { c1: L.stroke }, x: 0, y: 0, opacity: 0.6 });
    } else if (L.kind !== 'group') {
      Object.assign(it, { type: 'shape', kind: L.kind, w, h: L.kind === 'line' ? Math.max(2, sw) : h, stroke: sw > 0 ? b.stroke : undefined, strokeW: sw > 0 ? +sw.toFixed(1) : undefined, radius: L.radius ? L.radius * U : undefined, sides: L.sides, inner: L.inner, trimE: L.trimE, name: NAMES[L.kind] });
      if (b.fillOp > 0.001 && L.kind !== 'line') it.fill = hexA(b.fill, b.fillOp);
      else if (tr.keys.fillOp) it.fill = hexA(b.fill, 0);
      else it.fillOn = false;
    } else continue;
    items.push(it);
  }
  return { W0, H0, duration: scenes.length ? scenes[scenes.length - 1].t1 : 1, items, scenes: scenes.map(s => ({ name: s.name, t0: s.t0, t1: s.t1 })), notes: scenes.length > 1 ? ['چند کلاس Scene پیدا شد؛ پشت سر هم چیده شدند.'] : [], source, kindLabel: 'Manim', media: S.media, audio: S.audio };
}
