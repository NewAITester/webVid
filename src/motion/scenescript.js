import { newLayer, LAYER_TYPES, EFFECTS, SHAPE_KINDS, BLEND_MODES } from './schema.js';
import { APPEAR, LOOPS } from './animate.js';
import { TEXT_STYLES, applyTextStyle, fxWith } from './presets.js';
import { ELEMENT_KINDS, makeElementLayer, elementParams } from './elements.js';
import { usePacks } from './packs.js';
import { importedBody } from './importers/canvasjs.js';

/**
 * «موشن‌اسکریپت» — یک ویدیوی موشن را با چند خط کد بنویسید
 * ─────────────────────────────────────────────────────────────
 * اسکریپت یک کد JS ساده است که «صحنه»ها را پشت سر هم می‌چیند:
 *
 *   tempo(128)
 *   scene('شروع', bars(1),
 *     bg('#07070C'),
 *     burst({ n: 120, from: beats(3) }),
 *     text('سلام', { size: 200, enter: 'pop' }))
 *   transition('wipe')
 *   scene('پایان', bars(1), swarmText({ text: 'END' }))
 *
 * برنامه اسکریپت را اجرا می‌کند و از هر المان یک «لایه» می‌سازد. بعد از
 * آن همه‌چیز دستی هم قابل تغییر است (زبانهٔ لایه‌ها)، و با «خروجی
 * اسکریپت» می‌شود دوباره از لایه‌ها کد گرفت.
 *
 * زمان‌ها ثانیه‌اند؛ beats(n) و bars(n) با tempo حساب می‌شوند.
 * x و y پیکسل از وسط قاب‌اند (W و H اندازهٔ قاب در دسترس است).
 */

const isFn = v => typeof v === 'function';
const num = (v, d) => (typeof v === 'number' && isFinite(v) ? v : d);

/** متن تابع ← بدنهٔ آن (برای code(function (ctx, e) {...})) */
function fnBody(fn) {
  const s = String(fn);
  const i = s.indexOf('{'), j = s.lastIndexOf('}');
  if (/^\s*(\([^)]*\)|[\w$]+)\s*=>\s*[^{\s]/.test(s)) return s.replace(/^\s*(\([^)]*\)|[\w$]+)\s*=>\s*/, '');
  if (i < 0 || j < i) return s;
  return s.slice(i + 1, j).replace(/^\n/, '').replace(/\s+$/, '');
}

/**
 * اجرای اسکریپت ← فهرست صحنه‌ها و المان‌ها (هنوز لایه نیست)
 * @returns {{ ok, error, line, tempo, length, scenes:[{name,t0,t1,items}], globals:[], warnings:[] }}
 */
