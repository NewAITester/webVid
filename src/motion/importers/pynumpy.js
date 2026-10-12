import { nat, PyModule, Unk, tup, isTuple, PyError } from './pyinterp.js';
import { ELLIPSIS } from './pyparse.js';

/**
 * numpy کوچک برای مفسر پایتون
 * ─────────────────────────────────────────────────────────────
 * آرایهٔ چندبعدی (Float64Array + shape) با پخش (broadcasting)، اندیس‌گذاری
 * (عدد، برش، None، آرایهٔ اندیس/ماسک)، تابع‌های ریاضی، random و چند ابزار رایج.
 * آرایه‌های خیلی بزرگ (مثل نویز تمام‌صفحه برای پردازش نهایی) ساخته نمی‌شوند و
 * «نامعلوم» برمی‌گردند تا اجرا سبک بماند.
 */
export const MAXN = 4.2e6;
const prod = s => s.reduce((a, b) => a * b, 1);
const isNum = v => typeof v === 'number' || typeof v === 'boolean';
const INT_T = new Set(['int', 'int8', 'int16', 'int32', 'int64', 'uint8', 'uint16', 'uint32', 'bool', 'intp', 'uint64']);

export class ND {
  constructor(data, shape, dtype = 'float64') { this.data = data; this.shape = shape; this.dtype = dtype; }
  get size() { return this.data.length; }
  get ndim() { return this.shape.length; }
  __len() { return this.shape[0] ?? 0; }
  __bool() { if (this.size === 1) return !!this.data[0]; return this.size > 0; }
  __iter() {
    if (this.ndim === 0) return [this.data[0]];
    if (this.ndim === 1) return Array.from(this.data);
    const n = this.shape[0], rs = this.shape.slice(1), m = prod(rs), out = [];
    for (let i = 0; i < n; i++) out.push(new ND(this.data.slice(i * m, (i + 1) * m), rs, this.dtype));
    return out;
  }
  __op(op, o, rev) { return ndOp(op, this, o, rev); }
  __getitem(k) { return getItem(this, k); }
  __setitem(k, v) { setItem(this, k, v); }
  __pyget(name) { return ndAttr(this, name); }
  __eq(o) { const r = ndOp('cmp==', this, o, false); return r instanceof ND ? r.data.every(x => x) : false; }
  toString() { return `array(${this.ndim <= 1 ? '[' + Array.from(this.data.slice(0, 8)).map(x => +x.toFixed(4)).join(', ') + (this.size > 8 ? ', …' : '') + ']' : 'shape=' + this.shape.join('×')})`; }
  __repr() { return this.toString(); }
}
/** بایت‌ها (خروجی tobytes / get_data) */
export class Bytes { constructor(u8) { this.u8 = u8; } __len() { return this.u8.length; } __repr() { return `<bytes ${this.u8.length}>`; } }

const big = () => new Unk('آرایهٔ خیلی بزرگ (نادیده گرفته شد)');
export function mk(shape, dtype = 'float64', data = null) {
  const n = prod(shape);
  if (n > MAXN) return big();
  return new ND(data || new Float64Array(n), shape, dtype);
}
const isND = v => v instanceof ND;

/** هر چیزی ← ND (یا Unk) */
export function asND(v, dtype) {
  if (v instanceof ND) return dtype ? astype(v, dtype) : v;
  if (v instanceof Unk) return v;
  if (isNum(v)) return new ND(Float64Array.of(+v), [], dtype || (Number.isInteger(+v) && typeof v !== 'number' ? 'bool' : 'float64'));
  if (Array.isArray(v)) {
    if (!v.length) return new ND(new Float64Array(0), [0]);
    const parts = v.map(x => asND(x));
    if (parts.some(p => p instanceof Unk)) return parts.find(p => p instanceof Unk);
    const s0 = parts[0].shape;
    const shape = [v.length, ...s0], m = prod(s0);
    const out = mk(shape); if (!(out instanceof ND)) return out;
    parts.forEach((p, i) => out.data.set(p.data.subarray(0, m), i * m));
    out.dtype = dtype || (parts.every(p => INT_T.has(p.dtype)) && v.flat(Infinity).every(x => typeof x !== 'number' || Number.isInteger(x)) ? 'int64' : 'float64');
    return out;
  }
  if (v instanceof Bytes) return new ND(Float64Array.from(v.u8), [v.u8.length], 'uint8');
  return new Unk('array');
}
const num0 = a => (a instanceof ND && a.ndim === 0 ? a.data[0] : a);
const wrap = (r, scalarIn) => (scalarIn && r instanceof ND && r.ndim === 0 ? r.data[0] : r);

