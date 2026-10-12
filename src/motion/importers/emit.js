/**
 * مدل میانی ← متن موشن‌اسکریپت
 * ─────────────────────────────────────────────────────────────
 * مبدلّ‌ها (MoviePy، Manim، …) همه یک «مدل» ساده می‌سازند:
 *   { W0, H0, duration, title, source, scenes:[{name,t0,t1}], items:[…], notes:[] }
 * هر item زمان مطلق (t0,t1) دارد و مختصات x,y پیکسل «از وسط قاب اصلی».
 * خروجی اسکریپت با قاب پروژه مقیاس می‌گیرد (SX، SY، S).
 */
const r3 = v => +(+v).toFixed(3);
const str = v => `'${String(v).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n')}'`;
const num = (v, k) => {                     // عدد با مقیاس
  if (v == null || !isFinite(v)) return null;
  const n = r3(v);
  if (k === 'x') return n === 0 ? '0' : `${n} * SX`;
  if (k === 'y') return n === 0 ? '0' : `${n} * SY`;
  if (k === 'w' || k === 'h') return n === 0 ? '0' : `${n} * S`;   // اندازه‌ها یکنواخت تا دایره بیضی نشود
  if (k === 's') return `${n} * S`;
  return String(n);
};
const val = (v, k) => (typeof v === 'string' ? str(v) : typeof v === 'number' ? num(v, k) : Array.isArray(v) ? `[${v.map(x => val(x, k)).join(', ')}]` : v == null ? 'null' : typeof v === 'object' && v.__code ? v.__code : JSON.stringify(v));
const SCALE_OF = { x: 'x', y: 'y', w: 'w', h: 'h', size: 's', strokeW: 's', radius: 's', spacing: 's' };

function optsStr(o) {
  const parts = [];
  for (const [k, v] of Object.entries(o)) {
    if (v === undefined || v === null || (typeof v === 'number' && !isFinite(v))) continue;
    if (k === 'keys') {
      const ks = Object.entries(v).filter(([, a]) => a && a.length);
      if (!ks.length) continue;
      parts.push(`keys: { ${ks.map(([p, a]) => `${p}: [${a.map(([t, x, e]) => `[${r3(t)}, ${val(x, SCALE_OF[p])}${e ? ', ' + str(e) : ''}]`).join(', ')}]`).join(', ')} }`);
      continue;
    }
    if (k === 'enter' || k === 'exit' || k === 'loop') { parts.push(`${k}: [${str(v[0])}, ${r3(v[1])}]`); continue; }
    if (k === 'fx') { parts.push(`fx: ${JSON.stringify(v)}`); continue; }
    parts.push(`${/^[A-Za-z_$][\w$]*$/.test(k) ? k : str(k)}: ${val(v, SCALE_OF[k])}`);
  }
  return parts.length ? `{ ${parts.join(', ')} }` : '';
}

/** کی‌فریم‌ها (زمان مطلق) ← نسبی به شروع لایه؛ حذف تکراری‌ها */
function relKeys(keys, t0, dur) {
  const out = {};
  for (const [p, arr] of Object.entries(keys || {})) {
    if (!arr || arr.length < 2) continue;
    const a = arr.map(([t, v, e]) => [Math.max(0, Math.min(dur, t - t0)), v, e]).sort((x, y) => x[0] - y[0]);
    const same = a.every(x => JSON.stringify(x[1]) === JSON.stringify(a[0][1]));
    if (same) continue;
    // حذف نقطه‌های میانیِ خطی
    const q = [a[0]];
    for (let i = 1; i < a.length; i++) {
      const prev = q[q.length - 1];
      if (Math.abs(a[i][0] - prev[0]) < 1e-4) { q[q.length - 1] = a[i]; continue; }
      q.push(a[i]);
    }
    // حذف نقطه‌های هم‌راستا (کلیدهای نمونه‌برداری‌شده از تابع)
    const lin = e => e == null || e === 'linear';
    if (q.every(x => typeof x[1] === 'number')) {
      const rng = Math.max(1e-6, ...q.map(x => Math.abs(x[1])));
      for (let i = 1; i < q.length - 1;) {
        const A = q[i - 1], B = q[i], C = q[i + 1];
        const u = (B[0] - A[0]) / Math.max(1e-6, C[0] - A[0]), v = A[1] + (C[1] - A[1]) * u;
        if (lin(A[2]) && lin(B[2]) && Math.abs(v - B[1]) <= rng * 0.004) q.splice(i, 1); else i++;
      }
    }
    out[p] = q;
  }
  return out;
}

