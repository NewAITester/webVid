/**
 * پریست‌های خروجی به سبک Alight Motion — یک انتخاب، همهٔ تنظیم‌ها.
 * ─────────────────────────────────────────────────────────────
 * تا پیش از فاز ۵، خروجی WebCodecs را باید دستی چید: رزولوشن، فریم
 * و بیت‌ریت جدا جدا. این پریست‌ها همان سه‌تا را با هم می‌گذارند و
 * ابعاد را مثل main.js از نسبت پروژه می‌گیرند: عدد رزولوشن، ضلع
 * کوچک‌تر است (در قاب افقی یعنی ارتفاع، در قاب عمودی یعنی عرض) و
 * ابعاد زوج می‌شوند تا انکودر رد نکند. بیت‌ریت هم همان فرمول
 * autoBitrate در main.js است (با پیکسل مقیاس می‌خورد).
 *
 * خالص است و در Node تست می‌شود؛ ظرف همیشه mp4 است چون خروجی
 * WebCodecs با mp4-muxer ساخته می‌شود (گیف/MP3 و… در پنل FFmpeg
 * با RECIPES خودش هست و دست نخورده).
 */

/** پریست‌ها: id، برچسب فارسی، رزولوشن (ضلع کوچک)، فریم، توضیح */
export const EXPORT_PRESETS = [
  { id: 'youtube', label: 'یوتیوب ۱۰۸۰p۶۰', res: 1080, fps: 60, desc: 'کیفیت کامل برای یوتیوب' },
  { id: 'reels', label: 'ریلز/شورت ۱۰۸۰p۳۰', res: 1080, fps: 30, desc: 'عمودی یا افقی، استاندارد ریلز' },
  { id: 'tiktok', label: 'تیک‌تاک ۷۲۰p۳۰', res: 720, fps: 30, desc: 'سبک‌تر، آپلود سریع‌تر' },
  { id: 'whatsapp', label: 'واتس‌اپ ۷۲۰p۳۰', res: 720, fps: 30, desc: 'کم‌حجم برای پیام‌رسان' },
  { id: 'draft', label: 'پیش‌نمایش ۵۴۰p۲۴', res: 540, fps: 24, desc: 'سریع برای بازبینی، نه انتشار' },
  { id: '4k', label: '۴K ۳۰', res: 2160, fps: 30, desc: 'بالاترین کیفیت؛ خروجی کندتر و حجیم‌تر' },
];

export function presetById(id) {
  return EXPORT_PRESETS.find(p => p.id === id) || null;
}

/** ابعاد خروجی از ابعاد طراحی پروژه و رزولوشن پریست */
export function presetDims(preset, dw, dh) {
  const k = preset.res / Math.min(dw, dh);
  return { w: Math.round(dw * k / 2) * 2, h: Math.round(dh * k / 2) * 2 };
}

/** بیت‌ریت مگابیت بر ثانیه، همان فرمول autoBitrate */
export function presetBitrateMbps(preset, dw, dh) {
  const d = presetDims(preset, dw, dh);
  const px = (d.w * d.h) / (1920 * 1080);
  const f = preset.fps >= 60 ? 1 : preset.fps >= 30 ? 0.72 : 0.62;
  return Math.min(60, Math.max(1, Math.round(12 * px * f)));
}

/** همهٔ تنظیم‌های خروجی برای یک پریست و یک پروژه */
export function applyPreset(preset, dw, dh) {
  const dims = presetDims(preset, dw, dh);
  return { ...dims, fps: preset.fps, container: 'mp4', bitrateMbps: presetBitrateMbps(preset, dw, dh) };
}

/** حجم تقریبی مگابایت برای یک بازهٔ ثانیه‌ای */
export function estimateMB(settings, secs) {
  return (secs * (settings.bitrateMbps * 1e6 + 224000)) / 8 / 1048576;
}