export function runScript(src, { W = 1080, H = 1920, bpm = 120 } = {}) {
  const S = { tempo: bpm || 120, cursor: 0, scenes: [], globals: [], warnings: [], cur: null };
  // elementPack({...}) ← المان‌های تازه اول ثبت می‌شوند تا همین اسکریپت بتواند صدایشان بزند
  const PK = usePacks(src);
  src = PK.rest;
  for (const e of PK.errors) S.warnings.push('بستهٔ المان — ' + e);
  const beat = () => 60 / S.tempo;
  const item = (type, extra) => ({ __el: true, type, ...extra });
  const opt = o => (o && typeof o === 'object' && !o.__el ? o : {});

  const api = {
    W, H,
    tempo: b => { if (b > 0) S.tempo = +b; return S.tempo; },
    beats: n => +(n * beat()).toFixed(4),
    bars: n => +(n * beat() * 4).toFixed(4),
    at: t => { S.cursor = Math.max(0, +t || 0); return S.cursor; },
    wait: d => { S.cursor += Math.max(0, +d || 0); return S.cursor; },
    now: () => S.cursor,
    /** scene(نام، مدت، ...المان‌ها)  یا  scene({ name, dur, at }, ...المان‌ها) */
    scene(a, b, ...rest) {
      let o = {}, items;
      if (typeof a === 'object' && a && !a.__el && !Array.isArray(a)) { o = a; items = [b, ...rest]; }
      else { o = { name: a, dur: b }; items = rest; }
      items = items.flat(Infinity).filter(x => x && x.__el);
      const t0 = o.at != null ? Math.max(0, +o.at) : S.cursor;
      const dur = Math.max(0.05, num(o.dur, beat() * 4));
      const sc = { name: String(o.name ?? `صحنه ${S.scenes.length + 1}`), t0, t1: t0 + dur, items };
      S.scenes.push(sc);
      S.cursor = sc.t1;
      return sc;
    },
    /** گذار روی مرز فعلی (نیمی قبل، نیمی بعد از برش) */
    transition(kind = 'wipe', o = {}) {
      if (!ELEMENT_KINDS[kind]) { S.warnings.push(`گذار ناشناخته: ${kind}`); return null; }
      const d = num(o.dur, 0.5), c = num(o.at, S.cursor);
      const it = item('el', { kind, o: { ...o, name: o.name || ELEMENT_KINDS[kind].label } });
      S.globals.push({ t0: Math.max(0, c - d * (o.align === 'after' ? 0 : o.align === 'before' ? 1 : 0.5)), dur: d, it, scene: 'گذار' });
      return it;
    },
    /** المان‌هایی که از ابتدا تا انتهای ویدیو هستند (دانه، ویگنت، نوار پیشرفت …) */
    overlay(...items) { S._overlay = (S._overlay || []).concat(items.flat(Infinity).filter(x => x && x.__el)); },

    text: (str, o) => item('text', { str: String(str ?? ''), o: opt(o) }),
    shape: (kind = 'rect', o) => item('shape', { kind, o: opt(o) }),
    bg: (c = '#000000', o) => item('bg', { c, o: opt(o) }),
    spectrum: o => item('spectrum', { o: opt(o) }),
    code: (src, o) => item('code', { src: isFn(src) ? fnBody(src) : String(src || ''), o: opt(o) }),
    adjust: o => item('adjust', { o: opt(o) }),
    /** کد وارد‌شده: imported(PROGRAM, { run, start, values, tweaks, labels, title }) ← لایهٔ کدی که کد اصلی را اجرا می‌کند */
    imported: (prog, o = {}) => {
      const { run, start, values, tweaks, title, labels, hide, part, partName, ...rest } = opt(o);
      return item('code', { src: importedBody(String(prog || ''), { run, start, values, tweaks, title, labels, hide, part, partName }), o: rest });
    },
    layer: raw => item('raw', { raw }),
    /** ابزار: رنگ‌ها با شفافیت  ← '#RRGGBBAA' */
    alpha: (hex, a) => String(hex).slice(0, 7) + Math.round(Math.max(0, Math.min(1, a)) * 255).toString(16).padStart(2, '0'),
    log: (...a) => S.warnings.push('log: ' + a.map(String).join(' ')),
    elementPack: () => {},
  };
  for (const kind of Object.keys(ELEMENT_KINDS)) api[kind] = o => item('el', { kind, o: opt(o) });

  const names = Object.keys(api);
  try {
    // eslint-disable-next-line no-new-func
    const fn = new Function(...names, `"use strict";\n${src}\n;`);
    fn(...names.map(k => api[k]));
  } catch (err) {
    return { ok: false, error: err?.message || String(err), line: errLine(err), scenes: S.scenes, globals: [], warnings: S.warnings, tempo: S.tempo, length: S.cursor };
  }
  const length = Math.max(S.cursor, ...S.scenes.map(s => s.t1), ...S.globals.map(g => g.t0 + g.dur), 0);
  for (const it of S._overlay || []) S.globals.unshift({ t0: 0, dur: length, it, scene: 'روی همه', top: true });
  if (!S.scenes.length && !S.globals.length) S.warnings.push('اسکریپت هیچ صحنه‌ای نساخت. با scene(…) شروع کنید.');
  return { ok: true, error: null, scenes: S.scenes, globals: S.globals, warnings: S.warnings, tempo: S.tempo, length };
}

