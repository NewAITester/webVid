import { EASINGS } from './easing.js';
import { noise } from './expr.js';

/**
 * انیمیشن‌های آمادهٔ ورود، خروج و تکرار — به سبک CapCut
 * ─────────────────────────────────────────────────────────────
 * این‌ها کی‌فریم نیستند: روی همان مقادیر لایه «اضافه» می‌شوند. پس
 * می‌شود یک لایه را با کی‌فریم جابه‌جا کرد و هم‌زمان «جهش» ورود و
 * «شناوری» تکرار هم رویش گذاشت.
 *
 * هر انیمیشن یک «تغییر‌دهنده» برمی‌گرداند:
 *   dx, dy   جابه‌جایی، بر حسب کسری از ضلع کوچک قاب
 *   s        ضریب اندازه        sx, sy  ضریب کشش
 *   rot      چرخش اضافه (درجه)  a       ضریب شفافیت
 *   blur     تاری (px)          reveal  ضریب نمایش متن (تایپ)
 *   wipe     { dir, u } برش نمایان‌شونده
 *   stagger  { kind, u } انیمیشن کلمه‌به‌کلمه (فقط متن)
 */

const E = EASINGS;
const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);

/** u=0 یعنی کاملاً پنهان، u=1 یعنی حالت عادی لایه */
export const APPEAR = {
  none:     { label: 'بدون',        fn: () => ({}) },
  fade:     { label: 'محو',         fn: u => ({ a: u }) },
  rise:     { label: 'بالا آمدن',    fn: u => ({ dy: (1 - E.outCubic(u)) * 0.08, a: u }) },
  slideL:   { label: 'از چپ',       fn: u => ({ dx: -(1 - E.outCubic(u)) * 0.7, a: clamp(u * 3) }) },
  slideR:   { label: 'از راست',     fn: u => ({ dx: (1 - E.outCubic(u)) * 0.7, a: clamp(u * 3) }) },
  slideU:   { label: 'از بالا',     fn: u => ({ dy: -(1 - E.outCubic(u)) * 0.6, a: clamp(u * 3) }) },
  slideD:   { label: 'از پایین',    fn: u => ({ dy: (1 - E.outCubic(u)) * 0.6, a: clamp(u * 3) }) },
  zoomIn:   { label: 'بزرگ شدن',    fn: u => ({ s: E.outCubic(u), a: clamp(u * 2) }) },
  zoomOut:  { label: 'کوچک شدن',    fn: u => ({ s: 1 + (1 - E.outCubic(u)) * 0.9, a: u }) },
  pop:      { label: 'جهش',         fn: u => ({ s: Math.max(0, E.outBack(u)), a: clamp(u * 4) }) },
  elastic:  { label: 'فنری',        fn: u => ({ s: Math.max(0, E.outElastic(u)), a: clamp(u * 4) }) },
  spin:     { label: 'چرخش',        fn: u => ({ rot: (1 - E.outCubic(u)) * -180, s: E.outCubic(u), a: u }) },
  spin360:  { label: 'چرخش کامل',   fn: u => ({ rot: (1 - E.outQuint(u)) * 360, a: u }) },
  flipX:    { label: 'ورق افقی',    fn: u => ({ sx: E.outBack(u) }) },
  flipY:    { label: 'ورق عمودی',   fn: u => ({ sy: E.outBack(u) }) },
  drop:     { label: 'افتادن',      fn: u => ({ dy: -(1 - E.outBounce(u)) * 0.55, a: clamp(u * 4) }) },
  swing:    { label: 'تاب',         fn: u => ({ rot: (1 - E.outElastic(u)) * -35, a: clamp(u * 3) }) },
  blurIn:   { label: 'تمرکز',       fn: u => ({ blur: (1 - E.outCubic(u)) * 40, s: 1 + (1 - u) * 0.15, a: u }) },
  stretch:  { label: 'کشیدگی',      fn: u => ({ sx: 1 + (1 - E.outCubic(u)) * 1.6, sy: E.outBack(u), a: clamp(u * 2) }) },
  wipeL:    { label: 'پرده از راست', fn: u => ({ wipe: { dir: 'rtl', u: E.outCubic(u) } }) },
  wipeR:    { label: 'پرده از چپ',  fn: u => ({ wipe: { dir: 'ltr', u: E.outCubic(u) } }) },
  wipeU:    { label: 'پرده از پایین', fn: u => ({ wipe: { dir: 'btt', u: E.outCubic(u) } }) },
  typewriter:{ label: 'تایپ (متن)',  fn: u => ({ reveal: u }) },
  wordsUp:  { label: 'کلمه‌به‌کلمه بالا', fn: u => ({ stagger: { kind: 'up', u } }) },
  wordsPop: { label: 'کلمه‌به‌کلمه جهش', fn: u => ({ stagger: { kind: 'pop', u } }) },
  wordsFade:{ label: 'کلمه‌به‌کلمه محو', fn: u => ({ stagger: { kind: 'fade', u } }) },
};

