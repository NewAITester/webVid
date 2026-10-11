import { pyParse } from './pyparse.js';

/**
 * مفسّر کوچک پایتون — برای «خواندن» اسکریپت‌های ساخت ویدیو
 * ─────────────────────────────────────────────────────────────
 * کد را واقعاً اجرا می‌کند (حلقه، تابع، کلاس، لیست، دیکشنری …) ولی
 * کتابخانه‌های بیرونی (moviepy، manim، …) با «آداپتور» جایگزین می‌شوند
 * که به‌جای ساختن ویدیو، اجزای آن را ثبت می‌کنند. هرچه را نشناسد
 * «نامعلوم» (Unk) می‌شود و اجرا ادامه پیدا می‌کند.
 */

export class Unk {
  constructor(desc = '?') { this.desc = desc; }
  toString() { return `<${this.desc}>`; }
}
export class PyError extends Error { constructor(msg, line, pyType = 'Exception') { super(msg); this.line = line; this.pyType = pyType; } }
class BreakSig {} class ContinueSig {}
class ReturnSig { constructor(v) { this.v = v; } }

export const tup = a => { Object.defineProperty(a, '__tuple', { value: true }); return a; };
export const isTuple = a => Array.isArray(a) && a.__tuple === true;
export class PyDict {
  constructor(entries = []) { this.m = new Map(); for (const [k, v] of entries) this.set(k, v); }
  static key(k) { return typeof k === 'string' ? 's' + k : typeof k === 'number' || typeof k === 'boolean' ? 'n' + (+k) : k == null ? 'none' : Array.isArray(k) ? 't' + k.map(x => PyDict.key(x)).join('\u0001') : k; }
  get(k, d) { const e = this.m.get(PyDict.key(k)); return e ? e[1] : d; }
  has(k) { return this.m.has(PyDict.key(k)); }
  set(k, v) { this.m.set(PyDict.key(k), [k, v]); }
  del(k) { this.m.delete(PyDict.key(k)); }
  keys() { return [...this.m.values()].map(e => e[0]); }
  values() { return [...this.m.values()].map(e => e[1]); }
  items() { return [...this.m.values()].map(e => tup([e[0], e[1]])); }
  get size() { return this.m.size; }
  toObj() { const o = {}; for (const [k, v] of this.m.values()) o[k] = v; return o; }
}
export class PyFunc { constructor(o) { Object.assign(this, o); } }
export class PyClass { constructor(name, bases, ns) { this.name = name; this.bases = bases; this.ns = ns; } }
export class PyInst { constructor(cls) { this.cls = cls; this.d = {}; } }
class Bound { constructor(self, fn) { this.self = self; this.fn = fn; } }
/** کلاس بومی (از آداپتورها) که کلاس پایتونی می‌تواند از آن ارث ببرد */
export class NativeClass { constructor(name, { init, methods = {}, attrs = {} } = {}) { this.name = name; this.init = init; this.methods = methods; this.attrs = attrs; } }
/** تابع بومی: fn(args, kw, interp) */
export const nat = (fn, name = fn.name) => { fn.__native = true; fn.__name = name; return fn; };
/** ماژول */
export class PyModule { constructor(name, d = {}) { this.name = name; this.d = d; } }

const typeName = v => (v == null ? 'NoneType' : typeof v === 'boolean' ? 'bool' : typeof v === 'number' ? (Number.isInteger(v) ? 'int' : 'float') : typeof v === 'string' ? 'str'
  : isTuple(v) ? 'tuple' : Array.isArray(v) ? 'list' : v instanceof PyDict ? 'dict' : v instanceof PyInst ? v.cls.name : v instanceof PyClass ? 'type' : v?.__ptype || 'object');

