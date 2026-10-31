import { shiftKeys, trimKeys, KEY_EPS, sample } from './tracks.js';
import { uid } from './schema.js';

/**
 * عملیات روی لایه‌ها — بریدن، تکثیر، کوتاه کردن، جابه‌جایی کی‌فریم
 * همه روی دادهٔ خام کار می‌کنند و به رابط کاربری وابسته نیستند.
 */

/** همهٔ ترک‌های یک لایه (ویژگی‌ها + پارامترهای افکت) */
export function* tracksOf(L) {
  for (const tr of Object.values(L.props || {})) yield tr;
  for (const fx of L.effects || []) for (const tr of Object.values(fx.p || {})) yield tr;
}

/** زمان همهٔ کی‌فریم‌های لایه (محلی، یکتا، مرتب) */
export function allKeyTimes(L) {
  const out = [];
  for (const tr of tracksOf(L)) {
    for (const q of tr.k || []) if (!out.some(x => Math.abs(x - q.t) <= KEY_EPS)) out.push(q.t);
  }
  return out.sort((a, b) => a - b);
}

/** همهٔ کی‌فریم‌های لحظهٔ from را به لحظهٔ to ببر */
export function moveKeyTime(L, from, to) {
  const dur = L.t1 - L.t0;
  to = Math.max(0, Math.min(dur, +to.toFixed(4)));
  for (const tr of tracksOf(L)) {
    if (!tr.k) continue;
    for (const q of tr.k) if (Math.abs(q.t - from) <= KEY_EPS) q.t = to;
    tr.k.sort((a, b) => a.t - b.t);
  }
  return to;
}

/** همهٔ کی‌فریم‌های یک لحظه را حذف کن */
export function deleteKeysAt(L, lt) {
  for (const tr of tracksOf(L)) {
    if (!tr.k) continue;
    const hit = tr.k.find(q => Math.abs(q.t - lt) <= KEY_EPS);
    if (!hit) continue;
    tr.k.splice(tr.k.indexOf(hit), 1);
    if (!tr.k.length) { tr.v = hit.v; delete tr.k; }
  }
}

/** منحنی همهٔ کی‌فریم‌های یک لحظه را عوض کن */
export function setEaseAt(L, lt, e) {
  for (const tr of tracksOf(L)) for (const q of tr.k || []) if (Math.abs(q.t - lt) <= KEY_EPS) q.e = e;
}

/**
 * شروع لایه را عوض کن ولی حرکت را سر جای «مطلق» خودش نگه دار
 * (مثل کوتاه کردن کلیپ در CapCut: محتوا جابه‌جا نمی‌شود، فقط بریده می‌شود).
 */
export function trimStart(L, newT0) {
  newT0 = Math.max(0, Math.min(L.t1 - 0.1, +newT0.toFixed(2)));
  const dt = newT0 - L.t0;
  if (!dt) return;
  for (const tr of tracksOf(L)) {
    if (!tr.k) continue;
    shiftKeys(tr, -dt);
    // جلو آمدن شروع: کی‌فریم‌های قبل از صفر بریده می‌شوند (با حفظ مقدار لبه)
    if (dt > 0) trimKeys(tr, (L.t1 - newT0));
  }
  if (L.type === 'video') {
    // trimOut مطلقِ منبع است، پس با جلو آمدن شروع تغییر نمی‌کند؛
    // فقط نگذار trimIn از trimOut جلو بزند.
    const ni = Math.max(0, (L.data.trimIn || 0) + dt * (L.data.speed || 1));
    if (L.data.trimOut != null && ni >= L.data.trimOut) L.data.trimOut = ni + 0.05;
    L.data.trimIn = ni;
  }
  L.t0 = newT0;
}

/** پایان لایه را عوض کن؛ کی‌فریم‌های بیرون از بازه حذف می‌شوند.
 *  برای ویدیوی بدون تکرار، پایان تایم‌لاین = trimOut منبع می‌شود،
 *  تا بریدن (split) دو تکهٔ دقیق از یک پنجرهٔ منبع بسازد. */
export function trimEnd(L, newT1) {
  L.t1 = Math.max(L.t0 + 0.1, +newT1.toFixed(2));
  for (const tr of tracksOf(L)) trimKeys(tr, L.t1 - L.t0);
  if (L.type === 'video' && L.data.loop === false) {
    L.data.trimOut = +((L.data.trimIn || 0) + (L.t1 - L.t0) * (L.data.speed || 1)).toFixed(2);
  }
}

/** کپی کامل با شناسهٔ تازه */
export function duplicate(L, shiftT = 0) {
  const n = JSON.parse(JSON.stringify(L));
  n.id = uid('ly');
  n.name = L.name + ' ۲';
  for (const fx of n.effects) fx.id = uid('fx');
  n.t0 = +(n.t0 + shiftT).toFixed(2);
  n.t1 = +(n.t1 + shiftT).toFixed(2);
  return n;
}

/** بریدن لایه در لحظهٔ t ← [قبل، بعد] */
export function split(L, t) {
  if (t <= L.t0 + 0.05 || t >= L.t1 - 0.05) return null;
  const b = duplicate(L);
  b.name = L.name;
  trimStart(b, t);
  trimEnd(L, t);
  // ورود برای تکهٔ دوم و خروج برای تکهٔ اول معنا ندارد
  b.anim.in = { ...b.anim.in, id: 'none' };
  L.anim.out = { ...L.anim.out, id: 'none' };
  return b;
}