/** شمارهٔ خط خطا (اگر مرورگر بدهد) */
function errLine(err) {
  const m = /<anonymous>:(\d+):\d+/.exec(err?.stack || '') || /Function:(\d+)/.exec(err?.stack || '');
  if (m) return Math.max(1, +m[1] - 3);       // دو خط سرآیند new Function + یک خط "use strict"
  if (err?.lineNumber) return Math.max(1, err.lineNumber - 3);
  return null;
}

/* ── ساخت لایه‌ها ──────────────────────────────────────────── */
const pct = (v, d) => (v == null ? d : Math.abs(v) <= 4 ? v * 100 : v);   // 1.2 ← ۱۲۰٪
function setP(L, k, v) { if (v != null && L.props[k]) L.props[k] = { v: +v === +v && typeof v !== 'string' ? +v : v }; }

function common(L, o, dur, warn) {
  if (o.name) L.name = String(o.name), L._named = true;
  setP(L, 'x', o.x); setP(L, 'y', o.y);
  if (o.scale != null) setP(L, 'sc', pct(o.scale, 100));
  if (o.sc != null) setP(L, 'sc', o.sc);
  setP(L, 'rot', o.rot);
  if (o.opacity != null) setP(L, 'opacity', o.opacity <= 1 ? o.opacity * 100 : o.opacity);
  if (o.w != null && L.props.w) setP(L, 'w', o.w);
  if (o.h != null && L.props.h) setP(L, 'h', o.h);
  if (o.blend) {
    if (BLEND_MODES.some(b => b[0] === o.blend)) L.blend = o.blend;
    else warn(`حالت ترکیب ناشناخته: ${o.blend}`);
  }
  if (o.behind != null) L.behind = !!o.behind;
  const anim = (which, v, dd) => {
    if (!v) return;
    const [id, d] = Array.isArray(v) ? v : [v, dd];
    if (!APPEAR[id]) { warn(`حرکت ناشناخته: ${id}`); return; }
    L.anim[which] = { id, d: num(d, 0.4) };
  };
  anim('in', o.enter, o.enterDur); anim('out', o.exit, o.exitDur);
  if (o.loop) {
    const [id, s, a] = Array.isArray(o.loop) ? o.loop : [o.loop, 1, 100];
    if (LOOPS[id]) L.anim.loop = { id, s: num(s, 1), a: num(a, 100) };
    else warn(`حرکت تکراری ناشناخته: ${id}`);
  }
  for (const f of [].concat(o.fx || [])) {
    const [t, v] = Array.isArray(f) ? f : [f, {}];
    if (EFFECTS[t]) L.effects.push(fxWith(t, v || {})); else warn(`افکت ناشناخته: ${t}`);
  }
  for (const [k, ks] of Object.entries(o.keys || {})) {
    if (!L.props[k] || !Array.isArray(ks) || !ks.length) { warn(`کی‌فریم برای ویژگی ناشناخته: ${k}`); continue; }
    const conv = v => (k === 'opacity' && v <= 1 ? v * 100 : k === 'sc' && Math.abs(v) <= 4 ? v * 100 : v);
    L.props[k] = { v: conv(ks[ks.length - 1][1]), k: ks.map(([t, v, e]) => ({ t: Math.max(0, Math.min(+t, dur)), v: conv(v), e: e || 'outCubic' })) };
  }
}

