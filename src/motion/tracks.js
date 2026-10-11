import { easeFn } from './easing.js';

/**
 * ترک و کی‌فریم — قلب سیستم حرکت
 * ─────────────────────────────────────────────────────────────
 * هر ویژگی قابل‌انیمیشن (جای x، اندازه، چرخش، رنگ…) یک «ترک» است:
 *
 *   { v: 120 }                              مقدار ثابت، بدون حرکت
 *   { v: 120, k: [ {t:0, v:0,   e:'outBack'},
 *                  {t:1, v:300, e:'linear'} ] }   با کی‌فریم
 *   { v: 120, x: 'value + sin(time*3)*40' }       با عبارت (کد)
 *
 * t هر کی‌فریم نسبت به شروع لایه است (نه شروع آهنگ). پس اگر لایه
 * را روی تایم‌لاین جابه‌جا کنید، حرکتش هم همراهش می‌رود.
 *
 * e منحنی‌ای است که از این کی‌فریم تا کی‌فریم «بعدی» اعمال می‌شود.
 *
 * همهٔ توابع اینجا خالص‌اند: ورودی را می‌گیرند و خروجی می‌دهند؛
 * پس در Node هم تست می‌شوند.
 */

/** فاصلهٔ زمانی‌ای که دو کی‌فریم «یکی» حساب می‌شوند (نصف فریم ۶۰) */
export const KEY_EPS = 1 / 120;

/* ── رنگ ─────────────────────────────────────────────────────── */
const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
export const isColor = v => typeof v === 'string' && HEX.test(v);

export function parseColor(h) {
  h = h.slice(1);
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  const n = parseInt(h.slice(0, 6), 16);
  const a = h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, a];
}
export function toHex([r, g, b, a = 1]) {
  const c = v => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0');
  return '#' + c(r) + c(g) + c(b) + (a < 1 ? c(a * 255) : '');
}
export function mixColor(a, b, u) {
  const A = parseColor(a), B = parseColor(b);
  return toHex(A.map((v, i) => v + (B[i] - v) * u));
}

/* ── درون‌یابی ─────────────────────────────────────────────── */
/** مقدار بین دو کی‌فریم: عدد خطی، رنگ در RGB، بقیه پله‌ای */
export function interp(a, b, u) {
  if (typeof a === 'number' && typeof b === 'number') return a + (b - a) * u;
  if (isColor(a) && isColor(b)) return mixColor(a, b, Math.min(1, Math.max(0, u)));
  if (Array.isArray(a) && Array.isArray(b) && a.length === b.length) {
    return a.map((v, i) => interp(v, b[i], u));
  }
  return u < 1 ? a : b;
}

/** ایندکس آخرین کی‌فریمی که زمانش ≤ t است (یا -1) */
export function keyIndexBefore(keys, t) {
  let lo = 0, hi = keys.length - 1, res = -1;
  while (lo <= hi) {
    const m = (lo + hi) >> 1;
    if (keys[m].t <= t) { res = m; lo = m + 1; } else hi = m - 1;
  }
  return res;
}

/**
 * مقدار ترک در زمان محلی lt — بدون عبارت.
 * (عبارت‌ها در expr.js اعمال می‌شوند، چون به محیط صدا و زمان نیاز دارند.)
 */
export function sample(track, lt) {
  if (!track) return undefined;
  const k = track.k;
  if (!k || !k.length) return track.v;
  if (k.length === 1 || lt <= k[0].t) return k[0].v;
  const last = k[k.length - 1];
  if (lt >= last.t) return last.v;
  const i = keyIndexBefore(k, lt);
  const a = k[i], b = k[i + 1];
  const span = b.t - a.t;
  if (span <= 1e-9) return b.v;
  const u = easeFn(a.e || 'linear')((lt - a.t) / span);
  return interp(a.v, b.v, u);
}

/* ── ویرایش ─────────────────────────────────────────────────── */
export const hasKeys = tr => !!tr?.k?.length;

/** کی‌فریم دقیقاً در این لحظه (با تلورانس نصف فریم) */
export function keyAt(track, lt, eps = KEY_EPS) {
  return track?.k?.find(q => Math.abs(q.t - lt) <= eps) || null;
}

function sortKeys(track) { track.k.sort((a, b) => a.t - b.t); }

