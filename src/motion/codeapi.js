import { EASINGS } from './easing.js';
import { noise } from './expr.js';
import { reelApi, envFromSong, envFromBeats } from '../engine/reelfx.js';
import { runImported } from './importers/runtime.js';

/**
 * جعبه‌ابزار «لایهٔ کد» — ساده برای تازه‌کارها
 * ─────────────────────────────────────────────────────────────
 * کد شما با دو ورودی اجرا می‌شود: ctx (بوم) و e (همه‌چیز این لحظه).
 * مبدأ مختصات (0,0) وسط لایه است؛ x به راست و y به پایین زیاد می‌شود.
 *
 * عمداً تابع‌های کوتاه و فارسی‌پسند ساختیم تا بدون دانستن Canvas هم
 * بشود چیز کشید:  e.circle(0, 0, 100, 'red')
 * و هر وقت آماده شدید، ctx خام هم در دسترس است.
 */

const hash = n => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453123; return x - Math.floor(x); };
const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);

/** کمک‌تابع‌های رسم که به یک ctx بسته شده‌اند */
export function drawHelpers(ctx, font = 'IRANSansX Black') {
  const fillWith = (color, alpha) => { ctx.globalAlpha = alpha; ctx.fillStyle = color; };
  const H = {
    /** دایرهٔ توپر به مرکز (x,y) */
    circle(x, y, r, color = '#F6F3EC', alpha = 1) {
      if (r <= 0) return;
      ctx.save(); fillWith(color, ctx.globalAlpha * alpha);
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    },
    /** حلقه (دایرهٔ توخالی) */
    ring(x, y, r, color = '#F6F3EC', width = 4, alpha = 1) {
      if (r <= 0) return;
      ctx.save(); ctx.globalAlpha *= alpha; ctx.strokeStyle = color; ctx.lineWidth = width;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
    },
    /** مستطیل به مرکز (x,y) — نه گوشهٔ بالا */
    box(x, y, w, h, color = '#F6F3EC', alpha = 1, radius = 0) {
      ctx.save(); fillWith(color, ctx.globalAlpha * alpha);
      ctx.beginPath();
      if (radius > 0 && ctx.roundRect) ctx.roundRect(x - w / 2, y - h / 2, w, h, radius);
      else ctx.rect(x - w / 2, y - h / 2, w, h);
      ctx.fill(); ctx.restore();
    },
    /** پاره‌خط */
    line(x1, y1, x2, y2, color = '#F6F3EC', width = 4, alpha = 1) {
      ctx.save(); ctx.globalAlpha *= alpha; ctx.strokeStyle = color; ctx.lineWidth = width;
      ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); ctx.restore();
    },
    /** متن فارسی وسط‌چین */
    text(str, x, y, size = 80, color = '#F6F3EC', alpha = 1) {
      ctx.save(); fillWith(color, ctx.globalAlpha * alpha);
      ctx.font = `${size}px "${font}"`; ctx.direction = 'rtl';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(String(str), x, y); ctx.restore();
    },
    /** چندضلعی منتظم */
    poly(x, y, r, sides = 6, color = '#F6F3EC', alpha = 1, rot = 0) {
      ctx.save(); fillWith(color, ctx.globalAlpha * alpha); ctx.beginPath();
      for (let i = 0; i < sides; i++) {
        const a = rot + (i / sides) * Math.PI * 2 - Math.PI / 2;
        ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
      }
      ctx.closePath(); ctx.fill(); ctx.restore();
    },
    /** ستاره با n پر */
    star(x, y, r, points = 5, color = '#F6F3EC', alpha = 1, inner = 0.45) {
      ctx.save(); fillWith(color, ctx.globalAlpha * alpha); ctx.beginPath();
      for (let i = 0; i < points * 2; i++) {
        const a = (i / (points * 2)) * Math.PI * 2 - Math.PI / 2;
        const rr = i % 2 ? r * inner : r;
        ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
      }
      ctx.closePath(); ctx.fill(); ctx.restore();
    },
    /** رنگ از سه عدد ۰..۲۵۵ */
    rgb: (r, g, b, a = 1) => `rgba(${r | 0},${g | 0},${b | 0},${a})`,
    /** رنگ از فام (۰..۳۶۰)، اشباع و روشنایی (۰..۱۰۰) */
    hsl: (h, s = 80, l = 55, a = 1) => `hsla(${h},${s}%,${l}%,${a})`,
  };
  return H;
}