function buildOne(it, t0, dur, W, H, warn) {
  const o = it.o || {};
  let L;
  switch (it.type) {
    case 'el': {
      const K = ELEMENT_KINDS[it.kind];
      const p = {};
      for (const d of K.params) if (o[d.key] !== undefined) p[d.key] = o[d.key];
      L = makeElementLayer(it.kind, p, t0, dur, W, H);
      break;
    }
    case 'text': {
      L = newLayer('text', t0, dur);
      L.data.str = it.str;
      L.name = it.str.slice(0, 24) || 'متن';
      if (o.style) {
        const st = TEXT_STYLES.find(s => s.id === o.style);
        if (st) applyTextStyle(L, st, W, H); else warn(`سبک متن ناشناخته: ${o.style}`);
      }
      if (o.font) L.data.font = o.font;
      if (o.align) L.data.align = o.align;
      setP(L, 'size', o.size); setP(L, 'fill', o.color ?? o.fill); setP(L, 'stroke', o.stroke);
      setP(L, 'strokeW', o.strokeW); setP(L, 'spacing', o.spacing); setP(L, 'lineH', o.lineH);
      setP(L, 'bg', o.bg); setP(L, 'bgPad', o.bgPad); setP(L, 'bgR', o.bgR);
      break;
    }
    case 'shape': {
      L = newLayer('shape', t0, dur);
      if (!SHAPE_KINDS.some(k => k[0] === it.kind)) warn(`شکل ناشناخته: ${it.kind}`);
      L.data.kind = it.kind;
      L.name = (SHAPE_KINDS.find(k => k[0] === it.kind) || [, 'شکل'])[1];
      if (o.fillOn === false || o.fill === 'none') L.data.fillOn = false;
      if (o.grad) L.data.grad = o.grad;
      for (const k of ['fill', 'fill2', 'gradA', 'stroke', 'strokeW', 'radius', 'sides', 'inner', 'trimS', 'trimE']) if (o[k] !== 'none') setP(L, k, o[k]);
      if (o.color) setP(L, 'fill', o.color);
      break;
    }
    case 'bg': {
      L = newLayer('shape', t0, dur);
      L.name = 'پس‌زمینه'; L.data.kind = 'rect';
      L.props.w = { v: Math.ceil(W * 1.06) }; L.props.h = { v: Math.ceil(H * 1.06) };
      const c = [].concat(it.c);
      L.props.fill = { v: c[0] };
      if (c[1]) { L.data.grad = o.radial === false ? 'linear' : 'radial'; L.props.fill2 = { v: c[1] }; }
      if (o.radial && c[1]) L.data.grad = 'radial';
      if (o.gradA != null) L.props.gradA = { v: o.gradA };
      L._bg = true;
      break;
    }
    case 'spectrum': {
      L = newLayer('spectrum', t0, dur);
      for (const k of ['mode', 'source', 'bars']) if (o[k] != null) L.data[k] = o[k];
      for (const k of ['fill', 'fill2', 'gain', 'gap']) setP(L, k, o[k]);
      break;
    }
    case 'code': {
      L = newLayer('code', t0, dur);
      L.name = 'کد'; L.data.code = it.src;
      L.props.w = { v: W }; L.props.h = { v: H };
      for (const k of ['c1', 'c2', 'p1', 'p2', 'p3']) setP(L, k, o[k]);
      break;
    }
    case 'adjust': {
      L = newLayer('adjust', t0, dur);
      L.name = 'تنظیم رنگ';
      break;
    }
    case 'raw': {
      const r = it.raw || {};
      if (!LAYER_TYPES[r.type]) { warn(`layer(): نوع ناشناخته ${r.type}`); return null; }
      L = newLayer(r.type, t0, dur);
      Object.assign(L, JSON.parse(JSON.stringify({ ...r, id: L.id, t0: L.t0, t1: L.t1 })));
      L.props = { ...newLayer(r.type).props, ...(r.props || {}) };
      return L;
    }
    default: return null;
  }
  common(L, o, dur, warn);
  return L;
}

/**
 * نتیجهٔ runScript ← لایه‌های برنامه
 * ترتیب: در هر صحنه، اولین المان پایین‌ترین است (مثل نقاشی: اول زمینه).
 * گذارها بالای همهٔ صحنه‌ها، و overlayها بالاتر از همه.
 */