function bshape(a, b) {
  const n = Math.max(a.length, b.length), out = [];
  for (let i = 0; i < n; i++) {
    const x = a[a.length - n + i] ?? 1, y = b[b.length - n + i] ?? 1;
    if (x !== y && x !== 1 && y !== 1) throw new PyError(`شکل آرایه‌ها جور نیست: (${a}) و (${b})`, 0, 'ValueError');
    out.push(Math.max(x, y));
  }
  return out;
}
/** ایندکس‌های پخش‌شده: برای هر آرایه، نقشهٔ اندیس خروجی ← اندیس خودش */
function bmap(shape, s) {
  const n = shape.length, strides = new Array(n).fill(0);
  let st = 1;
  for (let i = s.length - 1; i >= 0; i--) { const ax = n - s.length + i; strides[ax] = s[i] === 1 ? 0 : st; st *= s[i]; }
  return strides;
}
function broadcastN(arrs, f, dtype = 'float64') {
  let shape = [];
  for (const a of arrs) shape = bshape(shape, a.shape);
  const out = mk(shape, dtype); if (!(out instanceof ND)) return out;
  const N = out.size, D = arrs.map(a => a.data);
  if (arrs.every(a => a.size === N)) { const k = arrs.length; if (k === 1) for (let i = 0; i < N; i++) out.data[i] = f(D[0][i]); else if (k === 2) for (let i = 0; i < N; i++) out.data[i] = f(D[0][i], D[1][i]); else for (let i = 0; i < N; i++) out.data[i] = f(...D.map(d => d[i])); return out; }
  if (arrs.length === 2 && arrs[1].size === 1) { const b = D[1][0], A = D[0]; if (arrs[0].size === N) { for (let i = 0; i < N; i++) out.data[i] = f(A[i], b); return out; } }
  if (arrs.length === 2 && arrs[0].size === 1) { const a = D[0][0], B = D[1]; if (arrs[1].size === N) { for (let i = 0; i < N; i++) out.data[i] = f(a, B[i]); return out; } }
  // سریع: هر آرایه یا هم‌اندازهٔ خروجی است، یا تک‌مقدار، یا شکلش انتهای شکل خروجی است (پخش ردیفی)
  const modes = arrs.map(a => (a.size === N ? 0 : a.size === 1 ? 1 : a.shape.length <= shape.length && a.shape.every((v, i) => v === shape[shape.length - a.shape.length + i]) ? 2 : -1));
  if (modes.every(m => m >= 0) && arrs.length === 2) {
    const [A, B] = D, [ma, mb] = modes, la = arrs[0].size, lb = arrs[1].size;
    for (let i = 0; i < N; i++) out.data[i] = f(ma === 0 ? A[i] : ma === 1 ? A[0] : A[i % la], mb === 0 ? B[i] : mb === 1 ? B[0] : B[i % lb]);
    return out;
  }
  const strides = arrs.map(a => bmap(shape, a.shape)), n = shape.length, idx = new Array(n).fill(0), pos = arrs.map(() => 0);
  for (let i = 0; i < N; i++) {
    out.data[i] = arrs.length === 2 ? f(D[0][pos[0]], D[1][pos[1]]) : f(...D.map((d, j) => d[pos[j]]));
    for (let ax = n - 1; ax >= 0; ax--) {
      idx[ax]++;
      for (let j = 0; j < pos.length; j++) pos[j] += strides[j][ax];
      if (idx[ax] < shape[ax]) break;
      for (let j = 0; j < pos.length; j++) pos[j] -= strides[j][ax] * shape[ax];
      idx[ax] = 0;
    }
  }
  return out;
}
const pmod = (a, b) => { const r = a % b; return r !== 0 && (r < 0) !== (b < 0) ? r + b : r; };
const BIN = {
  '+': (a, b) => a + b, '-': (a, b) => a - b, '*': (a, b) => a * b, '/': (a, b) => a / b,
  '//': (a, b) => Math.floor(a / b), '%': pmod, '**': (a, b) => Math.pow(a, b),
  '&': (a, b) => +(!!a && !!b), '|': (a, b) => +(!!a || !!b), '^': (a, b) => +(!!a !== !!b),
  'cmp<': (a, b) => +(a < b), 'cmp>': (a, b) => +(a > b), 'cmp<=': (a, b) => +(a <= b), 'cmp>=': (a, b) => +(a >= b), 'cmp==': (a, b) => +(a === b), 'cmp!=': (a, b) => +(a !== b),
};
const FLIP = { 'cmp<': 'cmp>', 'cmp>': 'cmp<', 'cmp<=': 'cmp>=', 'cmp>=': 'cmp<=' };
function ndOp(op, a, o, rev) {
  if (op === 'neg') return mapND(a, x => -x);
  if (op === 'abs') return mapND(a, Math.abs);
  if (o instanceof Unk) return o;
  if (!(isNum(o) || o instanceof ND || Array.isArray(o))) return undefined;
  const b = asND(o); if (b instanceof Unk) return b;
  let f = BIN[op]; if (!f) return undefined;
  let x = a, y = b;
  if (rev) { if (FLIP[op]) f = BIN[FLIP[op]]; else [x, y] = [b, a]; }
  const dt = op.startsWith('cmp') || '&|^'.includes(op) ? 'bool' : (INT_T.has(x.dtype) && INT_T.has(y.dtype) && op !== '/' && op !== '**' ? 'int64' : 'float64');
  if (dt === 'float64' && (op === '+' || op === '-' || op === '*' || op === '/')) { const r = fastBin(op, x, y); if (r) return r; }
  return broadcastN([x, y], f, dt);
}
/* حلقهٔ مستقیم برای + − × ÷ (هم‌اندازه یا با یک عدد) — بدون صدا زدن تابع برای هر خانه */
function fastBin(op, x, y) {
  const n = x.size, m = y.size;
  let sh;
  if (n === m && x.shape.length === y.shape.length && x.shape.every((v, i) => v === y.shape[i])) sh = x.shape;
  else if (m === 1) sh = x.shape; else if (n === 1) sh = y.shape; else return null;
  const o = mk(sh); if (!(o instanceof ND)) return o;
  const A = x.data, B = y.data, O = o.data, N = o.size;
  if (n === m) {
    if (op === '+') for (let i = 0; i < N; i++) O[i] = A[i] + B[i]; else if (op === '-') for (let i = 0; i < N; i++) O[i] = A[i] - B[i];
    else if (op === '*') for (let i = 0; i < N; i++) O[i] = A[i] * B[i]; else for (let i = 0; i < N; i++) O[i] = A[i] / B[i];
  } else if (m === 1) {
    const b = B[0];
    if (op === '+') for (let i = 0; i < N; i++) O[i] = A[i] + b; else if (op === '-') for (let i = 0; i < N; i++) O[i] = A[i] - b;
    else if (op === '*') for (let i = 0; i < N; i++) O[i] = A[i] * b; else for (let i = 0; i < N; i++) O[i] = A[i] / b;
  } else {
    const a = A[0];
    if (op === '+') for (let i = 0; i < N; i++) O[i] = a + B[i]; else if (op === '-') for (let i = 0; i < N; i++) O[i] = a - B[i];
    else if (op === '*') for (let i = 0; i < N; i++) O[i] = a * B[i]; else for (let i = 0; i < N; i++) O[i] = a / B[i];
  }
  return o;
}
function mapND(a, f, dtype) { const o = mk(a.shape, dtype || a.dtype); if (!(o instanceof ND)) return o; const A = a.data, O = o.data, n = A.length; for (let i = 0; i < n; i++) O[i] = f(A[i]); return o; }