export function repr(v, top = true) {
  if (v == null) return 'None';
  if (v === true) return 'True'; if (v === false) return 'False';
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : String(+v.toPrecision(12));
  if (typeof v === 'string') return top ? v : `'${v.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
  if (isTuple(v)) return '(' + v.map(x => repr(x, false)).join(', ') + (v.length === 1 ? ',' : '') + ')';
  if (Array.isArray(v)) return '[' + v.map(x => repr(x, false)).join(', ') + ']';
  if (v instanceof PyDict) return '{' + v.items().map(([k, x]) => repr(k, false) + ': ' + repr(x, false)).join(', ') + '}';
  if (v instanceof PyInst) return `<${v.cls.name} object>`;
  if (v instanceof Unk) return String(v);
  if (v?.__repr) return v.__repr();
  return `<${typeName(v)}>`;
}
export const truthy = v => (v == null || v === false || v === 0 || v === '' ? false : Array.isArray(v) ? v.length > 0 : v instanceof PyDict ? v.size > 0 : v instanceof Unk ? false : v?.__bool ? v.__bool() : true);

function fmtSpec(v, spec) {
  if (!spec) return repr(v);
  const m = /^(?:(.)?([<>^=]))?([+\- ])?(#)?(0)?(\d+)?([,_])?(?:\.(\d+))?([bcdeEfFgGnosxX%])?$/.exec(spec);
  if (!m) return repr(v);
  let [, fill, align, sign, , zero, width, group, prec, type] = m;
  let s;
  const n = typeof v === 'boolean' ? +v : v;
  if (type === 'f' || type === 'F') s = (+n).toFixed(prec != null ? +prec : 6);
  else if (type === 'e' || type === 'E') s = (+n).toExponential(prec != null ? +prec : 6);
  else if (type === '%') s = ((+n) * 100).toFixed(prec != null ? +prec : 6) + '%';
  else if (type === 'd' || type === 'n') s = String(Math.trunc(+n));
  else if (type === 'x') s = Math.trunc(+n).toString(16); else if (type === 'X') s = Math.trunc(+n).toString(16).toUpperCase();
  else if (type === 'b') s = Math.trunc(+n).toString(2); else if (type === 'o') s = Math.trunc(+n).toString(8);
  else if (type === 'g' || type === 'G') s = String(+(+n).toPrecision(prec != null ? +prec || 1 : 6));
  else if (type === 'c') s = String.fromCharCode(n);
  else if (prec != null && typeof n === 'number') s = String(+(+n).toPrecision(+prec));
  else if (prec != null && typeof v === 'string') s = v.slice(0, +prec);
  else s = repr(v);
  if (group && typeof n === 'number') { const [a, b] = s.split('.'); s = a.replace(/\B(?=(\d{3})+(?!\d))/g, group) + (b != null ? '.' + b : ''); }
  if (sign === '+' && typeof n === 'number' && n >= 0) s = '+' + s;
  if (width) {
    const w = +width;
    if (zero && !align) { fill = '0'; align = '='; }
    fill = fill || ' ';
    align = align || (typeof n === 'number' ? '>' : '<');
    const padN = Math.max(0, w - s.length);
    if (align === '<') s = s + fill.repeat(padN);
    else if (align === '>') s = fill.repeat(padN) + s;
    else if (align === '^') s = fill.repeat(Math.floor(padN / 2)) + s + fill.repeat(Math.ceil(padN / 2));
    else if (align === '=') { const sg = /^[+-]/.test(s) ? s[0] : ''; s = sg + fill.repeat(padN) + s.slice(sg.length); }
  }
  return s;
}
function percentFormat(fmt, args) {
  const list = Array.isArray(args) && isTuple(args) ? args : [args];
  let i = 0;
  return fmt.replace(/%(\(([^)]+)\))?([-+ 0#]*)(\d+)?(?:\.(\d+))?([sdifrxXeEgGc%])/g, (all, _k, key, flags, width, prec, type) => {
    if (type === '%') return '%';
    const v = key != null && args instanceof PyDict ? args.get(key) : list[i++];
    let spec = (flags.includes('-') ? '<' : flags.includes('0') ? '0' : '') + (width || '') + (prec != null ? '.' + prec : '');
    if (type === 's' || type === 'r') return fmtSpec(type === 'r' ? repr(v, false) : repr(v), (flags.includes('-') ? '<' : '') + (width || ''));
    return fmtSpec(v, spec + (type === 'i' ? 'd' : type));
  });
}
function strFormat(s, args, kw) {
  let auto = 0;
  return s.replace(/\{\{|\}\}|\{([^{}]*)\}/g, (all, inner) => {
    if (all === '{{') return '{'; if (all === '}}') return '}';
    let [field, spec] = inner.split(/:(.*)/s); field = field.replace(/![rsa]$/, '');
    let v;
    const m = /^([^.[]*)(.*)$/.exec(field);
    const head = m[1];
    if (head === '') v = args[auto++]; else if (/^\d+$/.test(head)) v = args[+head]; else v = kw[head];
    if (m[2]) for (const part of m[2].match(/\.\w+|\[[^\]]*\]/g) || []) v = part[0] === '.' ? v?.[part.slice(1)] : Array.isArray(v) ? v[+part.slice(1, -1)] : v instanceof PyDict ? v.get(part.slice(1, -1)) : undefined;
    return fmtSpec(v, spec);
  });
}

const pmod = (a, b) => { const r = a % b; return r !== 0 && (r < 0) !== (b < 0) ? r + b : r; };

export class Interp {
  constructor({ modules = {}, onPrint = null, maxSteps = 3e6 } = {}) {
    this.modules = modules;           // نام ← PyModule یا تابع سازندهٔ PyModule
    this.onPrint = onPrint;
    this.steps = 0; this.maxSteps = maxSteps;
    this.warnings = [];
    this.unknownNames = new Set();
    this.line = 0;
    this.builtins = this.makeBuiltins();
    this.globals = { vars: Object.create(null), parent: null, isGlobal: true };
  }
  warn(m) { if (this.warnings.length < 60 && !this.warnings.includes(m)) this.warnings.push(m); }
  run(src) {
    const ast = pyParse(src);
    this.execBlock(ast.body, this.globals);
    return this.globals.vars;
  }
  /* ── محیط ── */
  lookup(name, env) {
    for (let e = env; e; e = e.parent) if (name in e.vars) return e.vars[name];
    if (name in this.builtins) return this.builtins[name];
    this.unknownNames.add(name);
    return new Unk(name);
  }
  assignName(name, v, env) {
    if (env.globalNames?.has(name)) { this.globals.vars[name] = v; return; }
    if (env.nonlocalNames?.has(name)) { for (let e = env.parent; e; e = e.parent) if (name in e.vars) { e.vars[name] = v; return; } }
    env.vars[name] = v;
  }
  /* ── اجرای دستورها ── */
  execBlock(body, env) { for (const s of body) this.exec(s, env); }
  exec(s, env) {
    if (++this.steps > this.maxSteps) throw new PyError('اجرا خیلی طولانی شد (حلقهٔ بی‌پایان؟) — متوقف شد', s.line);
    this.line = s.line;
    switch (s.type) {
      case 'Expr': this.eval(s.value, env); return;
      case 'Assign': { const v = this.eval(s.value, env); for (const t of s.targets) this.assignTo(t, v, env); return; }
      case 'AugAssign': {
        const cur = this.eval(s.target, env), v = this.eval(s.value, env);
        let nv;
        if (Array.isArray(cur) && !isTuple(cur) && s.op === '+') { cur.push(...this.iter(v)); nv = cur; }
        else nv = this.binop(s.op, cur, v);
        this.assignTo(s.target, nv, env); return;
      }
      case 'If': { if (truthy(this.eval(s.test, env))) this.execBlock(s.body, env); else this.execBlock(s.orelse, env); return; }
      case 'While': {
        let n = 0; let broke = false;
        while (truthy(this.eval(s.test, env))) {
          if (++n > 100000) { this.warn(`حلقهٔ while خط ${s.line} بیش از حد تکرار شد؛ متوقف شد`); break; }
          try { this.execBlock(s.body, env); } catch (e) { if (e instanceof BreakSig) { broke = true; break; } if (e instanceof ContinueSig) continue; throw e; }
        }
        if (!broke) this.execBlock(s.orelse, env); return;
      }
      case 'For': {
        const it = this.iter(this.eval(s.iter, env));
        let broke = false;
        for (const v of it) {
          this.assignTo(s.target, v, env);
          try { this.execBlock(s.body, env); } catch (e) { if (e instanceof BreakSig) { broke = true; break; } if (e instanceof ContinueSig) continue; throw e; }
        }
        if (!broke) this.execBlock(s.orelse, env); return;
      }
      case 'Def': {
        let f = new PyFunc({ name: s.name, params: s.params, body: s.body, closure: env, defaults: s.params.map(p => (p.def ? this.eval(p.def, env) : undefined)), cls: env.classOf || null, line: s.line });
        f.isGen = containsYield(s.body);
        for (const d of (s.decorators || []).slice().reverse()) {
          const dv = this.eval(d, env);
          if (dv instanceof Unk) continue;
          if (dv?.__decorator === 'staticmethod') { f.static = true; continue; }
          if (dv?.__decorator === 'classmethod') { f.classm = true; continue; }
          if (dv?.__decorator === 'property') { f.prop = true; continue; }
          f = this.call(dv, [f], {});
        }
        this.assignName(s.name, f, env); return;
      }
      case 'Class': {
        const bases = s.bases.map(b => this.eval(b, env));
        const cenv = { vars: Object.create(null), parent: env, classBody: true };
        const cls = new PyClass(s.name, bases.filter(b => !(b instanceof Unk)), cenv.vars);
        cenv.classOf = cls;
        this.execBlock(s.body, cenv);
        cls.unknownBases = bases.filter(b => b instanceof Unk).map(b => b.desc);
        this.assignName(s.name, cls, env); return;
      }
      case 'Return': throw new ReturnSig(s.value ? this.eval(s.value, env) : null);
      case 'Pass': return;
      case 'Break': throw new BreakSig();
      case 'Continue': throw new ContinueSig();
      case 'Global': { const k = s.nonlocal ? 'nonlocalNames' : 'globalNames'; env[k] = env[k] || new Set(); s.names.forEach(n => env[k].add(n)); return; }
      case 'Import': {
        for (const [name, as] of s.names) {
          const mod = this.importModule(name);
          if (as) this.assignName(as, mod, env);
          else { const top = name.split('.')[0]; this.assignName(top, name.includes('.') ? this.importModule(top) : mod, env); }
        }
        return;
      }
      case 'ImportFrom': {
        const mod = this.importModule(s.module);
        for (const [name, as] of s.names) {
          if (name === '*') { const d = mod instanceof PyModule ? mod.d : {}; for (const k of Object.keys(d)) if (!k.startsWith('_')) env.vars[k] = d[k]; continue; }
          let v = this.getattr(mod, name, true);
          if (v instanceof Unk) { const sub = this.modules[s.module + '.' + name]; if (sub) v = this.importModule(s.module + '.' + name); }
          this.assignName(as || name, v, env);
        }
        return;
      }
      case 'With': {
        for (const it of s.items) {
          let v = this.eval(it.e, env);
          const ent = this.getattr(v, '__enter__', true);
          if (!(ent instanceof Unk)) v = this.call(ent, [], {});
          if (it.as) this.assignTo(it.as, v, env);
        }
        this.execBlock(s.body, env); return;
      }
      case 'Try': {
        try { this.execBlock(s.body, env); this.execBlock(s.orelse, env); }
        catch (e) {
          if (e instanceof BreakSig || e instanceof ContinueSig || e instanceof ReturnSig) throw e;
          if (e instanceof PyError && /طولانی/.test(e.message)) throw e;
          const h = s.handlers[0];
          if (!h) throw e;
          if (h.name) this.assignName(h.name, String(e.message || e), env);
          this.execBlock(h.body, env);
        } finally { if (s.fin.length) this.execBlock(s.fin, env); }
        return;
      }
      case 'Raise': { const v = s.exc ? this.eval(s.exc, env) : null; throw new PyError(repr(v), s.line, 'raise'); }
      case 'Del': { const ts = s.targets.type === 'Tuple' ? s.targets.elts : [s.targets]; for (const t of ts) if (t.type === 'Name') delete env.vars[t.id]; else if (t.type === 'Sub') { const o = this.eval(t.obj, env), k = this.eval(t.idx, env); if (o instanceof PyDict) o.del(k); else if (Array.isArray(o)) o.splice(k < 0 ? o.length + k : k, 1); } return; }
      case 'Assert': return;
      default: this.warn(`دستور پشتیبانی‌نشده: ${s.type}`);
    }
  }
  assignTo(t, v, env) {
    switch (t.type) {
      case 'Name': this.assignName(t.id, v, env); return;
      case 'Tuple': case 'List': {
        const vals = this.iter(v);
        const si = t.elts.findIndex(e => e.type === 'Starred');
        if (si < 0) { t.elts.forEach((e, i) => this.assignTo(e, vals[i] ?? (v instanceof Unk ? v : null), env)); return; }
        const after = t.elts.length - si - 1;
        t.elts.slice(0, si).forEach((e, i) => this.assignTo(e, vals[i], env));
        this.assignTo(t.elts[si].value, vals.slice(si, vals.length - after), env);
        t.elts.slice(si + 1).forEach((e, i) => this.assignTo(e, vals[vals.length - after + i], env));
        return;
      }
      case 'Paren': this.assignTo(t.v, v, env); return;
      case 'Attr': this.setattr(this.eval(t.obj, env), t.name, v); return;
      case 'Sub': {
        const o = this.eval(t.obj, env), k = this.eval(t.idx, env);
        if (o instanceof PyDict) o.set(k, v);
        else if (Array.isArray(o)) { if (k?.type === 'slice') { const [a, b] = sliceIdx(k, o.length); o.splice(a, b - a, ...this.iter(v)); } else o[k < 0 ? o.length + k : k] = v; }
        else if (o?.__setitem) o.__setitem(k, v);
        return;
      }
      case 'Starred': this.assignTo(t.value, v, env); return;
    }
  }
  /* ── عبارت‌ها ── */
  eval(e, env) {
    switch (e.type) {
      case 'Num': return e.v;
      case 'Str': return e.v;
      case 'Const': return e.v;
      case 'JoinedStr': return e.parts.map(p => (p.type === 'Str' ? p.v : this.fval(p, env))).join('');
      case 'Name': return this.lookup(e.id, env);
      case 'Paren': return this.eval(e.v, env);
      case 'Tuple': return tup(this.evalElts(e.elts, env));
      case 'List': return this.evalElts(e.elts, env);
      case 'Set': return this.evalElts(e.elts, env);
      case 'Dict': {
        const d = new PyDict();
        e.keys.forEach((k, i) => { const v = this.eval(e.vals[i], env); if (k == null) { if (v instanceof PyDict) for (const [a, b] of v.items()) d.set(a, b); } else d.set(this.eval(k, env), v); });
        return d;
      }
      case 'Attr': return this.getattr(this.eval(e.obj, env), e.name);
      case 'Sub': return this.getitem(this.eval(e.obj, env), this.eval(e.idx, env));
      case 'Slice': return { type: 'slice', a: e.a ? this.eval(e.a, env) : null, b: e.b ? this.eval(e.b, env) : null, c: e.c ? this.eval(e.c, env) : null };
      case 'Call': {
        const fn = this.eval(e.fn, env);
        const args = [];
        for (const a of e.args) { if (a.type === 'Starred') args.push(...this.iter(this.eval(a.value, env))); else args.push(this.eval(a, env)); }
        const kw = {};
        for (const k of e.kw) { const v = this.eval(k.value, env); if (k.name) kw[k.name] = v; else if (v instanceof PyDict) Object.assign(kw, v.toObj()); }
        const line = this.line; this.line = e.line || line;
        try { return this.call(fn, args, kw, e); } finally { this.line = line; }
      }
      case 'Bin': return this.binop(e.op, this.eval(e.l, env), this.eval(e.r, env));
      case 'Unary': {
        const v = this.eval(e.v, env);
        if (e.op === 'not') return !truthy(v);
        if (v instanceof Unk) return v;
        if (v?.__op) return v.__op('neg', -1);
        if (e.op === '-') return -v; if (e.op === '+') return +v; if (e.op === '~') return ~v;
        return v;
      }
      case 'BoolOp': { const l = this.eval(e.l, env); if (e.op === 'and') return truthy(l) ? this.eval(e.r, env) : l; return truthy(l) ? l : this.eval(e.r, env); }
      case 'Compare': {
        let l = this.eval(e.l, env);
        for (let i = 0; i < e.ops.length; i++) { const r = this.eval(e.rs[i], env); if (!this.cmp(e.ops[i], l, r)) return false; l = r; }
        return true;
      }
      case 'IfExp': return truthy(this.eval(e.test, env)) ? this.eval(e.body, env) : this.eval(e.orelse, env);
      case 'Lambda': return new PyFunc({ name: '<lambda>', params: e.params, body: e.body, closure: env, defaults: e.params.map(p => (p.def ? this.eval(p.def, env) : undefined)), lambda: true });
      case 'ListComp': case 'GenExp': case 'SetComp': { const out = []; this.comp(e.gens, 0, { vars: Object.create(null), parent: env }, sc => out.push(this.eval(e.elt, sc))); return out; }
      case 'DictComp': { const d = new PyDict(); this.comp(e.gens, 0, { vars: Object.create(null), parent: env }, sc => d.set(this.eval(e.elt, sc), this.eval(e.val, sc))); return d; }
      case 'Starred': return this.eval(e.value, env);
      case 'Walrus': { const v = this.eval(e.value, env); this.assignTo(e.target, v, env); return v; }
      case 'Yield': { const v = e.value ? this.eval(e.value, env) : null; env.__yields?.push(v); return null; }
      default: this.warn(`عبارت پشتیبانی‌نشده: ${e.type}`); return new Unk(e.type);
    }
  }
  fval(p, env) {
    let v = this.eval(p.v, env);
    if (p.conv === 'r') v = repr(v, false);
    const spec = p.spec ? this.eval(p.spec, env) : '';
    return fmtSpec(v, spec);
  }
  evalElts(elts, env) { const out = []; for (const x of elts) { if (x.type === 'Starred') out.push(...this.iter(this.eval(x.value, env))); else out.push(this.eval(x, env)); } return out; }
  comp(gens, i, env, emit) {
    if (i >= gens.length) { emit(env); return; }
    const g = gens[i];
    for (const v of this.iter(this.eval(g.iter, env))) {
      this.assignTo(g.target, v, env);
      if (g.ifs.every(c => truthy(this.eval(c, env)))) this.comp(gens, i + 1, env, emit);
    }
  }
  iter(v) {
    if (Array.isArray(v)) return v.slice();
    if (typeof v === 'string') return [...v];
    if (v instanceof PyDict) return v.keys();
    if (v instanceof Unk || v == null) return [];
    if (v?.__iter) return v.__iter();
    if (v instanceof PyInst) { const it = this.getattr(v, '__iter__', true); if (!(it instanceof Unk)) return this.iter(this.call(it, [], {})); }
    if (typeof v === 'number') { this.warn('تلاش برای پیمایش روی عدد'); return []; }
    return [];
  }
  cmp(op, a, b) {
    if (a instanceof Unk || b instanceof Unk) return op === '!=' || op === 'is not' || op === 'not in';
    switch (op) {
      case '==': return eq(a, b); case '!=': return !eq(a, b);
      case '<': return lt(a, b); case '>': return lt(b, a); case '<=': return !lt(b, a); case '>=': return !lt(a, b);
      case 'is': return a === b || (a == null && b == null); case 'is not': return !(a === b || (a == null && b == null));
      case 'in': return contains(b, a); case 'not in': return !contains(b, a);
    }
    return false;
  }
  binop(op, a, b) {
    if (a instanceof Unk) return a; if (b instanceof Unk) return b;
    if (a?.__op) { const r = a.__op(op, b, false); if (r !== undefined) return r; }
    if (b?.__op) { const r = b.__op(op, a, true); if (r !== undefined) return r; }
    if (typeof a === 'boolean') a = +a; if (typeof b === 'boolean') b = +b;
    switch (op) {
      case '+':
        if (Array.isArray(a) && Array.isArray(b)) { const r = a.concat(b); return isTuple(a) ? tup(r) : r; }
        if (typeof a === 'string' || typeof b === 'string') { if (typeof a !== typeof b) throw new PyError(`نمی‌شود ${typeName(a)} و ${typeName(b)} را جمع کرد`, this.line, 'TypeError'); return a + b; }
        return a + b;
      case '-': return a - b;
      case '*':
        if (typeof a === 'string' && typeof b === 'number') return a.repeat(Math.max(0, b));
        if (typeof b === 'string' && typeof a === 'number') return b.repeat(Math.max(0, a));
        if (Array.isArray(a) && typeof b === 'number') { const r = []; for (let i = 0; i < b; i++) r.push(...a); return isTuple(a) ? tup(r) : r; }
        if (Array.isArray(b) && typeof a === 'number') return this.binop('*', b, a);
        return a * b;
      case '/': if (b === 0) throw new PyError('تقسیم بر صفر', this.line, 'ZeroDivisionError'); return a / b;
      case '//': if (b === 0) throw new PyError('تقسیم بر صفر', this.line, 'ZeroDivisionError'); return Math.floor(a / b);
      case '%': if (typeof a === 'string') return percentFormat(a, b); return pmod(a, b);
      case '**': return Math.pow(a, b);
      case '<<': return a << b; case '>>': return a >> b; case '&': return a & b; case '^': return a ^ b;
      case '|': if (a instanceof PyDict && b instanceof PyDict) return new PyDict([...a.items(), ...b.items()]); return a | b;
      case '@': return new Unk('@');
    }
    return new Unk(op);
  }
  /* ── ویژگی‌ها ── */
  getattr(o, name, soft = false) {
    if (o instanceof Unk) return new Unk(o.desc + '.' + name);
    if (o instanceof PyModule) { if (name in o.d) return o.d[name]; return new Unk((o.name || 'module') + '.' + name); }
    if (o instanceof PyInst) {
      if (name in o.d) return o.d[name];
      if (name === '__class__') return o.cls;
      const v = this.classLookup(o.cls, name);
      if (v !== undefined) return this.bindMember(v, o);
      const ga = this.classLookup(o.cls, '__getattr__');
      if (ga instanceof PyFunc) return this.callFunc(ga, [o, name], {});
      if (soft) return new Unk(name);
      this.warn(`ویژگی ناشناخته: ${o.cls.name}.${name}`);
      return new Unk(o.cls.name + '.' + name);
    }
    if (o instanceof PyClass) { const v = this.classLookup(o, name); if (v !== undefined) return v instanceof PyFunc && v.classm ? new Bound(o, v) : v; if (name === '__name__') return o.name; return new Unk(o.name + '.' + name); }
    if (o instanceof NativeClass) { if (name in o.attrs) return o.attrs[name]; return new Unk(o.name + '.' + name); }
    if (o?.__pyget) { const v = o.__pyget(name, this); if (v !== undefined) return v; return new Unk(name); }
    const m = builtinMethod(this, o, name);
    if (m !== undefined) return m;
    if (o != null && typeof o === 'object' && name in o) return o[name];
    if (soft) return new Unk(name);
    return new Unk(typeName(o) + '.' + name);
  }
  classLookup(cls, name) {
    if (cls instanceof NativeClass) return name in cls.methods ? cls.methods[name] : name in cls.attrs ? cls.attrs[name] : undefined;
    if (!(cls instanceof PyClass)) return undefined;
    if (name in cls.ns) return cls.ns[name];
    for (const b of cls.bases) { const v = this.classLookup(b, name); if (v !== undefined) return v; }
    return undefined;
  }
  nativeBase(cls) {
    if (cls instanceof NativeClass) return cls;
    if (!(cls instanceof PyClass)) return null;
    for (const b of cls.bases) { const n = this.nativeBase(b); if (n) return n; }
    return null;
  }
  bindMember(v, self) {
    if (v instanceof PyFunc) { if (v.static) return v; if (v.prop) return this.callFunc(v, [self], {}); return new Bound(v.classm ? self.cls : self, v); }
    if (typeof v === 'function' && v.__native && v.__method) return nat((a, k) => v([self, ...a], k, this), v.__name);
    return v;
  }
  setattr(o, name, v) {
    if (o instanceof PyInst) { const nb = this.nativeBase(o.cls); if (nb?.methods.__setattr__) nb.methods.__setattr__([o, name, v], {}, this); o.d[name] = v; return; }
    if (o instanceof PyClass) { o.ns[name] = v; return; }
    if (o instanceof PyModule) { o.d[name] = v; return; }
    if (o?.__pyset) { o.__pyset(name, v, this); return; }
    if (o instanceof Unk) return;
    if (o && typeof o === 'object') o[name] = v;
  }
  getitem(o, k) {
    if (o instanceof Unk) return new Unk(o.desc + '[]');
    if (k instanceof Unk) return new Unk('[?]');
    if (k?.type === 'slice') {
      if (typeof o === 'string' || Array.isArray(o)) {
        const [a, b, c] = sliceIdx(k, o.length);
        const arr = typeof o === 'string' ? [...o] : o; const out = [];
        if (c > 0) for (let i = a; i < b; i += c) out.push(arr[i]); else for (let i = a; i > b; i += c) out.push(arr[i]);
        return typeof o === 'string' ? out.join('') : isTuple(o) ? tup(out) : out;
      }
      if (o?.__getitem) return o.__getitem(k);
      return new Unk('slice');
    }
    if (Array.isArray(o) || typeof o === 'string') {
      const i = k < 0 ? o.length + k : k;
      if (i < 0 || i >= o.length) throw new PyError(`اندیس ${k} بیرون از بازه است`, this.line, 'IndexError');
      return typeof o === 'string' ? [...o][i] : o[i];
    }
    if (o instanceof PyDict) { if (!o.has(k)) throw new PyError(`کلید ${repr(k, false)} پیدا نشد`, this.line, 'KeyError'); return o.get(k); }
    if (o?.__getitem) return o.__getitem(k);
    if (o instanceof PyInst) { const gi = this.getattr(o, '__getitem__', true); if (!(gi instanceof Unk)) return this.call(gi, [k], {}); }
    return new Unk('[]');
  }
  /* ── فراخوانی ── */
  call(f, args, kw, node) {
    if (f instanceof Unk) { for (const a of args) if (a instanceof PyFunc) this.touch(a); return new Unk(f.desc + '()'); }
    if (typeof f === 'function' && f.__native) return f(args, kw, this);
    if (f instanceof PyFunc) return this.callFunc(f, args, kw);
    if (f instanceof Bound) {
      if (f.fn instanceof PyFunc) return this.callFunc(f.fn, [f.self, ...args], kw);
      return this.call(f.fn, [f.self, ...args], kw);
    }
    if (f instanceof PyClass) return this.instantiate(f, args, kw);
    if (f instanceof NativeClass) { const o = new PyInst(f); if (f.init) f.init([o, ...args], kw, this); return o; }
    if (f?.__pycall) return f.__pycall(args, kw, this);
    if (f instanceof PyInst) { const c = this.getattr(f, '__call__', true); if (!(c instanceof Unk)) return this.call(c, args, kw); }
    throw new PyError(`${typeName(f)} قابل صدا زدن نیست`, this.line, 'TypeError');
  }
  touch() {}
  instantiate(cls, args, kw) {
    const o = new PyInst(cls);
    const init = this.classLookup(cls, '__init__');
    if (init instanceof PyFunc) this.callFunc(init, [o, ...args], kw);
    else { const nb = this.nativeBase(cls); if (nb?.init) nb.init([o, ...args], kw, this); }
    return o;
  }
  callFunc(f, args, kw) {
    const env = { vars: Object.create(null), parent: f.closure, fn: f };
    const ps = f.params;
    let ai = 0;
    const extraKw = { ...kw };
    for (let i = 0; i < ps.length; i++) {
      const p = ps[i];
      if (p.star === 1) { env.vars[p.name] = tup(args.slice(ai)); ai = args.length; continue; }
      if (p.star === 2) { continue; }
      if (ai < args.length && !(p.name in kw)) env.vars[p.name] = args[ai++];
      else if (p.name in kw) { env.vars[p.name] = kw[p.name]; delete extraKw[p.name]; }
      else if (f.defaults[i] !== undefined) env.vars[p.name] = f.defaults[i];
      else env.vars[p.name] = null;
    }
    const kwp = ps.find(p => p.star === 2);
    if (kwp) env.vars[kwp.name] = new PyDict(Object.entries(extraKw));
    if (f.cls) env.superCls = f.cls;
    if (f.lambda) return this.eval(f.body, env);
    if (f.isGen) env.__yields = [];
    if (this.depth > 200) throw new PyError('بازگشت خیلی عمیق شد', this.line, 'RecursionError');
    this.depth = (this.depth || 0) + 1;
    try { this.execBlock(f.body, env); }
    catch (e) { if (e instanceof ReturnSig) return f.isGen ? env.__yields : e.v; throw e; }
    finally { this.depth--; }
    return f.isGen ? env.__yields : null;
  }
  importModule(name) {
    const m = this.modules[name] ?? this.modules[name.split('.')[0] + '.*'];
    if (m instanceof PyModule) return m;
    if (typeof m === 'function') { const mm = m(this); this.modules[name] = mm; return mm; }
    const std = stdModule(name, this);
    if (std) { this.modules[name] = std; return std; }
    this.warn(`کتابخانهٔ «${name}» شناخته نشد؛ هرچه از آن بیاید «نامعلوم» می‌شود.`);
    const u = new PyModule(name, {});
    u.unknown = true;
    this.modules[name] = u;
    return u;
  }
  /* ── توابع آماده ── */
  makeBuiltins() {
    const I = this;
    const num = v => (typeof v === 'boolean' ? +v : v);
    const B = {
      print: nat((a, k) => { const s = a.map(x => repr(x)).join(k.sep ?? ' '); I.onPrint?.(s); return null; }),
      len: nat(([o]) => (o instanceof Unk ? 0 : typeof o === 'string' ? [...o].length : Array.isArray(o) ? o.length : o instanceof PyDict ? o.size : o?.__len ? o.__len() : 0)),
      range: nat(a => { a = a.map(num); if (a.some(x => typeof x !== 'number')) return []; let [s, e, st] = a.length === 1 ? [0, a[0], 1] : [a[0], a[1], a[2] ?? 1]; const out = []; if (!st) return out; if (Math.abs((e - s) / st) > 1e6) throw new PyError('range خیلی بزرگ است', I.line); for (let i = s; st > 0 ? i < e : i > e; i += st) out.push(i); return out; }),
      enumerate: nat(([it, s = 0], k) => I.iter(it).map((v, i) => tup([i + (k.start ?? s), v]))),
      zip: nat(a => { const its = a.map(x => I.iter(x)); const n = its.length ? Math.min(...its.map(x => x.length)) : 0; return [...Array(n)].map((_, i) => tup(its.map(x => x[i]))); }),
      min: nat((a, k) => { const xs = a.length === 1 ? I.iter(a[0]) : a; if (!xs.length) return k.default ?? null; const key = k.key; return xs.reduce((m, x) => (lt(key ? I.call(key, [x], {}) : x, key ? I.call(key, [m], {}) : m) ? x : m)); }),
      max: nat((a, k) => { const xs = a.length === 1 ? I.iter(a[0]) : a; if (!xs.length) return k.default ?? null; const key = k.key; return xs.reduce((m, x) => (lt(key ? I.call(key, [m], {}) : m, key ? I.call(key, [x], {}) : x) ? x : m)); }),
      abs: nat(([x]) => (x?.__op ? x.__op('abs') : Math.abs(num(x)))),
      round: nat(([x, n]) => { if (x instanceof Unk) return x; if (n == null) { const r = Math.round(x); return Math.abs(x % 1) === 0.5 && r % 2 ? r - 1 : r; } const f = 10 ** n; return Math.round(x * f) / f; }),
      int: nat(([x, base]) => (x instanceof Unk ? x : typeof x === 'string' ? parseInt(x, base || 10) : Math.trunc(num(x) || 0))),
      float: nat(([x]) => (x instanceof Unk ? x : x === undefined ? 0 : typeof x === 'string' ? (/inf/i.test(x) ? (x.trim()[0] === '-' ? -Infinity : Infinity) : parseFloat(x)) : +num(x))),
      str: nat(([x = '']) => repr(x)), repr: nat(([x]) => repr(x, false)),
      bool: nat(([x]) => truthy(x)),
      list: nat(([x]) => (x == null ? [] : I.iter(x))), tuple: nat(([x]) => tup(x == null ? [] : I.iter(x))),
      set: nat(([x]) => { const out = []; for (const v of I.iter(x)) if (!out.some(y => eq(y, v))) out.push(v); return out; }),
      frozenset: nat(([x]) => I.iter(x)),
      dict: nat((a, k) => { const d = new PyDict(); if (a[0] instanceof PyDict) for (const [x, y] of a[0].items()) d.set(x, y); else if (a[0]) for (const p of I.iter(a[0])) d.set(p[0], p[1]); for (const [x, y] of Object.entries(k)) d.set(x, y); return d; }),
      sum: nat(([it, s = 0]) => I.iter(it).reduce((acc, x) => I.binop('+', acc, x), s)),
      sorted: nat(([it], k) => { const xs = I.iter(it); const key = k.key ? x => I.call(k.key, [x], {}) : x => x; xs.sort((a, b) => (lt(key(a), key(b)) ? -1 : lt(key(b), key(a)) ? 1 : 0)); if (truthy(k.reverse)) xs.reverse(); return xs; }),
      reversed: nat(([it]) => I.iter(it).reverse()),
      map: nat(([f, ...its]) => { const ls = its.map(x => I.iter(x)); const n = Math.min(...ls.map(x => x.length)); return [...Array(n)].map((_, i) => I.call(f, ls.map(l => l[i]), {})); }),
      filter: nat(([f, it]) => I.iter(it).filter(x => truthy(f == null ? x : I.call(f, [x], {})))),
      any: nat(([it]) => I.iter(it).some(truthy)), all: nat(([it]) => I.iter(it).every(truthy)),
      isinstance: nat(([o, c]) => { const cs = Array.isArray(c) ? c : [c]; return cs.some(cc => cc === B.int ? typeof o === 'number' && Number.isInteger(o) : cc === B.float ? typeof o === 'number' : cc === B.str ? typeof o === 'string' : cc === B.list ? Array.isArray(o) && !isTuple(o) : cc === B.tuple ? isTuple(o) : cc === B.dict ? o instanceof PyDict : cc === B.bool ? typeof o === 'boolean' : o instanceof PyInst && isSub(o.cls, cc)); }),
      issubclass: nat(([a, b]) => isSub(a, b)),
      hasattr: nat(([o, n]) => !(I.getattr(o, n, true) instanceof Unk)),
      getattr: nat(([o, n, d]) => { const v = I.getattr(o, n, true); return v instanceof Unk && d !== undefined ? d : v; }),
      setattr: nat(([o, n, v]) => { I.setattr(o, n, v); return null; }),
      type: nat(([o]) => (o instanceof PyInst ? o.cls : new Unk('type'))),
      pow: nat(([a, b]) => Math.pow(a, b)), divmod: nat(([a, b]) => tup([Math.floor(a / b), pmod(a, b)])),
      chr: nat(([n]) => String.fromCodePoint(n)), ord: nat(([s]) => s.codePointAt(0)),
      hex: nat(([n]) => (n < 0 ? '-0x' + (-n).toString(16) : '0x' + n.toString(16))),
      id: nat(() => 0), hash: nat(([x]) => [...repr(x)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7)),
      callable: nat(([f]) => typeof f === 'function' || f instanceof PyFunc || f instanceof PyClass || f instanceof Bound),
      iter: nat(([x]) => I.iter(x)), next: nat(([x, d]) => (Array.isArray(x) && x.length ? x.shift() : d ?? null)),
      input: nat(() => ''), open: nat(([p]) => new Unk(`open(${repr(p)})`)), exit: nat(() => { throw new PyError('exit', I.line, 'SystemExit'); }), quit: nat(() => { throw new PyError('exit', I.line, 'SystemExit'); }),
      vars: nat(() => new PyDict()), globals: nat(() => new PyDict(Object.entries(I.globals.vars))), locals: nat(() => new PyDict()),
      super: nat((a, k) => {
        // super() داخل متد: کلاس والد کلاس تعریف‌کننده
        const env = I._curEnv;
        return new Unk('super');
      }),
      staticmethod: Object.assign(nat(([f]) => { f.static = true; return f; }), { __decorator: 'staticmethod' }),
      classmethod: Object.assign(nat(([f]) => { f.classm = true; return f; }), { __decorator: 'classmethod' }),
      property: Object.assign(nat(([f]) => { f.prop = true; return f; }), { __decorator: 'property' }),
      object: new NativeClass('object'), Exception: new NativeClass('Exception', { init: ([o, m]) => { o.d.args = tup([m]); } }),
      ValueError: new NativeClass('ValueError'), TypeError: new NativeClass('TypeError'), KeyError: new NativeClass('KeyError'), RuntimeError: new NativeClass('RuntimeError'), IndexError: new NativeClass('IndexError'),
      NotImplementedError: new NativeClass('NotImplementedError'), FileNotFoundError: new NativeClass('FileNotFoundError'), ImportError: new NativeClass('ImportError'), OSError: new NativeClass('OSError'), StopIteration: new NativeClass('StopIteration'), ZeroDivisionError: new NativeClass('ZeroDivisionError'),
      __name__: '__main__', __file__: 'script.py', NotImplemented: null, Ellipsis: null,
    };
    return B;
  }
}
/* super(): به محیط فراخوانی دسترسی لازم دارد ← در eval کنترل می‌شود */
const _evalCall = Interp.prototype.eval;
Interp.prototype.eval = function (e, env) {
  if (e.type === 'Call' && e.fn.type === 'Name' && e.fn.id === 'super' && !(env.vars.super)) {
    let en = env; while (en && !en.fn) en = en.parent;
    const f = en?.fn, cls = f?.cls, self = en?.vars[f?.params?.[0]?.name];
    if (cls instanceof PyClass && self) return makeSuper(this, cls, self);
    return new Unk('super');
  }
  return _evalCall.call(this, e, env);
};
function makeSuper(I, cls, self) {
  return {
    __pyget(name) {
      for (const b of cls.bases) {
        const v = I.classLookup(b, name);
        if (v !== undefined) {
          if (v instanceof PyFunc) return new Bound(self, v);
          if (typeof v === 'function' && v.__native) return nat((a, k) => v([self, ...a], k, I));
          return v;
        }
        if (name === '__init__') { const nb = I.nativeBase(b); if (nb?.init) return nat((a, k) => { nb.init([self, ...a], k, I); return null; }); }
      }
      return nat(() => null);
    },
  };
}
function containsYield(body) {
  const walk = n => {
    if (!n || typeof n !== 'object') return false;
    if (n.type === 'Yield') return true;
    if (n.type === 'Def' || n.type === 'Lambda' || n.type === 'Class') return false;
    for (const v of Object.values(n)) { if (Array.isArray(v)) { if (v.some(walk)) return true; } else if (v && typeof v === 'object' && walk(v)) return true; }
    return false;
  };
  return body.some(walk);
}
function isSub(a, b) { if (a === b) return true; if (a instanceof PyClass) return a.bases.some(x => isSub(x, b)); return false; }
function sliceIdx(k, n) {
  const c = k.c ?? 1;
  const norm = (v, d) => (v == null ? d : v < 0 ? Math.max(c < 0 ? -1 : 0, n + v) : Math.min(v, c < 0 ? n - 1 : n));
  return c > 0 ? [norm(k.a, 0), norm(k.b, n), c] : [norm(k.a, n - 1), k.b == null ? -1 : norm(k.b, -1), c];
}
export function eq(a, b) {
  if (a === b) return true;
  if (typeof a === 'boolean') a = +a; if (typeof b === 'boolean') b = +b;
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((x, i) => eq(x, b[i]));
  if (a?.__eq) return a.__eq(b);
  return a === b;
}
function lt(a, b) {
  if (Array.isArray(a) && Array.isArray(b)) { for (let i = 0; i < Math.min(a.length, b.length); i++) { if (lt(a[i], b[i])) return true; if (lt(b[i], a[i])) return false; } return a.length < b.length; }
  return a < b;
}
function contains(c, x) {
  if (typeof c === 'string') return typeof x === 'string' && c.includes(x);
  if (Array.isArray(c)) return c.some(y => eq(y, x));
  if (c instanceof PyDict) return c.has(x);
  if (c?.__contains) return c.__contains(x);
  return false;
}

/* ── متدهای نوع‌های پایه ── */
function builtinMethod(I, o, name) {
  const m = (fn) => nat((a, k) => fn(a, k));
  if (typeof o === 'string') {
    const S = {
      upper: () => o.toUpperCase(), lower: () => o.toLowerCase(), title: () => o.replace(/\b\w/g, c => c.toUpperCase()), capitalize: () => o.charAt(0).toUpperCase() + o.slice(1).toLowerCase(),
      strip: ([c]) => (c ? o.replace(new RegExp(`^[${esc(c)}]+|[${esc(c)}]+$`, 'g'), '') : o.trim()), lstrip: ([c]) => (c ? o.replace(new RegExp(`^[${esc(c)}]+`), '') : o.trimStart()), rstrip: ([c]) => (c ? o.replace(new RegExp(`[${esc(c)}]+$`), '') : o.trimEnd()),
      split: ([sep, n]) => { const r = sep == null ? o.trim().split(/\s+/).filter(Boolean) : o.split(sep); if (n != null && n >= 0 && r.length > n + 1) return [...r.slice(0, n), r.slice(n).join(sep ?? ' ')]; return r; },
      splitlines: () => o.split(/\r?\n/), join: ([it]) => I.iter(it).map(x => repr(x)).join(o), replace: ([a, b, n]) => (n == null || n < 0 ? o.split(a).join(b) : o.split(a).slice(0, n + 1).join(b) + (o.split(a).length > n + 1 ? a + o.split(a).slice(n + 1).join(a) : '')),
      startswith: ([p]) => (Array.isArray(p) ? p.some(x => o.startsWith(x)) : o.startsWith(p)), endswith: ([p]) => (Array.isArray(p) ? p.some(x => o.endsWith(x)) : o.endsWith(p)),
      find: ([s]) => o.indexOf(s), index: ([s]) => o.indexOf(s), rfind: ([s]) => o.lastIndexOf(s), count: ([s]) => o.split(s).length - 1,
      format: (a, k) => strFormat(o, a, k), center: ([w, f = ' ']) => fmtSpec(o, `${f}^${w}`), ljust: ([w, f = ' ']) => fmtSpec(o, `${f}<${w}`), rjust: ([w, f = ' ']) => fmtSpec(o, `${f}>${w}`),
      zfill: ([w]) => o.padStart(w, '0'), isdigit: () => /^\d+$/.test(o), isalpha: () => /^\p{L}+$/u.test(o), isspace: () => /^\s+$/.test(o), isupper: () => o === o.toUpperCase() && /\p{L}/u.test(o), islower: () => o === o.toLowerCase() && /\p{L}/u.test(o),
      encode: () => o, decode: () => o, partition: ([s]) => { const i = o.indexOf(s); return i < 0 ? tup([o, '', '']) : tup([o.slice(0, i), s, o.slice(i + s.length)]); },
      swapcase: () => [...o].map(c => (c === c.toUpperCase() ? c.toLowerCase() : c.toUpperCase())).join(''), expandtabs: () => o.replace(/\t/g, '        '),
    };
    return S[name] ? m(S[name]) : undefined;
  }
  if (Array.isArray(o)) {
    const L = {
      append: ([x]) => { o.push(x); return null; }, extend: ([x]) => { o.push(...I.iter(x)); return null; }, insert: ([i, x]) => { o.splice(i < 0 ? Math.max(0, o.length + i) : i, 0, x); return null; },
      pop: ([i]) => (i == null ? o.pop() : o.splice(i < 0 ? o.length + i : i, 1)[0]) ?? null, remove: ([x]) => { const i = o.findIndex(y => eq(y, x)); if (i >= 0) o.splice(i, 1); return null; },
      index: ([x]) => o.findIndex(y => eq(y, x)), count: ([x]) => o.filter(y => eq(y, x)).length, reverse: () => { o.reverse(); return null; },
      sort: (a, k) => { const key = k.key ? x => I.call(k.key, [x], {}) : x => x; o.sort((p, q) => (lt(key(p), key(q)) ? -1 : lt(key(q), key(p)) ? 1 : 0)); if (truthy(k.reverse)) o.reverse(); return null; },
      copy: () => o.slice(), clear: () => { o.length = 0; return null; },
      add: ([x]) => { if (!o.some(y => eq(y, x))) o.push(x); return null; }, update: ([x]) => { for (const v of I.iter(x)) if (!o.some(y => eq(y, v))) o.push(v); return null; }, discard: ([x]) => { const i = o.findIndex(y => eq(y, x)); if (i >= 0) o.splice(i, 1); return null; },
      tolist: () => o.slice(),
    };
    return L[name] ? m(L[name]) : undefined;
  }
  if (o instanceof PyDict) {
    const D = {
      get: ([k, d = null]) => o.get(k, d), items: () => o.items(), keys: () => o.keys(), values: () => o.values(),
      update: ([x], k) => { if (x instanceof PyDict) for (const [a, b] of x.items()) o.set(a, b); else if (x) for (const p of I.iter(x)) o.set(p[0], p[1]); for (const [a, b] of Object.entries(k)) o.set(a, b); return null; },
      setdefault: ([k, d = null]) => { if (!o.has(k)) o.set(k, d); return o.get(k); }, pop: ([k, d = null]) => { const v = o.get(k, d); o.del(k); return v; },
      copy: () => new PyDict(o.items()), clear: () => { o.m.clear(); return null; },
    };
    return D[name] ? m(D[name]) : undefined;
  }
  if (typeof o === 'number') {
    const N = { is_integer: () => Number.isInteger(o), real: o, imag: 0, conjugate: () => o };
    if (name === 'real') return o; if (name === 'imag') return 0;
    return N[name] ? m(N[name]) : undefined;
  }
  return undefined;
}
const esc = s => s.replace(/[\]\\^-]/g, '\\$&');

/* ── کتابخانه‌های استاندارد کوچک ── */
function stdModule(name, I) {
  const n = nat;
  if (name === 'math') {
    const d = { pi: Math.PI, e: Math.E, tau: Math.PI * 2, inf: Infinity, nan: NaN };
    for (const k of ['sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'sqrt', 'exp', 'floor', 'ceil', 'sinh', 'cosh', 'tanh', 'log2', 'log10', 'trunc']) d[k] = n(([x]) => Math[k](x));
    d.atan2 = n(([a, b]) => Math.atan2(a, b)); d.pow = n(([a, b]) => Math.pow(a, b)); d.hypot = n(a => Math.hypot(...a)); d.fabs = n(([x]) => Math.abs(x));
    d.log = n(([x, b]) => (b ? Math.log(x) / Math.log(b) : Math.log(x))); d.radians = n(([x]) => (x * Math.PI) / 180); d.degrees = n(([x]) => (x * 180) / Math.PI);
    d.isclose = n(([a, b]) => Math.abs(a - b) < 1e-9); d.copysign = n(([a, b]) => Math.sign(b) * Math.abs(a)); d.fmod = n(([a, b]) => a % b); d.gcd = n(([a, b]) => { while (b) [a, b] = [b, a % b]; return Math.abs(a); });
    d.factorial = n(([x]) => { let r = 1; for (let i = 2; i <= x; i++) r *= i; return r; }); d.isnan = n(([x]) => Number.isNaN(x)); d.isinf = n(([x]) => !Number.isFinite(x) && !Number.isNaN(x));
    return new PyModule('math', d);
  }
  if (name === 'random') {
    let s = 12345;
    const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    return new PyModule('random', {
      seed: n(([x]) => { s = (Math.abs(Math.floor(+x || 0)) % 2147483647) || 7; return null; }), random: n(() => rnd()),
      uniform: n(([a, b]) => a + (b - a) * rnd()), randint: n(([a, b]) => a + Math.floor(rnd() * (b - a + 1))), randrange: n(([a, b, st = 1]) => (b == null ? Math.floor(rnd() * a) : a + st * Math.floor(rnd() * ((b - a) / st)))),
      choice: n(([xs]) => { const l = I.iter(xs); return l[Math.floor(rnd() * l.length)]; }), shuffle: n(([xs]) => { for (let i = xs.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [xs[i], xs[j]] = [xs[j], xs[i]]; } return null; }),
      sample: n(([xs, k]) => { const l = I.iter(xs).slice(); const out = []; for (let i = 0; i < k && l.length; i++) out.push(l.splice(Math.floor(rnd() * l.length), 1)[0]); return out; }),
      gauss: n(([m = 0, sd = 1]) => m + sd * Math.sqrt(-2 * Math.log(rnd() || 1e-9)) * Math.cos(2 * Math.PI * rnd())),
    });
  }
  if (['os', 'os.path', 'sys', 'pathlib', 'time', 'json', 're', 'itertools', 'functools', 'typing', 'dataclasses', 'collections', 'subprocess', 'shutil', 'glob', 'argparse', 'logging', 'tempfile', 'textwrap', 'datetime', 'string', 'copy', 'colorsys', 'enum', 'abc', '__future__', 'warnings'].includes(name)) {
    const d = {};
    if (name === 'os' || name === 'os.path') {
      const path = new PyModule('os.path', { join: n(a => a.map(x => repr(x)).join('/')), exists: n(() => true), basename: n(([p]) => String(p).split('/').pop()), dirname: n(([p]) => String(p).split('/').slice(0, -1).join('/')), splitext: n(([p]) => { const m = /^(.*?)(\.[^./]*)?$/.exec(String(p)); return tup([m[1], m[2] || '']); }), abspath: n(([p]) => p), isfile: n(() => true), isdir: n(() => true) });
      if (name === 'os.path') return path;
      Object.assign(d, { path, makedirs: n(() => null), mkdir: n(() => null), listdir: n(() => []), getcwd: n(() => '.'), environ: new PyDict(), remove: n(() => null), system: n(() => 0) });
    }
    if (name === 'sys') Object.assign(d, { argv: ['script.py'], exit: n(() => { throw new PyError('exit', I.line, 'SystemExit'); }), version: '3.11', platform: 'linux', stdout: new Unk('stdout'), path: [] });
    if (name === 'time') Object.assign(d, { time: n(() => 0), sleep: n(() => null), perf_counter: n(() => 0) });
    if (name === 'colorsys') Object.assign(d, {
      hsv_to_rgb: n(([h, s, v]) => { const i = Math.floor(h * 6), f = h * 6 - i, p = v * (1 - s), q = v * (1 - f * s), t = v * (1 - (1 - f) * s); return tup([[v, t, p], [q, v, p], [p, v, t], [p, q, v], [t, p, v], [v, p, q]][((i % 6) + 6) % 6]); }),
      hls_to_rgb: n(([h, l, s]) => { const f = nn => { const k = (nn + h * 12) % 12, a = s * Math.min(l, 1 - l); return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); }; return tup([f(0), f(8), f(4)]); }),
    });
    if (name === 'itertools') Object.assign(d, { product: n(a => a.map(x => I.iter(x)).reduce((acc, l) => acc.flatMap(p => l.map(v => [...p, v])), [[]]).map(tup)), chain: n(a => a.flatMap(x => I.iter(x))), count: n(() => [...Array(1000).keys()]), cycle: n(([x]) => { const l = I.iter(x); return [...Array(1000)].map((_, i) => l[i % l.length]); }), combinations: n(([x, r]) => { const l = I.iter(x), out = []; const go = (s, c) => { if (c.length === r) { out.push(tup(c)); return; } for (let i = s; i < l.length; i++) go(i + 1, [...c, l[i]]); }; go(0, []); return out; }), islice: n(([x, a, b]) => (b === undefined ? I.iter(x).slice(0, a) : I.iter(x).slice(a, b))), repeat: n(([x, k = 100]) => Array(k).fill(x)) });
    if (name === 'json') Object.assign(d, { dumps: n(([x]) => JSON.stringify(toJS(x))), loads: n(([s]) => fromJS(JSON.parse(s))), dump: n(() => null), load: n(() => new PyDict()) });
    if (name === 'functools') Object.assign(d, { reduce: n(([f, it, init]) => { const l = I.iter(it); let acc = init === undefined ? l.shift() : init; for (const x of l) acc = I.call(f, [acc, x], {}); return acc; }), lru_cache: Object.assign(n(a => (a[0] instanceof PyFunc ? a[0] : n(([f]) => f))), {}), partial: n(([f, ...a0], k0) => nat((a, k) => I.call(f, [...a0, ...a], { ...k0, ...k }))), wraps: n(() => n(([f]) => f)) });
    if (name === 'dataclasses') Object.assign(d, { dataclass: n(([c]) => c ?? n(([cc]) => cc)), field: n((a, k) => k.default ?? null) });
    if (name === 'pathlib') { const P = n(([p = '.']) => mkPath(String(p))); Object.assign(d, { Path: P }); }
    if (name === 'string') Object.assign(d, { ascii_letters: 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ', ascii_uppercase: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', ascii_lowercase: 'abcdefghijklmnopqrstuvwxyz', digits: '0123456789' });
    if (name === 'copy') Object.assign(d, { copy: n(([x]) => (Array.isArray(x) ? x.slice() : x)), deepcopy: n(([x]) => (Array.isArray(x) ? JSON.parse(JSON.stringify(x)) : x)) });
    if (name === 'textwrap') Object.assign(d, { dedent: n(([s]) => s), wrap: n(([s, w = 70]) => String(s).match(new RegExp(`.{1,${w}}(\\s|$)`, 'g')) || []), fill: n(([s]) => s) });
    if (name === 'enum') { const E = new NativeClass('Enum'); Object.assign(d, { Enum: E, IntEnum: E, auto: n(() => 0) }); }
    if (name === 'typing') for (const k of ['List', 'Dict', 'Tuple', 'Optional', 'Union', 'Any', 'Callable', 'Sequence', 'Iterable']) d[k] = new Unk(k);
    if (name === 're') Object.assign(d, { sub: n(([p, r, s]) => String(s).replace(new RegExp(p, 'g'), typeof r === 'string' ? r.replace(/\\(\d)/g, '$$$1') : '')), findall: n(([p, s]) => String(s).match(new RegExp(p, 'g')) || []), split: n(([p, s]) => String(s).split(new RegExp(p))), match: n(() => null), search: n(() => null), compile: n(([p]) => new Unk('re')) });
    return new PyModule(name, d);
  }
  return null;
}
function mkPath(p) {
  return { __ptype: 'Path', __repr: () => p, __op: (op, o) => (op === '/' ? mkPath(p.replace(/\/$/, '') + '/' + repr(o)) : undefined),
    __pyget: (k) => ({ name: p.split('/').pop(), stem: p.split('/').pop().replace(/\.[^.]*$/, ''), suffix: (/\.[^./]*$/.exec(p) || [''])[0], parent: mkPath(p.split('/').slice(0, -1).join('/') || '.'),
      exists: nat(() => true), mkdir: nat(() => null), read_text: nat(() => ''), write_text: nat(() => null), resolve: nat(() => mkPath(p)), with_suffix: nat(([s]) => mkPath(p.replace(/\.[^./]*$/, '') + s)), glob: nat(() => []), is_file: nat(() => true) })[k] };
}
export function toJS(v) {
  if (v instanceof PyDict) { const o = {}; for (const [k, x] of v.items()) o[repr(k)] = toJS(x); return o; }
  if (Array.isArray(v)) return v.map(toJS);
  if (v instanceof Unk) return null;
  return v;
}
export function fromJS(v) {
  if (Array.isArray(v)) return v.map(fromJS);
  if (v && typeof v === 'object') return new PyDict(Object.entries(v).map(([k, x]) => [k, fromJS(x)]));
  return v;
}