export function scriptToLayers(res, { W = 1080, H = 1920, offset = 0, behind = false } = {}) {
  const out = [], warnings = [];
  res.scenes.forEach((sc, si) => {
    for (const it of sc.items) {
      const o = it.o || {};
      const from = Math.max(0, num(o.from, 0)), to = o.to != null ? +o.to : o.dur != null ? from + +o.dur : sc.t1 - sc.t0;
      const dur = Math.max(0.05, Math.min(to, 600) - from);
      const L = buildOne(it, +(offset + sc.t0 + from).toFixed(3), dur, W, H, m => warnings.push(`صحنهٔ «${sc.name}»: ${m}`));
      if (!L) continue;
      L.scene = sc.name; L.sceneIdx = si; L.src = 'script';
      if (o.behind == null) L.behind = behind;
      out.push(L);
    }
  });
  const tops = [];
  for (const g of res.globals) {
    const L = buildOne(g.it, +(offset + g.t0).toFixed(3), g.dur, W, H, m => warnings.push(`${g.scene}: ${m}`));
    if (!L) continue;
    L.scene = g.scene; L.src = 'script';
    if ((g.it.o || {}).behind == null) L.behind = behind;
    (g.top ? tops : out).push(L);
  }
  // overlayها به ترتیب نوشته‌شده بالای همه
  out.push(...tops.reverse());
  return { layers: out, warnings };
}

/* ── خروجی: لایه‌ها ← اسکریپت ─────────────────────────────── */
const r3 = v => +(+v).toFixed(3);
const js = v => (typeof v === 'string' ? `'${v.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n')}'` : Array.isArray(v) ? `[${v.map(js).join(', ')}]` : typeof v === 'number' ? String(r3(v)) : JSON.stringify(v));
const optStr = o => {
  const e = Object.entries(o).filter(([, v]) => v !== undefined && v !== null);
  return e.length ? `{ ${e.map(([k, v]) => `${/^[A-Za-z_$][\w$]*$/.test(k) ? k : js(k)}: ${js(v)}`).join(', ')} }` : '';
};
const kv = (L, k) => L.props[k]?.v;

/** ویژگی‌های مشترک برای خروجی (فقط آن‌هایی که با پیش‌فرض فرق دارند) */
function commonOut(L, base, sceneT0) {
  const o = {};
  const from = r3(L.t0 - sceneT0);
  if (from > 0.0005) o.from = from;
  o.dur = r3(L.t1 - L.t0);
  for (const k of ['x', 'y', 'rot']) if (kv(L, k) !== base.props[k].v) o[k] = kv(L, k);
  if (kv(L, 'sc') !== 100) o.scale = r3(kv(L, 'sc') / 100);
  if (kv(L, 'opacity') !== 100) o.opacity = r3(kv(L, 'opacity') / 100);
  if (L.blend && L.blend !== 'source-over') o.blend = L.blend;
  if (L.behind) o.behind = true;
  if (L.anim?.in?.id && L.anim.in.id !== 'none') o.enter = [L.anim.in.id, L.anim.in.d];
  if (L.anim?.out?.id && L.anim.out.id !== 'none') o.exit = [L.anim.out.id, L.anim.out.d];
  if (L.anim?.loop?.id && L.anim.loop.id !== 'none') o.loop = [L.anim.loop.id, L.anim.loop.s, L.anim.loop.a];
  if (L.effects?.length) o.fx = L.effects.filter(f => f.on !== false).map(f => [f.type, Object.fromEntries(Object.entries(f.p).map(([k, t]) => [k, t.v]))]);
  const keys = {};
  for (const [k, tr] of Object.entries(L.props)) if (tr.k?.length) keys[k] = tr.k.map(q => [r3(q.t), q.v, q.e]);
  if (Object.keys(keys).length) o.keys = keys;
  if (L._named) o.name = L.name;
  return o;
}

/** تنظیم‌های یک لایهٔ المان برای خروجی (فقط آن‌هایی که با پیش‌فرض فرق دارند) */
function elementOpts(L, o, W, H) {
  const kind = L.data.el.kind, p = elementParams(L), K = ELEMENT_KINDS[kind];
  const po = {};
  for (const d of K.params) if (p[d.key] !== d.def) po[d.key] = p[d.key];
  const def = makeElementLayer(kind, {}, 0, 1, W, H);
  if (kv(L, 'w') !== def.props.w.v) po.w = kv(L, 'w');
  if (kv(L, 'h') !== def.props.h.v) po.h = kv(L, 'h');
  return { ...po, ...o };
}