/* ── اندیس‌گذاری ── */
function normIdx(k) { return isTuple(k) ? [...k] : [k]; }
function sliceRange(sl, n) {
  const st = sl.c ?? 1;
  const nn = (v, d) => (v == null ? d : v < 0 ? Math.max(st < 0 ? -1 : 0, n + v) : Math.min(v, st < 0 ? n - 1 : n));
  const [a, b] = st > 0 ? [nn(sl.a, 0), nn(sl.b, n)] : [nn(sl.a, n - 1), sl.b == null ? -1 : nn(sl.b, -1)];
  const cnt = Math.max(0, Math.ceil(st > 0 ? (b - a) / st : (a - b) / -st));
  const out = new Array(cnt); for (let j = 0, i = a; j < cnt; j++, i += st) out[j] = i;
  return out;
}
/** شرح اندیس: برای هر محور خروجی، فهرست اندیس‌های ورودی */
function plan(a, k) {
  let items = normIdx(k);
  const ell = items.findIndex(x => x === ELLIPSIS);
  const real = items.filter(x => x !== null && x !== ELLIPSIS).length;
  if (ell >= 0) items.splice(ell, 1, ...Array(Math.max(0, a.ndim - real)).fill({ type: 'slice', a: null, b: null, c: null }));
  const sel = [], outShape = []; let ax = 0;
  for (const it of items) {
    if (it === null) { outShape.push(1); sel.push({ newaxis: true }); continue; }
    const n = a.shape[ax];
    if (n === undefined) throw new PyError('اندیس بیشتر از ابعاد آرایه', 0, 'IndexError');
    if (typeof it === 'number' || typeof it === 'boolean') { let i = +it; if (i < 0) i += n; if (i < 0 || i >= n) throw new PyError(`اندیس ${it} بیرون از بازه است`, 0, 'IndexError'); sel.push({ ax, list: [i], drop: true }); ax++; continue; }
    if (it?.type === 'slice') { const list = Int32Array.from(sliceRange(it, n)); sel.push({ ax, list }); outShape.push(list.length); ax++; continue; }
    if (it instanceof ND || Array.isArray(it)) {
      const ix = asND(it);
      let list;
      if (ix.dtype === 'bool' && ix.size === n) { list = []; for (let i = 0; i < n; i++) if (ix.data[i]) list.push(i); }
      else list = Array.from(ix.data, v => (v < 0 ? v + n : v));
      sel.push({ ax, list }); outShape.push(list.length); ax++; continue;
    }
    throw new PyError('نوع اندیس پشتیبانی نمی‌شود', 0, 'TypeError');
  }
  for (; ax < a.ndim; ax++) { const n = a.shape[ax], list = new Int32Array(n); for (let i = 0; i < n; i++) list[i] = i; sel.push({ ax, list }); outShape.push(n); }
  return { sel: sel.filter(s => !s.newaxis), outShape };
}
function strides(shape) { const s = new Array(shape.length); let st = 1; for (let i = shape.length - 1; i >= 0; i--) { s[i] = st; st *= shape[i]; } return s; }
function gatherIdx(a, sel) {
  const st = strides(a.shape), lists = sel.map(s => s.list), mul = sel.map(s => st[s.ax]);
  const total = lists.reduce((p, l) => p * l.length, 1); const out = new Int32Array(total);
  let k = 0;
  const last = lists.length - 1;
  const rec = (d, base) => {
    const L = lists[d], m = mul[d];
    if (d === last) { for (let i = 0; i < L.length; i++) out[k++] = base + L[i] * m; return; }
    for (let i = 0; i < L.length; i++) rec(d + 1, base + L[i] * m);
  };
  if (!lists.length) { out[0] = 0; return out; }
  if (total) rec(0, 0);
  return out;
}
function getItem(a, k) {
  if (k instanceof Unk) return k;
  if (typeof k === 'number' && a.ndim === 1) { let i = k < 0 ? k + a.shape[0] : k; if (i < 0 || i >= a.shape[0]) throw new PyError(`اندیس ${k} بیرون از بازه است`, 0, 'IndexError'); return a.data[i]; }
  if (typeof k === 'number' && a.ndim >= 2) { const rs = a.shape.slice(1), m = prod(rs); let i = k < 0 ? k + a.shape[0] : k; return new ND(a.data.slice(i * m, (i + 1) * m), rs, a.dtype); }
  const { sel, outShape } = plan(a, k);
  if (prod(outShape) > MAXN) return big();
  const ix = gatherIdx(a, sel);
  if (!outShape.length) return a.data[ix[0]];
  const d = new Float64Array(ix.length); for (let i = 0; i < ix.length; i++) d[i] = a.data[ix[i]];
  return new ND(d, outShape, a.dtype);
}
function setItem(a, k, v) {
  if (v instanceof Unk) return;
  const { sel, outShape } = plan(a, k);
  const ix = gatherIdx(a, sel);
  const src = asND(v); if (src instanceof Unk) return;
  if (src.size === 1) { for (const i of ix) a.data[i] = src.data[0]; return; }
  const b = src.size === ix.length ? src : broadcastN([src, mk(outShape)], x => x);
  for (let i = 0; i < ix.length; i++) a.data[ix[i]] = b.data[i];
}