/** ابزار ریاضی — همه تکرارپذیر (بدون Math.random) */
export const MATH = {
  lerp: (a, b, u) => a + (b - a) * u,
  clamp,
  map: (v, a, b, c, d) => (b === a ? c : c + (d - c) * ((v - a) / (b - a))),
  ease: (name, u) => (EASINGS[name] || EASINGS.linear)(clamp(u)),
  noise,
  random: seed => hash(seed * 1.37 + 0.5),
  sin: Math.sin, cos: Math.cos, abs: Math.abs, min: Math.min, max: Math.max,
  floor: Math.floor, round: Math.round, sqrt: Math.sqrt, pow: Math.pow,
  PI: Math.PI, TAU: Math.PI * 2,
};

/**
 * ساخت e برای یک فریم از لایهٔ کد
 * @param {object} o  { ctx, lt, time, dur, kick, rms, low, beat, pulse, W, H, P, acc, song, fx }
 */
export function codeEnv(o) {
  const time = o.time ?? o.lt;
  return {
    t: o.lt, time, p: clamp(o.lt / (o.dur || 1)), dur: o.dur,
    kick: o.kick || 0, rms: o.rms || 0, low: o.low || 0, beat: o.beat || 0, pulse: o.pulse || 0,
    W: o.W, H: o.H, w: o.P?.w ?? 800, h: o.P?.h ?? 800,
    c1: o.P?.c1 ?? '#E4142A', c2: o.P?.c2 ?? '#F6F3EC',
    p1: o.P?.p1 ?? 50, p2: o.P?.p2 ?? 50, p3: o.P?.p3 ?? 50,
    acc: o.acc || '#E4142A',
    song: o.song || null,
    lineText: o.lineText || '',
    every: (d = 1) => Math.floor(time / d) % 2 === 0,
    loop: (d = 1) => ((time % d) + d) % d,
    pingpong: (d = 1) => { const u = (time / d) % 2; return u < 1 ? u : 2 - u; },
    wiggle: (f = 1, a = 10, seed = 0) => noise(time * f + seed * 13.7) * a,
    ...MATH,
    ...drawHelpers(o.ctx),
    fx: o.fx || {},
    /* قطعه‌های شوریل: e.reel.vortex({...}) — مبدأ وسط لایه، اندازه = کادر لایه */
    get reel() { return reelLayer(o.ctx, o, time); },
    /* کد وارد‌شده (فایل JS/HTML بوم) — همان کد اصلی را در این لایه اجرا می‌کند */
    runImported,
  };
}
function reelLayer(ctx, o, time) {
  const w = o.P?.w ?? 800, h = o.P?.h ?? 800;
  const env = o.song ? envFromSong(o.song, time, w, h) : envFromBeats([], time, w, h);
  if (o.pulse != null && !o.song) env.pulse = o.pulse;
  const api = reelApi(ctx, env), out = {};
  for (const [k, fn] of Object.entries(api)) out[k] = (...a) => { ctx.save(); ctx.translate(-w / 2, -h / 2); try { fn(...a); } finally { ctx.restore(); } };
  return out;
}

const _cache = new Map();
/** کامپایل کد لایه — با کش */
export function compileCode(src) {
  const code = String(src || '');
  let c = _cache.get(code);
  if (c) return c;
  try {
    // eslint-disable-next-line no-new-func
    c = { fn: new Function('ctx', 'e', `"use strict";\n${code}`), error: null };
  } catch (err) {
    c = { fn: null, error: 'خطای نگارشی: ' + err.message };
  }
  if (_cache.size > 100) _cache.clear();
  _cache.set(code, c);
  return c;
}

export const CODE_LAYER_DEFAULT = `// لایهٔ کد: مبدأ (0,0) وسط لایه است.
// e.t زمان لایه، e.kick ضربهٔ آهنگ، e.c1 و e.c2 رنگ‌ها، e.p1 پارامتر ۱
const n = 12;                          // تعداد نقطه‌ها
for (let i = 0; i < n; i++) {
  const a = i / n * e.TAU + e.t;       // زاویهٔ هر نقطه، با زمان می‌چرخد
  const r = 220 + e.kick * 80;         // شعاع، با ضرب بزرگ می‌شود
  e.circle(e.cos(a) * r, e.sin(a) * r, 18 + e.p1 / 5, i % 2 ? e.c1 : e.c2);
}
`;