function layerCall(L, sceneT0, W, H) {
  const base = newLayer(L.type);
  const o = commonOut(L, base, sceneT0);
  if (L.type === 'code' && L.data.el && ELEMENT_KINDS[L.data.el.kind]) return `${L.data.el.kind}(${optStr(elementOpts(L, o, W, H))})`;
  if (L.type === 'text') {
    const t = {};
    if (L.style) t.style = L.style;
    for (const [k, nm] of [['size', 'size'], ['fill', 'color'], ['stroke', 'stroke'], ['strokeW', 'strokeW'], ['spacing', 'spacing']]) if (kv(L, k) !== base.props[k].v) t[nm] = kv(L, k);
    if (L.data.font && L.data.font !== 'black') t.font = L.data.font;
    return `text(${js(L.data.str || '')}${optStr({ ...t, ...o }) ? ', ' + optStr({ ...t, ...o }) : ''})`;
  }
  if (L.type === 'shape' && L._bg) {
    const c = L.data.grad && L.data.grad !== 'none' ? [kv(L, 'fill'), kv(L, 'fill2')] : kv(L, 'fill');
    delete o.x; delete o.y;
    return `bg(${js(c)}${optStr(o) ? ', ' + optStr(o) : ''})`;
  }
  if (L.type === 'shape') {
    const t = {};
    for (const k of ['w', 'h', 'fill', 'fill2', 'stroke', 'strokeW', 'radius', 'sides', 'inner', 'trimS', 'trimE']) if (kv(L, k) !== base.props[k].v) t[k] = kv(L, k);
    if (L.data.fillOn === false) t.fillOn = false;
    if (L.data.grad && L.data.grad !== 'none') t.grad = L.data.grad;
    return `shape(${js(L.data.kind || 'rect')}, ${optStr({ ...t, ...o })})`;
  }
  if (L.type === 'code') {
    const t = { w: kv(L, 'w'), h: kv(L, 'h') };
    for (const k of ['c1', 'c2', 'p1', 'p2', 'p3']) if (kv(L, k) !== base.props[k].v) t[k] = kv(L, k);
    const body = String(L.data.code || '').split('\n').map(s => '    ' + s).join('\n');
    return `code(function (ctx, e) {\n${body}\n  }, ${optStr({ ...t, ...o })})`;
  }
  if (L.type === 'spectrum') {
    const t = { mode: L.data.mode, source: L.data.source, bars: L.data.bars };
    for (const k of ['w', 'h', 'fill', 'fill2', 'gain', 'gap']) if (kv(L, k) !== base.props[k].v) t[k] = kv(L, k);
    return `spectrum(${optStr({ ...t, ...o })})`;
  }
  if (L.type === 'adjust') return `adjust(${optStr(o)})`;
  // تصویر، ویدیو، والد خالی … ← خام
  const raw = JSON.parse(JSON.stringify(L));
  delete raw.id; delete raw.t0; delete raw.t1;
  return `layer(${JSON.stringify(raw)}) /* ${L.type}: فایل رسانه داخل اسکریپت نمی‌رود */`;
}

/**
 * لایه‌ها ← متن اسکریپت
 * لایه‌هایی که «صحنه» دارند در همان صحنه می‌آیند؛ بقیه در یک صحنهٔ «لایه‌های دیگر».
 */
