/**
 * صدای لایه‌ها به سبک Alight Motion — منطق خالص، بدون DOM
 * ─────────────────────────────────────────────────────────────
 * لایهٔ صوتی (audio) و صدای ویدیو (video.sound) هر دو با همین
 * حساب‌ها کار می‌کنند: پنجرهٔ منبع [trimIn, trimOut)، تکرار،
 * بلندی صدا و محوِ شروع/پایان. چون خالص است، تست Node هم
 * می‌تواند آن را بررسی کند و پیش‌نمایش و خروجی یک حساب را
 * به کار می‌برند (پیش‌نمایش با عنصر <audio>/<video>، خروجی
 * با OfflineAudioContext).
 */

/** پنجرهٔ منبع بر حسب ثانیهٔ فایل؛ trimOut برابر null یعنی تا انتهای فایل */
export function sourceWindow(L, dur) {
  const start = Math.max(0, L.data?.trimIn || 0);
  let end = L.data?.trimOut;
  if (end == null || !(end > start)) end = dur > 0 ? dur : start + 1e9;
  return [start, Math.max(start + 0.01, end)];
}

/** زمانی از فایل که در زمان محلی lt باید پخش شود (مثل MediaPool.mediaTime) */
export function mediaTime(L, lt, dur) {
  const sp = L.data?.speed || 1;
  const [start, end] = sourceWindow(L, dur);
  const win = end - start;
  let mt;
  if (L.data?.loop !== false) mt = start + (((lt * sp) % win) + win) % win;
  else mt = Math.min(start + lt * sp, end - 0.04);
  return Math.max(start, mt);
}

/**
 * بهرهٔ نهایی صدا در زمان محلی lt (۰..~۲):
 * بلندی لایه × محو شروع × محو پایان. برای ویدیو، vol از
 * ویژگی vol می‌آید؛ برای لایهٔ صوتی هم همین کلید است.
 */
export function audioGain(L, lt, volProp) {
  const dur = Math.max(0, (L.t1 || 0) - (L.t0 || 0));
  const vol = volProp != null ? volProp : (L.props?.vol?.v ?? 100);
  let g = Math.max(0, vol) / 100;
  const fi = Math.max(0, L.data?.fadeIn || 0), fo = Math.max(0, L.data?.fadeOut || 0);
  if (fi > 0) g *= Math.min(1, Math.max(0, lt) / fi);
  if (fo > 0) g *= Math.min(1, Math.max(0, dur - lt) / fo);
  return g;
}

/** آیا این لایه در خروجی صدا دارد؟ (صوتی، یا ویدیوی با sound روشن) */
export function hasLayerAudio(L) {
  if (!L || L.visible === false) return false;
  if (L.type === 'audio') return !!L.data?.media;
  if (L.type === 'video') return !!L.data?.sound && !!L.data?.media;
  return false;
}