/** نمونه‌کدهای آماده برای لایهٔ کد — هرکدام یک ایدهٔ کامل و کوتاه */
export const CODE_SNIPPETS = {
  'شوریل: کهکشان ذرات': `// هزار ذره در یک گرداب؛ با هر ضرب به بیرون پرت می‌شوند
// p1 = تعداد، c1 و c2 = رنگ‌ها
e.reel.vortex({ n: 300 + e.p1 * 14, c1: e.c1, c2: e.c2, spin: 1 })`,
  'شوریل: انفجار ضربی': `// روی هر ضرب: انفجار ذره + موج ضربه + فلاش
e.reel.burst({ cx: e.w / 2, cy: e.h / 2, n: 30 + e.p1, c1: e.c1, c2: e.c2 })`,
  'شوریل: دگردیسی شکل‌ها': `// دایره ← مثلث ← مربع ← پنج‌ضلعی ← شش‌ضلعی ← ستاره، هر ضرب یکی
e.reel.morph({ c1: e.c1, c2: e.c2, r: Math.min(e.w, e.h) * 0.3 })`,
  'شوریل: بیست‌وجهی سیمی': `// جسم سه‌بعدی سیمی که می‌چرخد و روی ضرب می‌تپد
e.reel.wire({ c1: e.c1, c2: e.c2, shape: e.p1 > 50 ? 'cube' : 'ico' })`,
  'شوریل: پرواز در ستاره‌ها': `// وارپ: ستاره‌ها از وسط به بیرون می‌آیند، با ضرب تندتر
e.reel.starfield({ n: 200 + e.p1 * 8, c: e.c2, speed: 0.5 + e.p2 / 50 })`,
  'شوریل: زمین نئونی': `// خورشید راه‌راه + شهر اکولایزری + زمین شبکه‌ای متحرک
e.reel.grid3d({ c1: e.c1, c2: e.c2 })`,
  'شوریل: اکولایزر حلقه‌ای': `// میله‌های صدا دور یک دایره
e.reel.eqRing({ c1: e.c1, c2: e.c2, r: Math.min(e.w, e.h) * 0.3 })`,
  'شوریل: نوشتهٔ ذره‌ای': `// ذره‌ها جمع می‌شوند و نوشته را می‌سازند (نیمهٔ اول لایه)
e.reel.swarmText({ text: 'MOTION', k: e.ease('inOutCubic', e.p * 2), c1: e.c2, c2: e.c1, w: e.w * 0.9 })`,
  'شوریل: کلمهٔ کوبنده': `// کلمه از خیلی بزرگ می‌کوبد، می‌لرزد و خط سرعت می‌گیرد
e.reel.slamText({ text: 'حرکت', d: e.t, c: e.c2, c2: e.c1, size: e.h * 0.5 })`,
  'شوریل: گذار نوارهای رنگی': `// گذار: نوارهای مورب صفحه را می‌پوشانند و باز می‌کنند (لایه را تمام‌صفحه بگذارید)
e.reel.wipe(e.p, { cols: [e.c1, '#FFD447', '#18E0FF', '#0B0B12'] })`,
  'حلقه‌های ضربی': `// سه حلقه که با هر ضرب آهنگ بزرگ می‌شوند
for (let i = 0; i < 3; i++) {
  const r = 120 + i * 110 + e.kick * 90;
  e.ring(0, 0, r, e.c1, 6 - i * 1.5, 0.9 - i * 0.25);
}`,
  'ذرات بارانی': `// ۸۰ قطره که از بالا می‌بارند؛ random(i) برای هر قطره ثابت است
for (let i = 0; i < 80; i++) {
  const x = (e.random(i) - 0.5) * e.w;
  const speed = 200 + e.random(i + 100) * 400;
  const y = ((e.time * speed + e.random(i + 200) * e.h) % e.h) - e.h / 2;
  e.line(x, y, x, y + 30, e.c2, 3, 0.6);
}`,
  'موج سینوسی': `// نقطه‌هایی که روی یک موج حرکت می‌کنند
for (let i = 0; i < 40; i++) {
  const x = (i / 39 - 0.5) * e.w;
  const y = e.sin(i * 0.4 + e.t * 3) * (60 + e.kick * 80);
  e.circle(x, y, 10, e.hsl(i * 9 + e.t * 60));
}`,
  'ساعت شمارنده': `// شمارش معکوس از ۱۰
const left = Math.max(0, 10 - e.t);
e.text(Math.ceil(left), 0, 0, 260, e.c2);
e.ring(0, 0, 220, e.c1, 10, 0.3);
// کمان پیشرفت
ctx.strokeStyle = e.c1; ctx.lineWidth = 14; ctx.lineCap = 'round';
ctx.beginPath(); ctx.arc(0, 0, 220, -e.PI / 2, -e.PI / 2 + e.TAU * (left % 1)); ctx.stroke();`,
  'شبکهٔ نقطه‌ها': `// شبکهٔ ۹×۹ که از وسط موج برمی‌دارد
for (let r = -4; r <= 4; r++) {
  for (let c = -4; c <= 4; c++) {
    const d = Math.hypot(r, c);
    const s = 8 + 8 * e.sin(d - e.t * 4) + e.kick * 10;
    e.circle(c * 70, r * 70, Math.max(1, s), d < 2 ? e.c1 : e.c2);
  }
}`,
  'ستاره‌های چرخان': `// پنج ستاره که دور مرکز می‌چرخند
for (let i = 0; i < 5; i++) {
  const a = e.t * 0.8 + i / 5 * e.TAU;
  ctx.save();
  ctx.translate(e.cos(a) * 260, e.sin(a) * 260);
  ctx.rotate(e.t * 2);
  e.star(0, 0, 50 + e.kick * 30, 5, i % 2 ? e.c1 : e.c2);
  ctx.restore();
}`,
  'متن شعر فعلی': `// خط شعری که الان خوانده می‌شود، با تپش ضرب
const s = 1 + e.kick * 0.2;
ctx.scale(s, s);
e.text(e.lineText || '…', 0, 0, 90, e.c2);`,
  'کانفتی': `// کاغذرنگی‌های رنگارنگ که می‌چرخند و می‌افتند
for (let i = 0; i < 70; i++) {
  const speed = 120 + e.random(i + 50) * 160;
  const x = (e.random(i) - 0.5) * e.w + e.sin(e.t * 2 + i) * 30;
  const y = ((e.time * speed + e.random(i + 9) * e.h) % e.h) - e.h / 2;
  ctx.save(); ctx.translate(x, y); ctx.rotate(e.t * 3 + i);
  e.box(0, 0, 18, 10, e.hsl(e.random(i + 3) * 360), 1, 2);
  ctx.restore();
}`,
  'برف': `// دانه‌های برف نرم که آرام پایین می‌آیند و تاب می‌خورند
for (let i = 0; i < 90; i++) {
  const speed = 40 + e.random(i + 7) * 90;
  const x = (e.random(i) - 0.5) * e.w + e.sin(e.t + i) * 25;
  const y = ((e.time * speed + e.random(i + 3) * e.h) % e.h) - e.h / 2;
  e.circle(x, y, 2 + e.random(i + 11) * 6, e.c2, 0.35 + e.random(i + 13) * 0.6);
}`,
  'حباب': `// حباب‌هایی که از پایین بالا می‌روند
for (let i = 0; i < 30; i++) {
  const speed = 60 + e.random(i + 5) * 120;
  const x = (e.random(i) - 0.5) * e.w + e.sin(e.t * 1.5 + i) * 20;
  const y = e.h / 2 - ((e.time * speed + e.random(i + 8) * e.h) % e.h);
  e.ring(x, y, 10 + e.random(i + 2) * 30, e.c2, 3, 0.6);
}`,
  'ستاره‌های چشمک‌زن': `// آسمان پرستاره که چشمک می‌زند
for (let i = 0; i < 70; i++) {
  const x = (e.random(i) - 0.5) * e.w, y = (e.random(i + 70) - 0.5) * e.h;
  const s = 1.5 + 4 * (0.5 + 0.5 * e.sin(e.t * 3 + i * 7));
  e.circle(x, y, s, i % 9 ? e.c2 : e.c1, 0.9);
}`,
  'نوار پیشرفت': `// نواری که در طول لایه پر می‌شود
e.box(0, 0, e.w, 14, e.c2, 0.25, 7);
e.box(-e.w / 2 + (e.w * e.p) / 2, 0, e.w * e.p, 14, e.c1, 1, 7);
e.circle(-e.w / 2 + e.w * e.p, 0, 14 + e.kick * 8, e.c1);`,
  'اکولایزر دایره‌ای': `// میله‌هایی دور یک دایره که با بلندی صدا بلند می‌شوند
const n = 60;
for (let i = 0; i < n; i++) {
  const a = i / n * e.TAU;
  const len = 30 + e.rms * 160 * (0.5 + 0.5 * e.noise(i * 0.7 + e.t * 2));
  ctx.save(); ctx.rotate(a);
  e.box(0, -220 - len / 2, 10, len, i % 2 ? e.c1 : e.c2, 1, 4);
  ctx.restore();
}`,
};
