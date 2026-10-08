// ─────────────────────────────────────────────────────────────
//  هستهٔ موتور — ابزارهای پایه
//  همهٔ مختصات در «فضای طراحی» ۱۹۲۰×۱۰۸۰ هستند.
// ─────────────────────────────────────────────────────────────

export const DESIGN_W = 1920;
export const DESIGN_H = 1080;
export const FPS = 60;

/* ── منحنی‌های شتاب (easing) ───────────────────────────────── */
export const ease = {
  linear: t => t,
  inQuad: t => t * t,
  outQuad: t => t * (2 - t),
  inOutQuad: t => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t),
  inCubic: t => t * t * t,
  outCubic: t => 1 - Math.pow(1 - t, 3),
  inOutCubic: t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  outQuart: t => 1 - Math.pow(1 - t, 4),
  outExpo: t => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t)),
  outBack: t => {
    const c1 = 1.70158, c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  },
  outElastic: t => {
    if (t === 0 || t === 1) return t;
    const c4 = (2 * Math.PI) / 3;
    return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
  },
};

/* ── کمک‌تابع‌های عددی ─────────────────────────────────────── */
export const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const inv = (a, b, v) => (b === a ? 0 : (v - a) / (b - a));

/** نگاشت v از بازهٔ [a,b] به [c,d] با محدودسازی و منحنی دلخواه */
export function remap(v, a, b, c, d, fn = ease.linear) {
  return lerp(c, d, fn(clamp(inv(a, b, v))));
}

/** ۰ تا ۱ در بازهٔ زمانی [t0,t1] */
export const ramp = (t, t0, t1, fn = ease.linear) => fn(clamp(inv(t0, t1, t)));

/**
 * پاکت ورود/خروج: ۰ → ۱ → ۱ → ۰
 * برای ظاهر و محو شدن هر چیزی در یک بازهٔ زمانی.
 */
export function env(t, t0, t1, fadeIn = 0.25, fadeOut = 0.25, fn = ease.outCubic) {
  if (t < t0 || t > t1) return 0;
  const a = fadeIn > 0 ? fn(clamp((t - t0) / fadeIn)) : 1;
  const b = fadeOut > 0 ? fn(clamp((t1 - t) / fadeOut)) : 1;
  return Math.min(a, b);
}

/* ── تصادفِ تکرارپذیر ──────────────────────────────────────── */
/**
 * بسیار مهم: برای اینکه رندر «تابع خالص زمان» بماند، هیچ‌جا از
 * Math.random استفاده نمی‌کنیم. این تابع با یک عدد ورودی همیشه
 * همان خروجی را می‌دهد، پس اسکراب کردن تایم‌لاین تصویر را نمی‌لرزاند.
 */
export function hash(n) {
  let x = Math.sin(n * 127.1 + 311.7) * 43758.5453123;
  return x - Math.floor(x);
}
export function hash2(a, b) { return hash(a * 157.31 + b * 71.17); }

/** مولد اعداد تصادفی با بذر ثابت */
export function rng(seed = 1) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5;  s >>>= 0;
    return s / 4294967296;
  };
}

/** نویز یک‌بعدی هموار — برای حرکت‌های آرام و ارگانیک */
export function noise1(x) {
  const i = Math.floor(x), f = x - i;
  const u = f * f * (3 - 2 * f);
  return lerp(hash(i), hash(i + 1), u) * 2 - 1;
}

/* ── رنگ ───────────────────────────────────────────────────── */
export function hexToRgb(h) {
  h = h.replace('#', '');
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
export function rgba(hex, a = 1) {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}
export function mixHex(h1, h2, t) {
  const a = hexToRgb(h1), b = hexToRgb(h2);
  const c = a.map((v, i) => Math.round(lerp(v, b[i], clamp(t))));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

/* ── پالت پیش‌فرض ──────────────────────────────────────────── */
export const PALETTE = {
  bg:      '#07080B',
  grey:    '#9AA0AC',
  crimson: '#E4142A',
  white:   '#F2F4F8',
  dim:     '#2A2F3A',
};