export function layersToScript(layers, { W = 1080, H = 1920, bpm = 120, title = '' } = {}) {
  const groups = new Map();
  const ordered = [...layers].filter(L => L.type !== 'null');
  for (const L of ordered) {
    const g = L.scene && L.scene !== 'گذار' && L.scene !== 'روی همه' ? L.scene : L.scene === 'گذار' ? '__tr' : L.scene === 'روی همه' ? '__ov' : '__other';
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push(L);
  }
  const lines = [
    `// موشن‌اسکریپت${title ? ' — ' + title : ''}`,
    `// ساخته‌شده از لایه‌های برنامه · قاب ${W}×${H}`,
    `// هر خط یک لایه است؛ عددها را عوض کنید و دوباره «اجرا» بزنید.`,
    `tempo(${r3(bpm)})`, '',
  ];
  const scenes = [...groups.entries()].filter(([g]) => !g.startsWith('__'))
    .map(([name, Ls]) => ({ name, Ls, t0: Math.min(...Ls.map(L => L.t0)), t1: Math.max(...Ls.map(L => L.t1)) }))
    .sort((a, b) => a.t0 - b.t0);
  for (const sc of scenes) {
    lines.push(`scene({ name: ${js(sc.name)}, at: ${r3(sc.t0)}, dur: ${r3(sc.t1 - sc.t0)} },`);
    lines.push(sc.Ls.map(L => '  ' + layerCall(L, sc.t0, W, H)).join(',\n') + ')');
    lines.push('');
  }
  const trs = groups.get('__tr') || [];
  if (trs.length) lines.push('// گذارها');
  for (const L of trs) {
    if (L.data?.el && ELEMENT_KINDS[L.data.el.kind]) {
      const o = commonOut(L, newLayer('code'), L.t0);
      delete o.from;
      lines.push(`transition('${L.data.el.kind}', ${optStr({ at: r3(L.t0), align: 'after', ...elementOpts(L, o, W, H) })})`);
    }
  }
  const other = groups.get('__other') || [];
  if (other.length) {
    const t0 = Math.min(...other.map(L => L.t0)), t1 = Math.max(...other.map(L => L.t1));
    lines.push('', `scene({ name: 'لایه‌های دیگر', at: ${r3(t0)}, dur: ${r3(t1 - t0)} },`);
    lines.push(other.map(L => '  ' + layerCall(L, t0, W, H)).join(',\n') + ')');
  }
  const ov = groups.get('__ov') || [];
  if (ov.length) {
    lines.push('', 'overlay(');
    lines.push(ov.reverse().map(L => '  ' + layerCall(L, L.t0, W, H)).join(',\n') + ')');
  }
  return lines.join('\n') + '\n';
}

/** راهنمای کوتاه برای نمایش در برنامه */
export const SCRIPT_HELP = [
  ['tempo(128)', 'سرعت آهنگ؛ beats(n) و bars(n) از روی آن حساب می‌شوند'],
  ["scene('نام', bars(1), …المان‌ها)", 'یک صحنه؛ صحنه‌ها پشت سر هم می‌آیند'],
  ["transition('wipe' | 'flash' | 'glitch' | 'iris')", 'گذار روی مرز صحنهٔ قبل و بعد'],
  ['overlay(…المان‌ها)', 'از اول تا آخر ویدیو، روی همه'],
  ["bg('#111')  یا  bg(['#123', '#000'])", 'زمینهٔ تخت یا گرادیان'],
  ["text('سلام', { size, color, font, style, enter, exit })", 'متن؛ style مثل neon یا slam'],
  ["shape('ring', { w, h, fill, stroke, strokeW })", 'شکل: rect ellipse polygon star ring line heart arrow cross'],
  [Object.keys(ELEMENT_KINDS).map(k => k + '()').join(' '), 'المان‌های آماده (همه با ضرب)'],
  ['code(function (ctx, e) { … })', 'کد دلخواه — مثل لایهٔ کد'],
  ['from, to, dur', 'زمان المان داخل صحنه (ثانیه)'],
  ['x, y, w, h, scale, rot, opacity', 'جا و اندازه (x و y پیکسل از وسط؛ W و H اندازهٔ قاب)'],
  ["enter: ['pop', 0.4]  exit  loop: 'beat'", 'حرکت ورود/خروج/تکرار'],
  ["fx: [['glow', { r: 20 }]]", 'افکت‌ها'],
  ['keys: { x: [[0, -500], [0.4, 0, \'outBack\']] }', 'کی‌فریم (زمان از شروع لایه)'],
];
