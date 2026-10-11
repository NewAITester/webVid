/**
 * منحنی‌های حرکت (Easing)
 * ─────────────────────────────────────────────────────────────
 * هر منحنی یک تابع است: عددی بین ۰ و ۱ (پیشرفت زمان) می‌گیرد و
 * عددی برمی‌گرداند که «پیشرفت حرکت» است. خطی یعنی سرعت ثابت؛ بقیه
 * شروع یا پایان نرم، پرش، کش‌سانی و… می‌سازند.
 *
 * هر کی‌فریم یکی از این‌ها را دارد (یا یک منحنی بزیهٔ دلخواه)، و آن
 * منحنی تعیین می‌کند حرکت «از این کی‌فریم تا بعدی» چطور طی شود —
 * دقیقاً مثل Alight Motion.
 */

const { PI, sin, cos, pow, sqrt } = Math;

const outBounce = x => {
  const n = 7.5625, d = 2.75;
  if (x < 1 / d) return n * x * x;
  if (x < 2 / d) return n * (x -= 1.5 / d) * x + 0.75;
  if (x < 2.5 / d) return n * (x -= 2.25 / d) * x + 0.9375;
  return n * (x -= 2.625 / d) * x + 0.984375;
};

/** منحنی‌های آماده. کلید = شناسه‌ای که در پروژه ذخیره می‌شود. */
export const EASINGS = {
  linear:      x => x,
  hold:        x => (x >= 1 ? 1 : 0),          // پرش ناگهانی در کی‌فریم بعدی
  inSine:      x => 1 - cos((x * PI) / 2),
  outSine:     x => sin((x * PI) / 2),
  inOutSine:   x => -(cos(PI * x) - 1) / 2,
  inQuad:      x => x * x,
  outQuad:     x => 1 - (1 - x) * (1 - x),
  inOutQuad:   x => (x < 0.5 ? 2 * x * x : 1 - pow(-2 * x + 2, 2) / 2),
  inCubic:     x => x * x * x,
  outCubic:    x => 1 - pow(1 - x, 3),
  inOutCubic:  x => (x < 0.5 ? 4 * x * x * x : 1 - pow(-2 * x + 2, 3) / 2),
  inQuint:     x => pow(x, 5),
  outQuint:    x => 1 - pow(1 - x, 5),
  inOutQuint:  x => (x < 0.5 ? 16 * pow(x, 5) : 1 - pow(-2 * x + 2, 5) / 2),
  inExpo:      x => (x <= 0 ? 0 : pow(2, 10 * x - 10)),
  outExpo:     x => (x >= 1 ? 1 : 1 - pow(2, -10 * x)),
  inOutExpo:   x => (x <= 0 ? 0 : x >= 1 ? 1 : x < 0.5
                      ? pow(2, 20 * x - 10) / 2 : (2 - pow(2, -20 * x + 10)) / 2),
  inCirc:      x => 1 - sqrt(1 - x * x),
  outCirc:     x => sqrt(1 - pow(x - 1, 2)),
  inBack:      x => 2.70158 * x * x * x - 1.70158 * x * x,
  outBack:     x => 1 + 2.70158 * pow(x - 1, 3) + 1.70158 * pow(x - 1, 2),
  inOutBack:   x => {
    const c = 1.70158 * 1.525;
    return x < 0.5
      ? (pow(2 * x, 2) * ((c + 1) * 2 * x - c)) / 2
      : (pow(2 * x - 2, 2) * ((c + 1) * (x * 2 - 2) + c) + 2) / 2;
  },
  outElastic:  x => (x <= 0 ? 0 : x >= 1 ? 1
                      : pow(2, -10 * x) * sin((x * 10 - 0.75) * ((2 * PI) / 3)) + 1),
  inElastic:   x => (x <= 0 ? 0 : x >= 1 ? 1
                      : -pow(2, 10 * x - 10) * sin((x * 10 - 10.75) * ((2 * PI) / 3))),
  outBounce,
  inBounce:    x => 1 - outBounce(1 - x),
};