/** کی‌فریم بگذار یا مقدارش را به‌روز کن */
export function setKey(track, lt, v, e) {
  if (!track.k) track.k = [];
  lt = Math.max(0, +lt.toFixed(4));
  const hit = keyAt(track, lt);
  if (hit) { hit.v = v; if (e !== undefined) hit.e = e; return hit; }
  // منحنی پیش‌فرض: همان منحنی کی‌فریم قبلی، تا حس حرکت یکدست بماند
  const prev = track.k[keyIndexBefore(track.k, lt)];
  const key = { t: lt, v, e: e ?? prev?.e ?? 'inOutSine' };
  track.k.push(key);
  sortKeys(track);
  return key;
}

/** کی‌فریم این لحظه را حذف کن. اگر آخری بود، مقدار ثابت می‌شود. */
export function removeKey(track, lt) {
  if (!track?.k) return false;
  const hit = keyAt(track, lt);
  if (!hit) return false;
  track.k.splice(track.k.indexOf(hit), 1);
  if (!track.k.length) { track.v = hit.v; delete track.k; }
  return true;
}

/** ◆ — اگر کی‌فریم هست بردار، اگر نیست با مقدار فعلی بگذار */
export function toggleKey(track, lt) {
  if (keyAt(track, lt)) { removeKey(track, lt); return false; }
  setKey(track, lt, sample(track, lt));
  return true;
}

/**
 * مقدار تازه از رابط کاربری.
 * قانون Alight Motion: اگر ویژگی کی‌فریم دارد، تغییر دادنش خودکار در
 * همین لحظه کی‌فریم می‌گذارد؛ اگر ندارد، فقط مقدار ثابت عوض می‌شود.
 * با force=true (حالت ضبط ⏺) حتی بدون کی‌فریم قبلی هم کی‌فریم می‌سازد.
 */
export function setValue(track, lt, v, force = false) {
  if (hasKeys(track) || force) setKey(track, lt, v);
  else track.v = v;
}

/** کی‌فریم قبلی/بعدی نسبت به lt — برای دکمه‌های ◀ ▶ */
export function prevKeyTime(track, lt) {
  const k = track?.k; if (!k) return null;
  for (let i = k.length - 1; i >= 0; i--) if (k[i].t < lt - KEY_EPS) return k[i].t;
  return null;
}
export function nextKeyTime(track, lt) {
  const k = track?.k; if (!k) return null;
  for (const q of k) if (q.t > lt + KEY_EPS) return q.t;
  return null;
}

/** جابه‌جایی همهٔ کی‌فریم‌ها (مثلاً بعد از بریدن لایه) */
export function shiftKeys(track, dt) {
  if (!track?.k) return;
  for (const q of track.k) q.t = +(q.t + dt).toFixed(4);
}

/** کی‌فریم‌ها را به بازهٔ [0, len] محدود کن.
    کی‌فریم‌های بیرونی حذف می‌شوند، ولی اگر حرکتی از لبه رد می‌شد، روی
    لبه یک کی‌فریم با همان مقدار گذاشته می‌شود تا حرکت قطع نشود
    (قبلاً بعد از بریدن، مقدار ناگهان به کی‌فریم بعدی می‌پرید). */
export function trimKeys(track, len) {
  if (!track?.k) return;
  const v0 = sample(track, 0), v1 = sample(track, len);
  const before = track.k.filter(q => q.t < -KEY_EPS);
  const after = track.k.filter(q => q.t > len + KEY_EPS);
  const inside = track.k.filter(q => q.t >= -KEY_EPS && q.t <= len + KEY_EPS);
  if (before.length && !inside.some(q => Math.abs(q.t) <= KEY_EPS)) {
    inside.unshift({ t: 0, v: v0, e: before[before.length - 1].e });
  }
  if (after.length && !inside.some(q => Math.abs(q.t - len) <= KEY_EPS)) {
    const prev = inside[inside.length - 1];
    inside.push({ t: +len.toFixed(4), v: v1, e: prev?.e ?? 'linear' });
  }
  track.k = inside;
  if (!track.k.length) { track.v = v0 ?? v1; delete track.k; }
}

/** کپی عمیق و سبک یک ترک */
export const cloneTrack = tr => JSON.parse(JSON.stringify(tr));