/* ── نوع داده ── */
const dt = (name, f) => { const fn = nat(([x]) => (x instanceof ND ? astype(x, name) : f(x)), name); fn.__dtype = name; return fn; };
const castFn = name => (name === 'bool' ? x => +!!x : name === 'uint8' ? x => ((Math.trunc(x) % 256) + 256) % 256 : name === 'int16' ? x => ((Math.trunc(x) + 32768) % 65536 + 65536) % 65536 - 32768 : INT_T.has(name) ? Math.trunc : name === 'float32' ? Math.fround : x => x);
const DT_CODES = { i1: 'int8', i2: 'int16', i4: 'int32', i8: 'int64', u1: 'uint8', u2: 'uint16', u4: 'uint32', u8: 'uint64', f2: 'float32', f4: 'float32', f8: 'float64', '?': 'bool', b1: 'bool', b: 'int8', B: 'uint8', h: 'int16', H: 'uint16', i: 'int32', I: 'uint32', l: 'int64', q: 'int64', L: 'uint64', Q: 'uint64', e: 'float32', f: 'float32', d: 'float64', int: 'int64', float: 'float64', double: 'float64', single: 'float32', short: 'int16', ubyte: 'uint8', byte: 'int8', intc: 'int32', bool_: 'bool', float_: 'float64', int_: 'int64' };
function normDtype(s) { s = s.replace(/^(np|numpy)\./, ''); const c = s.replace(/^[<>=|]/, ''); return DT_CODES[c] || (s !== c && DT_CODES[c.toLowerCase()]) || c; }
function dtypeName(d) { if (!d) return null; if (typeof d === 'string') return normDtype(d); if (d.__dtype) return d.__dtype; if (d.__name === 'int') return 'int64'; if (d.__name === 'float') return 'float64'; if (d.__name === 'bool') return 'bool'; return 'float64'; }
export function astype(a, d) { const name = dtypeName(d) || 'float64'; return mapND(a, castFn(name), name); }

function reshape(a, args) {
  let sh = args.length === 1 && Array.isArray(args[0]) ? [...args[0]] : args.map(Number);
  const known = sh.filter(x => x !== -1).reduce((p, x) => p * x, 1);
  sh = sh.map(x => (x === -1 ? a.size / known : x));
  if (prod(sh) !== a.size) throw new PyError(`نمی‌شود آرایهٔ ${a.size} عنصری را به (${sh}) تغییر شکل داد`, 0, 'ValueError');
  return new ND(a.data, sh, a.dtype);
}
function reduce(a, axis, f, init, post) {
  if (axis == null) { let r = init; for (let i = 0; i < a.size; i++) r = f(r, a.data[i], i); return post ? post(r, a.size) : r; }
  if (axis < 0) axis += a.ndim;
  const sh = a.shape, outSh = sh.filter((_, i) => i !== axis), out = mk(outSh.length ? outSh : [1]);
  const st = strides(sh), n = sh[axis];
  const outN = prod(outSh);
  for (let o = 0; o < outN; o++) {
    // اندیس پایه
    let rem = o, base = 0;
    for (let i = sh.length - 1, j = outSh.length - 1; i >= 0; i--) { if (i === axis) continue; const d = rem % sh[i]; rem = Math.floor(rem / sh[i]); base += d * st[i]; j--; }
    let r = init; for (let k = 0; k < n; k++) r = f(r, a.data[base + k * st[axis]], k);
    out.data[o] = post ? post(r, n) : r;
  }
  return outSh.length ? out : out.data[0];
}
const argbest = better => (best, x, i) => (best === null || better(x, best[0]) ? [x, i] : best);
function ndAttr(a, name) {
  switch (name) {
    case 'shape': return tup([...a.shape]);
    case 'size': return a.size; case 'ndim': return a.ndim; case 'dtype': return a.dtype;
    case 'T': if (a.ndim !== 2) return a; { const [r, c] = a.shape, o = mk([c, r]); for (let i = 0; i < r; i++) for (let j = 0; j < c; j++) o.data[j * r + i] = a.data[i * c + j]; return o; }
    case 'astype': return nat(([d]) => astype(a, d));
    case 'reshape': return nat(args => reshape(a, args));
    case 'copy': return nat(() => new ND(a.data.slice(), [...a.shape], a.dtype));
    case 'flatten': case 'ravel': return nat(() => new ND(a.data.slice(), [a.size], a.dtype));
    case 'tolist': return nat(() => toList(a));
    case 'item': return nat(() => a.data[0]);
    case 'tobytes': return nat(() => toBytes(a));
    case 'sum': return nat((x, k) => reduce(a, k.axis ?? x[0], (r, v) => r + v, 0));
    case 'mean': return nat((x, k) => reduce(a, k.axis ?? x[0], (r, v) => r + v, 0, (r, n) => r / n));
    case 'max': return nat((x, k) => reduce(a, k.axis ?? x[0], (r, v) => (v > r ? v : r), -Infinity));
    case 'min': return nat((x, k) => reduce(a, k.axis ?? x[0], (r, v) => (v < r ? v : r), Infinity));
    case 'argmax': return nat(() => reduce(a, null, argbest((x, y) => x > y), null)[1]);
    case 'argmin': return nat(() => reduce(a, null, argbest((x, y) => x < y), null)[1]);
    case 'clip': return nat(([lo, hi]) => clip(a, lo, hi));
    case 'any': return nat(() => a.data.some(x => x)); case 'all': return nat(() => a.data.every(x => x));
    case 'cumsum': return nat(() => cumsum(a));
    case 'round': return nat(([d = 0]) => mapND(a, x => Math.round(x * 10 ** d) / 10 ** d));
    case 'fill': return nat(([v]) => { a.data.fill(+v); return null; });
  }
  return undefined;
}
function toList(a) { if (a.ndim <= 1) return Array.from(a.data); return a.__iter().map(toList); }
function toBytes(a) {
  const n = a.size, d = a.dtype;
  if (d === 'uint8' || d === 'int8' || d === 'bool') return new Bytes(Uint8Array.from(a.data, x => x & 255));
  if (d === 'int16') { const b = new Int16Array(n); for (let i = 0; i < n; i++) b[i] = a.data[i]; return new Bytes(new Uint8Array(b.buffer)); }
  if (d === 'int32') { const b = new Int32Array(n); b.set(a.data); return new Bytes(new Uint8Array(b.buffer)); }
  if (d === 'uint16') { const b = new Uint16Array(n); for (let i = 0; i < n; i++) b[i] = a.data[i]; return new Bytes(new Uint8Array(b.buffer)); }
  if (d === 'uint32') { const b = new Uint32Array(n); for (let i = 0; i < n; i++) b[i] = a.data[i]; return new Bytes(new Uint8Array(b.buffer)); }
  if (d === 'int64' || d === 'uint64') { const b = new BigInt64Array(n); for (let i = 0; i < n; i++) b[i] = BigInt(Math.trunc(a.data[i])); return new Bytes(new Uint8Array(b.buffer)); }
  if (d === 'float32') return new Bytes(new Uint8Array(Float32Array.from(a.data).buffer));
  return new Bytes(new Uint8Array(Float64Array.from(a.data).buffer));
}
function cumsum(a) { const n = a.size, o = mk([n]); let s = 0; for (let i = 0; i < n; i++) { s += a.data[i]; o.data[i] = s; } return o; }
function clip(a, lo, hi) {
  const A = asND(a); if (A instanceof Unk) return A;
  const L = lo == null ? -Infinity : lo, Hh = hi == null ? Infinity : hi;
  if (isNum(L) && isNum(Hh)) { const r = mapND(A, x => (x < L ? L : x > Hh ? Hh : x)); return wrap(r, isNum(a)); }
  return broadcastN([A, asND(L), asND(Hh)], (x, l, h) => Math.min(h, Math.max(l, x)));
}