function itemCall(it, sceneT0) {
  const from = r3(Math.max(0, it.t0 - sceneT0)), dur = r3(Math.max(0.05, it.t1 - it.t0));
  const o = {};
  const common = () => {
    if (from > 0.0005) o.from = from;
    o.dur = dur;
    if (it.x != null && Math.abs(it.x) > 0.5) o.x = it.x;
    if (it.y != null && Math.abs(it.y) > 0.5) o.y = it.y;
    if (it.rot) o.rot = r3(it.rot);
    if (it.scale != null && Math.abs(it.scale - 1) > 1e-3) o.scale = r3(it.scale);
    if (it.opacity != null && it.opacity < 0.999) o.opacity = r3(it.opacity);
    if (it.blend) o.blend = it.blend;
    if (it.enter) o.enter = it.enter;
    if (it.exit) o.exit = it.exit;
    if (it.loop) o.loop = it.loop;
    if (it.fx) o.fx = it.fx;
    const ks = relKeys(it.keys, it.t0, it.t1 - it.t0);
    if (ks.sc) ks.sc = ks.sc.map(([t, v, e]) => [t, v > 4 ? v : v, e]);
    if (Object.keys(ks).length) o.keys = ks;
    if (it.name && !(it.type === 'text' && it.name === it.str)) o.name = it.name;
  };
  switch (it.type) {
    case 'bg': { common(); delete o.x; delete o.y; return `bg(${val(it.c)}${optsStr(o) ? ', ' + optsStr(o) : ''})`; }
    case 'text': {
      const t = { size: it.size, color: it.color, font: it.font, spacing: it.spacing, stroke: it.stroke, strokeW: it.strokeW, bg: it.bg, align: it.align };
      Object.assign(o, t); common();
      return `text(${str(it.str)}, ${optsStr(o)})`;
    }
    case 'shape': {
      Object.assign(o, { w: it.w, h: it.h, fill: it.fill, stroke: it.stroke, strokeW: it.strokeW, radius: it.radius, sides: it.sides, inner: it.inner, trimS: it.trimS, trimE: it.trimE });
      if (it.fillOn === false) o.fillOn = false;
      common();
      return `shape(${str(it.kind || 'rect')}, ${optsStr(o)})`;
    }
    case 'el': { Object.assign(o, it.p || {}); common(); return `${it.kind}(${optsStr(o)})`; }
    case 'adjust': { common(); return `adjust(${optsStr(o)})`; }
    case 'code': {
      Object.assign(o, { w: it.w, h: it.h, p1: it.p1 }); common();
      const src = /[`$\\]/.test(it.src) ? str(it.src) : '`\n' + it.src.split('\n').map(l => '    ' + l).join('\n') + '\n  `';
      return `code(${src}, ${optsStr(o)})`;
    }
    default: return null;
  }
}

/**
 * @param {object} model
 * @returns {string} متن موشن‌اسکریپت
 */
export function emitScript(model) {
  const W0 = model.W0 || 1920, H0 = model.H0 || 1080;
  const dur = model.duration || Math.max(1, ...model.items.map(i => i.t1 || 0));
  let scenes = (model.scenes || []).filter(s => s.t1 - s.t0 > 0.01).sort((a, b) => a.t0 - b.t0);
  if (!scenes.length) scenes = [{ name: model.title || 'ویدیو', t0: 0, t1: dur }];
  const L = [
    `// 🧩 وارد‌شده از «${model.source || 'کد'}»${model.kindLabel ? ' — ' + model.kindLabel : ''}`,
    `// ${scenes.length} صحنه · ${model.items.length} جزء · ${r3(dur)} ثانیه · قاب اصلی ${W0}×${H0}`,
    '// هر خط یک لایه است؛ عددها، رنگ‌ها و متن‌ها را عوض کنید و «▶ اجرا» بزنید.',
  ];
  for (const n of model.notes || []) L.push('// ⚠ ' + n);
  if (model.tempo) L.push(`tempo(${r3(model.tempo)})`);
  L.push(`const W0 = ${W0}, H0 = ${H0}`);
  L.push('const SX = W / W0, SY = H / H0, S = Math.min(SX, SY)   // مقیاس با قاب پروژه');
  L.push('');
  // جای هر جزء: اولین صحنه‌ای که شروعش داخل آن است
  const bucket = scenes.map(() => []);
  const sorted = model.items.map((it, i) => ({ it, i })).sort((a, b) => (a.it.z ?? 0) - (b.it.z ?? 0) || a.i - b.i);
  const overlays = [];
  for (const { it } of sorted) {
    if (it.overlay) { overlays.push(it); continue; }
    let k = scenes.findIndex(s => it.t0 >= s.t0 - 1e-6 && it.t0 < s.t1 - 1e-6);
    if (k < 0) k = it.t0 < scenes[0].t0 ? 0 : scenes.length - 1;
    bucket[k].push(it);
  }
  scenes.forEach((sc, k) => {
    const lines = bucket[k].map(it => itemCall(it, sc.t0)).filter(Boolean);
    if (sc.comment) L.push(`// ${sc.comment}`);
    L.push(`scene({ name: ${str(sc.name)}, at: ${r3(sc.t0)}, dur: ${r3(sc.t1 - sc.t0)} }${lines.length ? ',' : ')'}`);
    if (lines.length) L.push(lines.map(s => '  ' + s).join(',\n') + ')');
    L.push('');
  });
  for (const tr of model.transitions || []) L.push(`transition(${str(tr.kind)}, ${optsStr({ at: tr.at, align: 'after', dur: tr.dur, ...(tr.p || {}) })})`);
  if (overlays.length) { L.push('overlay('); L.push(overlays.map(it => '  ' + itemCall(it, 0)).join(',\n') + ')'); }
  return L.join('\n') + '\n';
}

/* ── ابزار رنگ مشترک ── */
const NAMED = { white: '#FFFFFF', black: '#000000', red: '#FF0000', green: '#00FF00', blue: '#0000FF', yellow: '#FFFF00', cyan: '#00FFFF', magenta: '#FF00FF', orange: '#FFA500', purple: '#800080', pink: '#FFC0CB', gray: '#808080', grey: '#808080', gold: '#FFD700', navy: '#000080', teal: '#008080', maroon: '#800000', lime: '#00FF00', silver: '#C0C0C0', brown: '#A52A2A', violet: '#EE82EE', transparent: '#00000000', darkblue: '#00008B', darkred: '#8B0000', lightblue: '#ADD8E6', lightgray: '#D3D3D3', lightgrey: '#D3D3D3', darkgray: '#A9A9A9', darkgrey: '#A9A9A9' };
const hx = n => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0').toUpperCase();
/** رنگ پایتونی (نام، #hex، (r,g,b) یا (r,g,b,a)، ۰..۱ یا ۰..۲۵۵) ← #RRGGBB */
export function toHex(c, def = '#FFFFFF', unit = 'auto') {
  if (c == null) return def;
  if (typeof c === 'string') {
    const s = c.trim();
    if (/^#[0-9a-f]{3}$/i.test(s)) return '#' + [...s.slice(1)].map(x => x + x).join('').toUpperCase();
    if (/^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(s)) return s.toUpperCase();
    if (/^(0x)?[0-9a-f]{6}$/i.test(s)) return '#' + s.replace(/^0x/i, '').toUpperCase();
    const k = s.toLowerCase().replace(/[\s_-]/g, '');
    if (NAMED[k]) return NAMED[k];
    const m = /rgba?\(([^)]+)\)/i.exec(s);
    if (m) { const [r, g, b] = m[1].split(',').map(Number); return '#' + hx(r) + hx(g) + hx(b); }
    return def;
  }
  if (Array.isArray(c) && c.length >= 3) {
    const v = c.map(Number);
    const f = unit === '1' || (unit === 'auto' && v.slice(0, 3).every(x => x <= 1) && v.slice(0, 3).some(x => !Number.isInteger(x)));
    const k = f ? 255 : 1;
    let out = '#' + hx(v[0] * k) + hx(v[1] * k) + hx(v[2] * k);
    if (v.length >= 4 && v[3] < (f ? 1 : 255)) out += hx(v[3] * (f ? 255 : 1));
    return out;
  }
  return def;
}