/** نام فارسی و گروه هر منحنی — برای رابط کاربری */
export const EASE_INFO = [
  ['linear', 'خطی', 'پایه'], ['hold', 'نگه‌دار', 'پایه'],
  ['inOutSine', 'نرم', 'پایه'], ['outSine', 'نرم خروج', 'پایه'], ['inSine', 'نرم ورود', 'پایه'],
  ['outQuad', 'کُند‌شونده', 'نرم'], ['inQuad', 'تندشونده', 'نرم'], ['inOutQuad', 'دوطرفه', 'نرم'],
  ['outCubic', 'کُند‌شوندهٔ قوی', 'نرم'], ['inCubic', 'تندشوندهٔ قوی', 'نرم'], ['inOutCubic', 'دوطرفهٔ قوی', 'نرم'],
  ['outQuint', 'ترمز شدید', 'تند'], ['inQuint', 'گاز شدید', 'تند'], ['inOutQuint', 'دوطرفهٔ شدید', 'تند'],
  ['outExpo', 'نمایی خروج', 'تند'], ['inExpo', 'نمایی ورود', 'تند'], ['inOutExpo', 'نمایی دوطرفه', 'تند'],
  ['outCirc', 'دایره‌ای خروج', 'تند'], ['inCirc', 'دایره‌ای ورود', 'تند'],
  ['outBack', 'فراتر رفتن', 'بازیگوش'], ['inBack', 'عقب‌کشیدن', 'بازیگوش'], ['inOutBack', 'کش دوطرفه', 'بازیگوش'],
  ['outElastic', 'فنری', 'بازیگوش'], ['inElastic', 'فنری ورود', 'بازیگوش'],
  ['outBounce', 'توپ', 'بازیگوش'], ['inBounce', 'توپ ورود', 'بازیگوش'],
];

/* ── منحنی بزیهٔ دلخواه ────────────────────────────────────────
   همان cubic-bezier که در CSS هست: نقطهٔ شروع (0,0)، پایان (1,1) و دو
   دستگیره (x1,y1) و (x2,y2). x باید بین ۰ و ۱ بماند تا زمان به عقب
   برنگردد؛ y آزاد است، پس «فراتر رفتن» و «عقب کشیدن» هم ممکن است. */
export function cubicBezier(x1, y1, x2, y2) {
  x1 = Math.min(1, Math.max(0, x1));
  x2 = Math.min(1, Math.max(0, x2));
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const sx = u => ((ax * u + bx) * u + cx) * u;
  const sy = u => ((ay * u + by) * u + cy) * u;
  const dx = u => (3 * ax * u + 2 * bx) * u + cx;

  return x => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    // نیوتن-رافسون: سریع، معمولاً در ۴ دور همگرا می‌شود
    let u = x;
    for (let i = 0; i < 6; i++) {
      const e = sx(u) - x;
      if (Math.abs(e) < 1e-6) return sy(u);
      const d = dx(u);
      if (Math.abs(d) < 1e-6) break;
      u -= e / d;
    }
    // اگر نیوتن گیر کرد: دوبخشی، همیشه جواب می‌دهد
    let lo = 0, hi = 1; u = x;
    for (let i = 0; i < 30; i++) {
      const v = sx(u);
      if (Math.abs(v - x) < 1e-6) break;
      if (v < x) lo = u; else hi = u;
      u = (lo + hi) / 2;
    }
    return sy(u);
  };
}

/** بزیه‌های معادل برای منحنی‌های آماده — نقطهٔ شروع ویرایشگر منحنی */
export const BEZIER_OF = {
  linear: [0, 0, 1, 1], inSine: [0.12, 0, 0.39, 0], outSine: [0.61, 1, 0.88, 1],
  inOutSine: [0.37, 0, 0.63, 1], inQuad: [0.11, 0, 0.5, 0], outQuad: [0.5, 1, 0.89, 1],
  inOutQuad: [0.45, 0, 0.55, 1], inCubic: [0.32, 0, 0.67, 0], outCubic: [0.33, 1, 0.68, 1],
  inOutCubic: [0.65, 0, 0.35, 1], inQuint: [0.64, 0, 0.78, 0], outQuint: [0.22, 1, 0.36, 1],
  inOutQuint: [0.83, 0, 0.17, 1], inExpo: [0.7, 0, 0.84, 0], outExpo: [0.16, 1, 0.3, 1],
  inOutExpo: [0.87, 0, 0.13, 1], inCirc: [0.55, 0, 1, 0.45], outCirc: [0, 0.55, 0.45, 1],
  inBack: [0.36, 0, 0.66, -0.56], outBack: [0.34, 1.56, 0.64, 1], inOutBack: [0.68, -0.6, 0.32, 1.6],
};

const _bezCache = new Map();

/**
 * تبدیل «توصیف منحنی» به تابع.
 * ورودی می‌تواند نام منحنی ('outBack') یا آرایهٔ بزیه [x1,y1,x2,y2] باشد.
 */
export function easeFn(spec) {
  if (typeof spec === 'function') return spec;
  if (Array.isArray(spec) && spec.length === 4) {
    const key = spec.join(',');
    let f = _bezCache.get(key);
    if (!f) { f = cubicBezier(...spec); _bezCache.set(key, f); }
    return f;
  }
  return EASINGS[spec] || EASINGS.linear;
}

/** نام قابل نمایش یک منحنی */
export function easeLabel(spec) {
  if (Array.isArray(spec)) return 'منحنی دلخواه';
  return EASE_INFO.find(e => e[0] === spec)?.[1] || 'خطی';
}