/* ── random (مولد بذری؛ عددها با numpy واقعی یکی نیستند ولی پخششان همان است) ── */
function rngFrom(seed) {
  let s = (seed == null ? (Math.random() * 2 ** 32) : Math.floor(+seed)) >>> 0 ^ 0x9E3779B9;
  const next = () => { s |= 0; s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  let spare = null;
  const gauss = () => { if (spare != null) { const v = spare; spare = null; return v; } let u = 0; while (!u) u = next(); const v = next(); const r = Math.sqrt(-2 * Math.log(u)); spare = r * Math.sin(2 * Math.PI * v); return r * Math.cos(2 * Math.PI * v); };
  const fill = (size, f, dtype) => {
    if (size == null) return f();
    const sh = Array.isArray(size) ? [...size] : [size];
    const o = mk(sh, dtype); if (!(o instanceof ND)) return o;
    for (let i = 0; i < o.size; i++) o.data[i] = f();
    return o;
  };
  const bc = (v, i) => (v instanceof ND ? v.data[i % v.size] : +v);
  return {
    random: nat(([size], k) => fill(k.size ?? size, next)),
    uniform: nat(([lo = 0, hi = 1, size], k) => fill(k.size ?? size, () => lo + (hi - lo) * next())),
    normal: nat(([loc = 0, scale = 1, size], k) => { loc = k.loc ?? loc; scale = k.scale ?? scale; const sz = k.size ?? size; if (loc instanceof ND || scale instanceof ND) { let i = 0; return fill(sz ?? (loc instanceof ND ? loc.shape : scale.shape), () => { const v = bc(loc, i) + bc(scale, i) * gauss(); i++; return v; }); } return fill(sz, () => loc + scale * gauss()); }),
    standard_normal: nat(([size], k) => fill(k.size ?? size, gauss)),
    integers: nat(([lo, hi, size], k) => { if (hi == null) { hi = lo; lo = 0; } return fill(k.size ?? size, () => lo + Math.floor(next() * (hi - lo)), 'int64'); }),
    randint: nat(([lo, hi, size], k) => { if (hi == null) { hi = lo; lo = 0; } return fill(k.size ?? size, () => lo + Math.floor(next() * (hi - lo)), 'int64'); }),
    choice: nat(([a, size, replace = true, p], k) => {
      size = k.size ?? size; replace = k.replace ?? replace; p = k.p ?? p;
      const pool = typeof a === 'number' ? null : asND(a); const n = pool ? pool.size : a;
      const pick = () => Math.floor(next() * n);
      if (size == null) { const i = pick(); return pool ? pool.data[i] : i; }
      const m = Array.isArray(size) ? prod(size) : size;
      let ids;
      if (replace === false && m <= n) { const all = [...Array(n).keys()]; for (let i = 0; i < m; i++) { const j = i + Math.floor(next() * (n - i)); [all[i], all[j]] = [all[j], all[i]]; } ids = all.slice(0, m); }
      else ids = Array.from({ length: m }, pick);
      const o = mk(Array.isArray(size) ? [...size] : [size], pool ? pool.dtype : 'int64'); if (!(o instanceof ND)) return o;
      ids.forEach((i, j) => { o.data[j] = pool ? pool.data[i] : i; });
      return o;
    }),
    shuffle: nat(([x]) => { if (Array.isArray(x)) for (let i = x.length - 1; i > 0; i--) { const j = Math.floor(next() * (i + 1)); [x[i], x[j]] = [x[j], x[i]]; } else if (x instanceof ND && x.ndim === 1) for (let i = x.size - 1; i > 0; i--) { const j = Math.floor(next() * (i + 1)); [x.data[i], x.data[j]] = [x.data[j], x.data[i]]; } return null; }),
    permutation: nat(([x]) => { const n = typeof x === 'number' ? x : asND(x).size; const all = [...Array(n).keys()]; for (let i = n - 1; i > 0; i--) { const j = Math.floor(next() * (i + 1)); [all[i], all[j]] = [all[j], all[i]]; } return typeof x === 'number' ? new ND(Float64Array.from(all), [n], 'int64') : getItem(asND(x), new ND(Float64Array.from(all), [n], 'int64')); }),
    _next: next, _gauss: gauss,
  };
}

/* ── ماژول numpy ── */
export function numpyModule() {
  const d = {};
  const unary = (f, outInt) => nat(([x]) => { if (x instanceof Unk) return x; if (isNum(x)) return f(+x); const a = asND(x); return a instanceof Unk ? a : mapND(a, f, outInt ? 'int64' : (a.dtype === 'float32' ? 'float32' : 'float64')); });
  const binary = f => nat(([x, y]) => { if (x instanceof Unk) return x; if (y instanceof Unk) return y; if (isNum(x) && isNum(y)) return f(+x, +y); return broadcastN([asND(x), asND(y)], f); });
  const M = Math;
  Object.assign(d, {
    sqrt: unary(M.sqrt), sin: unary(M.sin), cos: unary(M.cos), tan: unary(M.tan), arcsin: unary(M.asin), arccos: unary(M.acos), arctan: unary(M.atan),
    sinh: unary(M.sinh), cosh: unary(M.cosh), tanh: unary(M.tanh), exp: unary(M.exp), log: unary(M.log), log2: unary(M.log2), log10: unary(M.log10), log1p: unary(M.log1p), expm1: unary(M.expm1),
    abs: unary(M.abs), absolute: unary(M.abs), fabs: unary(M.abs), floor: unary(M.floor), ceil: unary(M.ceil), trunc: unary(M.trunc), rint: unary(M.round), sign: unary(M.sign),
    square: unary(x => x * x), negative: unary(x => -x), radians: unary(x => x * M.PI / 180), deg2rad: unary(x => x * M.PI / 180), degrees: unary(x => x * 180 / M.PI), rad2deg: unary(x => x * 180 / M.PI),
    isnan: unary(x => +Number.isNaN(x)), isfinite: unary(x => +Number.isFinite(x)),
    arctan2: binary(M.atan2), hypot: binary(M.hypot), minimum: binary(M.min), maximum: binary(M.max), power: binary(M.pow), mod: binary(pmod), fmod: binary((a, b) => a % b),
    add: binary((a, b) => a + b), subtract: binary((a, b) => a - b), multiply: binary((a, b) => a * b), divide: binary((a, b) => a / b), true_divide: binary((a, b) => a / b),
    round: nat(([x, dd = 0], k) => { const f = 10 ** (k.decimals ?? dd); if (isNum(x)) return M.round(x * f) / f; const a = asND(x); return a instanceof Unk ? a : mapND(a, v => M.round(v * f) / f); }),
    pi: M.PI, e: M.E, inf: Infinity, nan: NaN, newaxis: null, tau: M.PI * 2,
    float32: dt('float32', x => M.fround(+x)), float64: dt('float64', x => +x), float_: dt('float64', x => +x), double: dt('float64', x => +x),
    uint8: dt('uint8', x => ((M.trunc(x) % 256) + 256) % 256), int8: dt('int8', M.trunc), int16: dt('int16', M.trunc), int32: dt('int32', M.trunc), int64: dt('int64', M.trunc), int_: dt('int64', M.trunc), uint16: dt('uint16', M.trunc), uint32: dt('uint32', M.trunc), bool_: dt('bool', x => !!x), intp: dt('int64', M.trunc),
    array: nat(([x], k) => { const a = asND(x, k.dtype); return a instanceof ND ? (a === x ? new ND(a.data.slice(), [...a.shape], a.dtype) : a) : a; }),
    asarray: nat(([x], k) => asND(x, k.dtype)), ascontiguousarray: nat(([x]) => asND(x)),
    zeros: nat(([s, dd], k) => mk(Array.isArray(s) ? [...s] : [s], dtypeName(k.dtype ?? dd) || 'float64')),
    ones: nat(([s, dd], k) => { const o = mk(Array.isArray(s) ? [...s] : [s], dtypeName(k.dtype ?? dd) || 'float64'); if (o instanceof ND) o.data.fill(1); return o; }),
    empty: nat(([s]) => mk(Array.isArray(s) ? [...s] : [s])),
    full: nat(([s, v]) => { const o = mk(Array.isArray(s) ? [...s] : [s]); if (o instanceof ND) o.data.fill(+v); return o; }),
    zeros_like: nat(([a]) => { a = asND(a); return a instanceof ND ? mk([...a.shape], a.dtype) : a; }),
    ones_like: nat(([a]) => { a = asND(a); if (!(a instanceof ND)) return a; const o = mk([...a.shape], a.dtype); o.data.fill(1); return o; }),
    full_like: nat(([a, v]) => { a = asND(a); if (!(a instanceof ND)) return a; const o = mk([...a.shape], a.dtype); o.data.fill(+v); return o; }),
    arange: nat(([a, b, s = 1], k) => { if (b == null) { b = a; a = 0; } const n = Math.max(0, Math.ceil((b - a) / s)); const o = mk([n], [a, b, s].every(Number.isInteger) ? 'int64' : 'float64'); if (o instanceof ND) for (let i = 0; i < n; i++) o.data[i] = a + i * s; return o; }),
    linspace: nat(([a, b, n = 50], k) => { const ep = k.endpoint ?? true; const o = mk([n]); if (!(o instanceof ND)) return o; const st = (b - a) / Math.max(1, ep ? n - 1 : n); for (let i = 0; i < n; i++) o.data[i] = a + i * st; return o; }),
    clip: nat(([a, lo, hi], k) => clip(a, k.a_min ?? lo, k.a_max ?? hi)),
    where: nat(([c, a, b]) => {
      const C = asND(c); if (C instanceof Unk) return C;
      if (a === undefined) return nonzero(C);
      const A = asND(a), B = asND(b); if (A instanceof Unk) return A; if (B instanceof Unk) return B;
      return broadcastN([C, A, B], (cc, x, y) => (cc ? x : y));
    }),
    nonzero: nat(([a]) => nonzero(asND(a))), argwhere: nat(([a]) => { const nz = nonzero(asND(a)); return nz instanceof Unk ? nz : asND(nz[0].__iter().map((_, i) => nz.map(z => z.data[i]))); }),
    stack: nat(([arrs, ax = 0], k) => stack(arrs, k.axis ?? ax)),
    vstack: nat(([arrs]) => concat(arrs.map(a => { a = asND(a); return a.ndim === 1 ? reshape(a, [1, a.size]) : a; }), 0)),
    hstack: nat(([arrs]) => { const As = arrs.map(a => asND(a)); return concat(As, As[0].ndim === 1 ? 0 : 1); }),
    column_stack: nat(([arrs]) => stack(arrs, 1)),
    concatenate: nat(([arrs, ax = 0], k) => concat(arrs.map(a => asND(a)), k.axis ?? ax)),
    sort: nat(([a]) => { a = asND(a); if (!(a instanceof ND)) return a; return new ND(a.data.slice().sort(), [...a.shape], a.dtype); }),
    argsort: nat(([a]) => { a = asND(a); if (!(a instanceof ND)) return a; const ix = [...Array(a.size).keys()].sort((i, j) => a.data[i] - a.data[j] || i - j); return new ND(Float64Array.from(ix), [a.size], 'int64'); }),
    frombuffer: nat(([b, dd], k) => {
      if (!(b instanceof Bytes)) return new Unk('frombuffer');
      const name = dtypeName(k.dtype ?? dd) || 'uint8';
      if (name === 'uint8') return new ND(Float64Array.from(b.u8), [b.u8.length], 'uint8');
      if (name === 'int16') { const v = new Int16Array(b.u8.buffer, b.u8.byteOffset, b.u8.length >> 1); return new ND(Float64Array.from(v), [v.length], 'int16'); }
      if (name === 'float32') { const v = new Float32Array(b.u8.buffer.slice(b.u8.byteOffset, b.u8.byteOffset + (b.u8.length & ~3))); return new ND(Float64Array.from(v), [v.length], 'float32'); }
      return new ND(Float64Array.from(b.u8), [b.u8.length], 'uint8');
    }),
    sum: nat(([a, ax], k) => { a = asND(a); return a instanceof ND ? reduce(a, k.axis ?? ax, (r, v) => r + v, 0) : a; }),
    mean: nat(([a, ax], k) => { a = asND(a); return a instanceof ND ? reduce(a, k.axis ?? ax, (r, v) => r + v, 0, (r, n) => r / n) : a; }),
    max: nat(([a, ax], k) => { a = asND(a); return a instanceof ND ? reduce(a, k.axis ?? ax, (r, v) => (v > r ? v : r), -Infinity) : a; }),
    min: nat(([a, ax], k) => { a = asND(a); return a instanceof ND ? reduce(a, k.axis ?? ax, (r, v) => (v < r ? v : r), Infinity) : a; }),
    amax: null, amin: null,
    argmax: nat(([a]) => { a = asND(a); return reduce(a, null, argbest((x, y) => x > y), null)[1]; }),
    argmin: nat(([a]) => { a = asND(a); return reduce(a, null, argbest((x, y) => x < y), null)[1]; }),
    prod: nat(([a]) => { a = asND(a); return reduce(a, null, (r, v) => r * v, 1); }),
    cumsum: nat(([a]) => { a = asND(a); return a instanceof ND ? cumsum(a) : a; }),
    diff: nat(([a, nn], k) => {
      a = asND(a); if (!(a instanceof ND)) return a;
      const ext = v => { if (v == null) return []; const e = asND(v); return e instanceof ND ? Array.from(e.data) : [+v]; };
      let d = [...ext(k.prepend), ...a.data, ...ext(k.append)];
      for (let r = 0; r < Math.max(1, +(nn ?? k.n ?? 1) || 1); r++) { const q = new Array(Math.max(0, d.length - 1)); for (let i = 1; i < d.length; i++) q[i - 1] = d[i] - d[i - 1]; d = q; }
      const o = mk([d.length]); for (let i = 0; i < d.length; i++) o.data[i] = d[i]; return o;
    }),
    roll: nat(([a, s, ax], k) => { a = asND(a); if (!(a instanceof ND)) return a; ax = k.axis ?? ax; s = Math.trunc(s);
      if (ax == null || a.ndim === 1) { const n = a.size, o = mk([...a.shape], a.dtype); for (let i = 0; i < n; i++) o.data[((i + s) % n + n) % n] = a.data[i]; return o; }
      if (ax < 0) ax += a.ndim; const st = strides(a.shape), n = a.shape[ax], o = mk([...a.shape], a.dtype);
      for (let i = 0; i < a.size; i++) { const c = Math.floor(i / st[ax]) % n, nc = ((c + s) % n + n) % n; o.data[i + (nc - c) * st[ax]] = a.data[i]; } return o; }),
    convolve: nat(([a, v, mode], kw) => {
      mode = String(mode ?? kw?.mode ?? 'full');
      a = asND(a); v = asND(v); if (!(a instanceof ND) || !(v instanceof ND)) return new Unk('convolve');
      const n = a.size, m = v.size, full = n + m - 1, A = a.data, V = v.data;
      const cut = mode === 'same' ? [Math.floor((m - 1) / 2), n] : mode === 'valid' ? [m - 1, Math.max(0, n - m + 1)] : [0, full];
      const o = mk([cut[1]]); if (!(o instanceof ND)) return o;
      const box = V.every(x => x === V[0]);
      if (box) {     // میانگین متحرک (رایج‌ترین حالت) — سریع
        const c = V[0], pre = new Float64Array(n + 1); for (let i = 0; i < n; i++) pre[i + 1] = pre[i] + A[i];
        for (let j = 0; j < cut[1]; j++) { const kk = j + cut[0], lo = Math.max(0, kk - m + 1), hi = Math.min(n - 1, kk); o.data[j] = hi >= lo ? (pre[hi + 1] - pre[lo]) * c : 0; }
        return o;
      }
      for (let j = 0; j < cut[1]; j++) { const kk = j + cut[0]; let s = 0; for (let i = Math.max(0, kk - m + 1); i <= Math.min(n - 1, kk); i++) s += A[i] * V[kk - i]; o.data[j] = s; }
      return o;
    }),
    interp: nat(([x, xp, fp]) => {
      const XP = asND(xp).data, FP = asND(fp).data;
      const f = v => { if (v <= XP[0]) return FP[0]; for (let i = 1; i < XP.length; i++) if (v <= XP[i]) { const u = (v - XP[i - 1]) / (XP[i] - XP[i - 1]); return FP[i - 1] + (FP[i] - FP[i - 1]) * u; } return FP[FP.length - 1]; };
      return isNum(x) ? f(x) : mapND(asND(x), f);
    }),
    dot: nat(([a, b]) => { a = asND(a); b = asND(b); if (a.ndim === 1 && b.ndim === 1) { let s = 0; for (let i = 0; i < a.size; i++) s += a.data[i] * b.data[i]; return s; } return new Unk('dot'); }),
    outer: nat(([a, b]) => { a = asND(a); b = asND(b); return broadcastN([reshape(a, [a.size, 1]), reshape(b, [1, b.size])], (x, y) => x * y); }),
    meshgrid: nat(([a, b]) => { a = asND(a); b = asND(b); const X = broadcastN([reshape(a, [1, a.size]), mk([b.size, 1])], x => x); const Y = broadcastN([reshape(b, [b.size, 1]), mk([1, a.size])], x => x); return tup([X, Y]); }),
    unique: nat(([a]) => { a = asND(a); const u = [...new Set(a.data)].sort((x, y) => x - y); return new ND(Float64Array.from(u), [u.length], a.dtype); }),
    copy: nat(([a]) => { a = asND(a); return a instanceof ND ? new ND(a.data.slice(), [...a.shape], a.dtype) : a; }),
    reshape: nat(([a, ...s]) => reshape(asND(a), s)),
    any: nat(([a]) => asND(a).data.some(x => x)), all: nat(([a]) => asND(a).data.every(x => x)),
    count_nonzero: nat(([a]) => asND(a).data.reduce((r, x) => r + (x ? 1 : 0), 0)),
    deg: null,
  });
  d.amax = d.max; d.amin = d.min; delete d.deg;
  d.mgrid = { __getitem: k => { const ks = normIdx(k); const ranges = ks.map(s => sliceRange({ a: s.a ?? 0, b: s.b, c: s.c ?? 1 }, s.b)); const sh = ranges.map(r => r.length); if (prod(sh) * sh.length > MAXN) return big(); const out = mk([sh.length, ...sh]); const m = prod(sh), st = strides(sh); for (let ax = 0; ax < sh.length; ax++) for (let i = 0; i < m; i++) out.data[ax * m + i] = ranges[ax][Math.floor(i / st[ax]) % sh[ax]]; return out; } };
  // random
  const glob = rngFrom(1234);
  d.random = new PyModule('numpy.random', {
    default_rng: nat(([seed]) => { const r = rngFrom(seed); return { __pyget: name => r[name] }; }),
    RandomState: nat(([seed]) => { const r = rngFrom(seed); return { __pyget: name => ({ rand: nat(a => (a.length ? r.random([a.length > 1 ? tup(a) : a[0]], {}) : r._next())), randn: nat(a => (a.length ? r.standard_normal([a.length > 1 ? tup(a) : a[0]], {}) : r._gauss())) }[name] ?? r[name]) }; }),
    seed: nat(([s]) => { Object.assign(glob, rngFrom(s)); return null; }),
    rand: nat(a => (a.length ? glob.random([a.length > 1 ? tup(a) : a[0]], {}) : glob._next())),
    randn: nat(a => (a.length ? glob.standard_normal([a.length > 1 ? tup(a) : a[0]], {}) : glob._gauss())),
    random: nat((a, k) => glob.random(a, k)), random_sample: nat((a, k) => glob.random(a, k)),
    uniform: nat((a, k) => glob.uniform(a, k)), normal: nat((a, k) => glob.normal(a, k)), randint: nat((a, k) => glob.randint(a, k)),
    choice: nat((a, k) => glob.choice(a, k)), shuffle: nat((a, k) => glob.shuffle(a, k)), permutation: nat((a, k) => glob.permutation(a, k)),
  });
  return new PyModule('numpy', d);
}
function nonzero(a) {
  if (!(a instanceof ND)) return a;
  const st = strides(a.shape), outs = a.shape.map(() => []);
  for (let i = 0; i < a.size; i++) if (a.data[i]) { let r = i; for (let ax = 0; ax < a.ndim; ax++) { outs[ax].push(Math.floor(r / st[ax])); r %= st[ax]; } }
  return tup(outs.map(o => new ND(Float64Array.from(o), [o.length], 'int64')));
}
function stack(arrs, ax) {
  const As = (Array.isArray(arrs) ? arrs : arrs.__iter()).map(a => asND(a));
  if (As.some(a => a instanceof Unk)) return As.find(a => a instanceof Unk);
  const s0 = As[0].shape; if (ax < 0) ax += s0.length + 1;
  const outSh = [...s0.slice(0, ax), As.length, ...s0.slice(ax)];
  const o = mk(outSh); if (!(o instanceof ND)) return o;
  const inner = prod(s0.slice(ax)), outer = prod(s0.slice(0, ax)), k = As.length;
  for (let a = 0; a < k; a++) { const D = As[a].data; for (let p = 0; p < outer; p++) for (let q = 0; q < inner; q++) o.data[(p * k + a) * inner + q] = D[p * inner + q]; }
  return o;
}
function concat(As, ax) {
  if (As.some(a => a instanceof Unk)) return As.find(a => a instanceof Unk);
  if (ax < 0) ax += As[0].ndim;
  const outSh = [...As[0].shape]; outSh[ax] = As.reduce((s, a) => s + a.shape[ax], 0);
  const o = mk(outSh); if (!(o instanceof ND)) return o;
  const outer = prod(outSh.slice(0, ax)), innerOut = prod(outSh.slice(ax));
  let off = 0;
  for (const a of As) { const inner = prod(a.shape.slice(ax)); for (let p = 0; p < outer; p++) o.data.set(a.data.subarray(p * inner, (p + 1) * inner), p * innerOut + off); off += inner; }
  return o;
}
