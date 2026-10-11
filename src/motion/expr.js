import { EASINGS } from './easing.js';
import { sample } from './tracks.js';

/**
 * عبارت‌ها (Expression) — یک خط کد برای هر ویژگی
 * ─────────────────────────────────────────────────────────────
 * به‌جای کی‌فریم، می‌شود مقدار یک ویژگی را با فرمول ساخت:
 *
 *     value + sin(time * 3) * 40     ← نوسان دور مقدار کی‌فریم‌ها
 *     value * (1 + kick * 0.3)       ← تپیدن روی ضرب آهنگ
 *     wiggle(2, 25)                  ← لرزش تصادفی نرم
 *
 * عبارت می‌تواند یک عبارت ساده باشد (بدون return) یا چند خط با
 * return. اگر خطا داشت، مقدار کی‌فریم‌ها بدون تغییر استفاده می‌شود
 * و پیام خطا برای نمایش نگه داشته می‌شود.
 */

/** همهٔ نام‌هایی که داخل عبارت در دسترس‌اند (به ترتیب ورودی تابع) */
export const EXPR_VARS = [
  'value', 't', 'time', 'p', 'dur', 'kick', 'rms', 'low', 'beat', 'pulse', 'index',
  'sin', 'cos', 'tan', 'abs', 'min', 'max', 'floor', 'round', 'sqrt', 'pow', 'PI',
  'clamp', 'lerp', 'map', 'noise', 'random', 'wiggle', 'loop', 'pingpong', 'step',
  'ease', 'every', 'key', 'W', 'H',
];

/** راهنمای کوتاه — در پنل عبارت نمایش داده می‌شود */
export const EXPR_HELP = [
  ['value', 'مقدار کی‌فریم‌ها در همین لحظه'],
  ['t', 'زمان از شروع لایه (ثانیه)'],
  ['time', 'زمان از شروع آهنگ'],
  ['p', 'پیشرفت لایه از ۰ تا ۱'],
  ['kick', 'ضربهٔ آهنگ، ۰ تا ۱'],
  ['rms', 'بلندی صدا، ۰ تا ۱'],
  ['beat', 'شمارهٔ ضرب فعلی'],
  ['wiggle(f, a)', 'لرزش نرم: f بار در ثانیه، به اندازهٔ a'],
  ['loop(d)', 'زمان تکرارشونده هر d ثانیه'],
  ['noise(x)', 'نویز نرم بین ۱- و ۱'],
  ['random(seed)', 'عدد تصادفی ثابت بین ۰ و ۱'],
  ['map(v,a,b,c,d)', 'نگاشت v از بازهٔ a..b به c..d'],
];

export const EXPR_EXAMPLES = [
  ['تپش روی ضرب', 'value * (1 + kick * 0.35)'],
  ['نوسان', 'value + sin(time * 3) * 40'],
  ['لرزش', 'value + wiggle(3, 20)'],
  ['چرخش پیوسته', 'value + time * 90'],
  ['چشمک', 'every(0.5) ? 100 : 20'],
  ['با بلندی صدا', 'value + rms * 200'],
  ['رفت و برگشت', 'lerp(-200, 200, pingpong(2))'],
];

/* ── ابزار ریاضی تکرارپذیر (بدون Math.random) ─────────────────── */
function hash(n) {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453123;
  return x - Math.floor(x);
}
export function noise(x) {
  const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f);
  return (hash(i) + (hash(i + 1) - hash(i)) * u) * 2 - 1;
}
const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, u) => a + (b - a) * u;
const map = (v, a, b, c, d) => (b === a ? c : c + (d - c) * ((v - a) / (b - a)));

const _cache = new Map();

/**
 * کامپایل یک عبارت. نتیجه کش می‌شود، چون هر فریم صدها بار صدا زده
 * می‌شود و new Function گران است.
 * @returns {{fn: Function|null, error: string|null}}
 */
export function compileExpr(src) {
  const code = String(src || '').trim();
  if (!code) return { fn: null, error: null };
  let c = _cache.get(code);
  if (c) return c;
  const body = /\breturn\b/.test(code) ? code : `return (${code});`;
  try {
    // eslint-disable-next-line no-new-func
    c = { fn: new Function(...EXPR_VARS, `"use strict";\n${body}`), error: null };
  } catch (err) {
    c = { fn: null, error: 'خطای نگارشی: ' + err.message };
  }
  if (_cache.size > 400) _cache.clear();
  _cache.set(code, c);
  return c;
}

/** خطاهای اجرایی آخرین فریم، برای نشان دادن کنار ویژگی */
export const exprErrors = new Map();

/**
 * مقدار نهایی ترک: کی‌فریم‌ها، سپس عبارت.
 * @param {object} tr   ترک
 * @param {number} lt   زمان محلی لایه
 * @param {object} env  { time, dur, kick, rms, low, beat, pulse, index, W, H }
 * @param {string} tag  شناسه برای ثبت خطا (layerId.prop)
 */
export function evalTrack(tr, lt, env, tag = '') {
  const value = sample(tr, lt);
  if (!tr?.x) return value;
  const { fn, error } = compileExpr(tr.x);
  if (!fn) { if (error) exprErrors.set(tag, error); return value; }

  const time = env.time ?? lt;
  const dur = env.dur || 1;
  const wiggle = (f = 1, a = 10, oct = 1) => {
    let s = 0, amp = 1, fr = f, norm = 0;
    for (let i = 0; i < Math.max(1, oct); i++) {
      s += noise(time * fr + (env.index || 0) * 17.3 + i * 31.7) * amp;
      norm += amp; amp *= 0.5; fr *= 2;
    }
    return (s / norm) * a;
  };
  try {
    const out = fn(
      value, lt, time, clamp(lt / dur), dur,
      env.kick || 0, env.rms || 0, env.low || 0, env.beat || 0, env.pulse || 0, env.index || 0,
      Math.sin, Math.cos, Math.tan, Math.abs, Math.min, Math.max, Math.floor, Math.round,
      Math.sqrt, Math.pow, Math.PI,
      clamp, lerp, map, noise, s => hash(s * 1.37 + 0.5),
      wiggle,
      (d = 1) => ((time % d) + d) % d,                           // loop
      (d = 1) => { const u = (time / d) % 2; return u < 1 ? u : 2 - u; }, // pingpong
      (edge, x = time) => (x >= edge ? 1 : 0),                   // step
      (name, u) => (EASINGS[name] || EASINGS.linear)(clamp(u)),  // ease
      (d = 1) => Math.floor(time / d) % 2 === 0,                 // every
      i => tr.k?.[i]?.v ?? value,                                // key
      env.W || 1920, env.H || 1080,
    );
    exprErrors.delete(tag);
    if (typeof value === 'number') return Number.isFinite(out) ? out : value;
    return out ?? value;
  } catch (err) {
    exprErrors.set(tag, String(err?.message || err));
    return value;
  }
}