/** انیمیشن‌های تکرارشونده؛ lt زمان محلی، s سرعت، k شدت (۰..۱+) */
export const LOOPS = {
  none:      { label: 'بدون',      fn: () => ({}) },
  beat:      { label: 'تپش با ضرب', fn: (lt, s, k, env) => ({ s: 1 + (env.kick || 0) * 0.28 * k }) },
  heartbeat: { label: 'ضربان قلب', fn: (lt, s, k) => {
                 const ph = (lt * s) % 1;
                 const v = Math.exp(-ph * 14) + 0.6 * Math.exp(-Math.abs(ph - 0.22) * 18);
                 return { s: 1 + v * 0.12 * k };
               } },
  breathe:   { label: 'نفس',       fn: (lt, s, k) => ({ s: 1 + Math.sin(lt * 1.6 * s) * 0.045 * k }) },
  float:     { label: 'شناوری',    fn: (lt, s, k) => ({ dy: Math.sin(lt * 2 * s) * 0.022 * k }) },
  bounce:    { label: 'پرش',       fn: (lt, s, k) => ({ dy: -Math.abs(Math.sin(lt * 3 * s)) * 0.05 * k }) },
  swing:     { label: 'تاب',       fn: (lt, s, k) => ({ rot: Math.sin(lt * 2.4 * s) * 9 * k }) },
  spin:      { label: 'چرخش دائم', fn: (lt, s, k) => ({ rot: lt * 90 * s * k }) },
  orbit:     { label: 'مدار',      fn: (lt, s, k) => ({ dx: Math.cos(lt * 2 * s) * 0.03 * k, dy: Math.sin(lt * 2 * s) * 0.03 * k }) },
  jelly:     { label: 'ژله',       fn: (lt, s, k) => {
                 const w = Math.sin(lt * 7 * s) * 0.07 * k;
                 return { sx: 1 + w, sy: 1 - w };
               } },
  shake:     { label: 'لرزش',      fn: (lt, s, k, env) => {
                 const amp = 0.012 * k * (0.35 + (env.kick || 0) * 1.6);
                 return { dx: noise(lt * 18 * s) * amp, dy: noise(lt * 18 * s + 50) * amp };
               } },
  flicker:   { label: 'سوسو',      fn: (lt, s, k) => ({ a: 1 - k * 0.7 * (noise(lt * 14 * s) > 0.45 ? 1 : 0) }) },
  glitchJump:{ label: 'پرش گلیچ',  fn: (lt, s, k) => {
                 const f = Math.floor(lt * 12 * s);
                 const on = noise(f * 3.1 + 0.5) > 0.6;
                 return on ? { dx: noise(f * 7.7) * 0.04 * k, sx: 1 + noise(f * 1.3) * 0.08 * k } : {};
               } },
};

/** ترکیب چند تغییردهنده در یکی */
export function combine(...mods) {
  const m = { dx: 0, dy: 0, s: 1, sx: 1, sy: 1, rot: 0, a: 1, blur: 0, reveal: 1, wipe: null, stagger: null };
  for (const x of mods) {
    if (!x) continue;
    if (x.dx) m.dx += x.dx;
    if (x.dy) m.dy += x.dy;
    if (x.s !== undefined) m.s *= x.s;
    if (x.sx !== undefined) m.sx *= x.sx;
    if (x.sy !== undefined) m.sy *= x.sy;
    if (x.rot) m.rot += x.rot;
    if (x.a !== undefined) m.a *= clamp(x.a);
    if (x.blur) m.blur += x.blur;
    if (x.reveal !== undefined) m.reveal *= clamp(x.reveal);
    if (x.wipe) m.wipe = x.wipe;
    if (x.stagger) m.stagger = x.stagger;
  }
  return m;
}

/**
 * تغییردهندهٔ انیمیشن‌های یک لایه در زمان محلی lt
 * @param {object} anim  layer.anim
 * @param {number} lt    زمان محلی
 * @param {number} dur   طول لایه
 */
export function animMods(anim, lt, dur, env = {}) {
  if (!anim) return combine();
  const parts = [];
  const ai = anim.in, ao = anim.out, al = anim.loop;
  // ورود و خروج نباید از نصف طول لایه بیشتر شوند، وگرنه روی هم می‌افتند
  const half = Math.max(0.05, dur / 2);
  if (ai?.id && ai.id !== 'none' && APPEAR[ai.id]) {
    const d = Math.min(Math.max(0.05, ai.d || 0.5), half);
    if (lt < d) parts.push(APPEAR[ai.id].fn(clamp(lt / d)));
  }
  if (ao?.id && ao.id !== 'none' && APPEAR[ao.id]) {
    const d = Math.min(Math.max(0.05, ao.d || 0.5), half);
    const rem = dur - lt;
    if (rem < d) parts.push(APPEAR[ao.id].fn(clamp(rem / d)));
  }
  if (al?.id && al.id !== 'none' && LOOPS[al.id]) {
    parts.push(LOOPS[al.id].fn(lt, al.s ?? 1, (al.a ?? 100) / 100, env));
  }
  return combine(...parts);
}
