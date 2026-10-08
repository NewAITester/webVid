import { resolve } from '../effects/index.js';

/**
 * پروژه = کل کلیپ در یک آبجکت
 *
 * این دقیقاً همان چیزی است که در فایل .json ذخیره می‌شود. هر چیزی
 * که کلیپ را می‌سازد اینجاست: لایه‌ها، بخش‌ها، و جابه‌جایی‌های دستی.
 *
 * ساختار:
 *   layers[]    — لایه‌های همیشگی (پس‌زمینه، ذرات) از اول تا آخر
 *   sections[]  — بخش‌های زمان‌دار، هرکدام یک افکت
 *   overrides{} — جابه‌جایی دستی کلمات: { "l3w2": {dx, dy, scale} }
 */
export function emptyProject() {
  return {
    name: 'پروژهٔ تازه',
    w: 1920, h: 1080, fps: 60,
    duration: 60,
    audio: null,
    lyricsUrl: null,
    analysisUrl: null,
    layers: [],
    sections: [],
    overrides: {},
  };
}

/** پروژهٔ نمونه بر اساس آهنگ «نقاب» */
export function demoProject() {
  return {
    name: 'نقاب — زروان اکو',
    w: 1920, h: 1080, fps: 60,
    duration: 228.6,
    audio: '/data/Neghab.mp3',
    lyricsUrl: '/data/lyrics.lrc',
    analysisUrl: '/data/analysis.json',

    layers: [
      { id: 'bg', effect: 'backdrop', params: {} },
      { id: 'pf', effect: 'particleField', params: { count: 420, opacity: 0.42 } },
    ],

    // بخش‌ها روی ساختار واقعی آهنگ چیده شده‌اند: شکاف‌های بی‌کلام
    // در ۲۱٫۱→۳۰٫۰ و ۱۳۱٫۱→۱۵۸٫۱ و ۱۷۹٫۰→۱۸۹٫۵ هستند.
    sections: [
      { id: 's0', name: 'تیتراژ',       t0: 0,     t1: 9.6,   effect: 'titleCard',
        params: { text: 'نقاب', sub: 'زروان اکو', size: 250 } },
      { id: 's1', name: 'ورود سرد',     t0: 9.6,   t1: 21.6,  effect: 'wordReveal',
        params: { stagger: 0.09, rise: 48 } },
      { id: 's2', name: 'میان‌نوازی',    t0: 21.6,  t1: 29.6,  effect: 'beatGrid', params: {} },
      { id: 's3', name: 'بند اول',      t0: 29.6,  t1: 44.0,  effect: 'wordReveal',
        params: { cy: 500, popScale: 1.16 } },
      { id: 's4', name: 'پاشیدن',       t0: 44.0,  t1: 49.5,  effect: 'shatter', params: {} },
      { id: 's5', name: 'بند دوم',      t0: 49.5,  t1: 93.5,  effect: 'wordReveal', params: {} },
      { id: 's6', name: 'اوج',          t0: 93.5,  t1: 125.5, effect: 'wordReveal',
        params: { cy: 520, popScale: 1.22, stagger: 0.03 } },
      { id: 's7', name: 'پیش‌کرس',       t0: 125.5, t1: 131.5, effect: 'wordReveal',
        params: { size: 120 } },
      { id: 's8', name: 'شکست ۲۷ ثانیه', t0: 131.5, t1: 157.8, effect: 'beatGrid',
        params: { cols: 26, height: 420, thick: 4 } },
      { id: 's9', name: 'بازگشت',       t0: 157.8, t1: 178.8, effect: 'wordReveal',
        params: { cy: 540, popScale: 1.2 } },
      { id: 's10', name: 'سکوت',        t0: 178.8, t1: 189.2, effect: 'beatGrid',
        params: { cols: 10, height: 180, opacity: 0.4 } },
      { id: 's11', name: 'پایان‌بندی',   t0: 189.2, t1: 209.0, effect: 'wordReveal', params: {} },
      { id: 's12', name: 'کارت پایان',  t0: 209.0, t1: 228.6, effect: 'titleCard',
        params: { text: 'زروان اکو', sub: 'Telegram: @ZurvanEcho', size: 170, subSize: 54 } },
    ],

    overrides: {},
  };
}

/** بخش فعال در لحظهٔ t */
export function sectionAt(project, t) {
  for (const s of project.sections) if (t >= s.t0 && t < s.t1) return s;
  return null;
}

/** پارامترهای نهایی یک لایه یا بخش (پیش‌فرض + ذخیره‌شده) */
export function paramsOf(node) {
  return resolve(node.effect, node.params);
}
