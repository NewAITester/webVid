/**
 * تعریف لایه‌ها، ویژگی‌ها و افکت‌ها
 * ─────────────────────────────────────────────────────────────
 * این فایل فقط «داده» است: چه نوع لایه‌هایی داریم، هرکدام چه
 * ویژگی‌هایی دارد، و بازهٔ مجاز هر ویژگی چیست. رابط کاربری از روی
 * همین جدول‌ها خودکار ساخته می‌شود — برای افزودن یک ویژگی تازه
 * کافی است یک سطر اینجا اضافه کنید.
 *
 * قرارداد مختصات: x و y بر حسب پیکسل فضای طراحی‌اند و (0,0) وسط قاب
 * است. پس با عوض شدن نسبت تصویر، لایهٔ وسط‌چین وسط می‌ماند.
 */

/* ── انواع ویژگی ─────────────────────────────────────────────
   num   عدد با اسلایدر    color  رنگ (#rrggbb یا #rrggbbaa)   */
const N = (key, label, def, min, max, step = 1, unit = '') =>
  ({ key, label, type: 'num', def, min, max, step, unit });
const COL = (key, label, def) => ({ key, label, type: 'color', def });

/** ویژگی‌های تبدیل — مشترک همهٔ لایه‌ها */
export const TRANSFORM_PROPS = [
  N('x', 'افقی', 0, -2400, 2400, 1, 'px'),
  N('y', 'عمودی', 0, -2400, 2400, 1, 'px'),
  N('sc', 'اندازه', 100, 0, 800, 1, '٪'),
  N('rot', 'چرخش', 0, -1080, 1080, 1, '°'),
  N('opacity', 'شفافیت', 100, 0, 100, 1, '٪'),
  N('sx', 'کشش افقی', 100, -400, 400, 1, '٪'),
  N('sy', 'کشش عمودی', 100, -400, 400, 1, '٪'),
  N('skx', 'کجی', 0, -80, 80, 1, '°'),
  N('ax', 'لنگر افقی', 0, -1200, 1200, 1, 'px'),
  N('ay', 'لنگر عمودی', 0, -1200, 1200, 1, 'px'),
];

/** انواع لایه و ویژگی‌های ظاهری هرکدام */
export const LAYER_TYPES = {
  text: {
    label: 'متن', icon: 'T',
    props: [
      N('size', 'اندازهٔ قلم', 120, 8, 700),
      COL('fill', 'رنگ', '#F6F3EC'),
      COL('stroke', 'رنگ دورخط', '#E4142A'),
      N('strokeW', 'ضخامت دورخط', 0, 0, 40, 0.5),
      N('spacing', 'فاصلهٔ حروف', 0, -20, 80, 0.5),
      N('lineH', 'فاصلهٔ سطرها', 125, 60, 300, 1, '٪'),
      N('reveal', 'نمایش (تایپ)', 100, 0, 100, 0.5, '٪'),
      COL('bg', 'پس‌زمینه', '#00000000'),
      N('bgPad', 'حاشیهٔ پس‌زمینه', 24, 0, 120),
      N('bgR', 'گردی پس‌زمینه', 18, 0, 80),
    ],
    data: () => ({ str: 'متن تازه', font: 'black', align: 'center' }),
  },
  shape: {
    label: 'شکل', icon: '◆',
    props: [
      N('w', 'عرض', 320, 0, 4000), N('h', 'ارتفاع', 320, 0, 4000),
      COL('fill', 'رنگ پُر', '#E4142A'),
      COL('fill2', 'رنگ دوم گرادیان', '#F6F3EC'),
      N('gradA', 'زاویهٔ گرادیان', 90, -360, 360, 1, '°'),
      COL('stroke', 'رنگ دورخط', '#F6F3EC'),
      N('strokeW', 'ضخامت دورخط', 0, 0, 80, 0.5),
      N('radius', 'گردی گوشه', 0, 0, 1000),
      N('sides', 'تعداد ضلع/پر', 5, 3, 24, 1),
      N('inner', 'شعاع داخلی ستاره', 45, 5, 95, 1, '٪'),
      N('trimS', 'برش مسیر از', 0, 0, 100, 0.5, '٪'),
      N('trimE', 'برش مسیر تا', 100, 0, 100, 0.5, '٪'),
    ],
    data: () => ({ kind: 'rect', grad: 'none', fillOn: true }),
  },
  image: {
    label: 'تصویر', icon: '▣',
    props: [N('w', 'عرض', 800, 10, 6000), N('radius', 'گردی گوشه', 0, 0, 1000)],
    data: () => ({ media: null }),
  },
  video: {
    label: 'ویدیو', icon: '▶',
    props: [N('w', 'عرض', 1920, 10, 6000), N('radius', 'گردی گوشه', 0, 0, 1000)],
    data: () => ({ media: null, speed: 1, trimIn: 0, loop: true }),
  },
  spectrum: {
    label: 'موج صدا', icon: '≋',
    props: [
      N('w', 'عرض', 1200, 50, 4000), N('h', 'ارتفاع', 280, 10, 2000),
      COL('fill', 'رنگ', '#E4142A'), COL('fill2', 'رنگ نوک', '#F6F3EC'),
      N('gain', 'حساسیت', 100, 0, 400, 1, '٪'),
      N('gap', 'فاصلهٔ میله‌ها', 30, 0, 90, 1, '٪'),
    ],
    data: () => ({ mode: 'mirror', source: 'rms', bars: 48 }),
  },
  code: {
    label: 'کد', icon: '{}',
    props: [
      N('w', 'عرض کادر', 800, 10, 6000), N('h', 'ارتفاع کادر', 800, 10, 6000),
      COL('c1', 'رنگ ۱', '#E4142A'), COL('c2', 'رنگ ۲', '#F6F3EC'),
      N('p1', 'پارامتر ۱', 50, 0, 100, 0.5), N('p2', 'پارامتر ۲', 50, 0, 100, 0.5),
      N('p3', 'پارامتر ۳', 50, 0, 100, 0.5),
    ],
    data: () => ({ code: '' }),
  },
  adjust: {
    label: 'تنظیم رنگ', icon: '◐',
    props: [],
    data: () => ({}),
  },
  null: {
    label: 'والد خالی', icon: '⊕',
    props: [],
    data: () => ({}),
  },
};

export const SHAPE_KINDS = [
  ['rect', 'مستطیل'], ['ellipse', 'بیضی'], ['polygon', 'چندضلعی'], ['star', 'ستاره'],
  ['ring', 'حلقه'], ['line', 'خط'], ['heart', 'قلب'], ['arrow', 'پیکان'], ['cross', 'به‌علاوه'],
];

export const BLEND_MODES = [
  ['source-over', 'عادی'], ['screen', 'روشن (Screen)'], ['lighter', 'افزایشی (Add)'],
  ['multiply', 'ضرب (Multiply)'], ['overlay', 'روکش (Overlay)'], ['soft-light', 'نور نرم'],
  ['hard-light', 'نور سخت'], ['color-dodge', 'سوزاندن روشن'], ['color-burn', 'سوزاندن تیره'],
  ['darken', 'تیره‌تر'], ['lighten', 'روشن‌تر'], ['difference', 'تفاضل'],
  ['exclusion', 'حذف'], ['hue', 'فام'], ['saturation', 'اشباع'], ['color', 'رنگ'],
  ['luminosity', 'درخشندگی'],
];

/* ── افکت‌های لایه ────────────────────────────────────────────
   kind:
     move    روی تبدیل اثر می‌گذارد (لرزش، تپش)
     draw    خود کشیدن را تکرار یا قرینه می‌کند
     filter  روی تصویر نهایی لایه (تار، درخشش، رنگ …)              */
export const EFFECTS = {
  blur:    { label: 'تاری', cat: 'تصویر', kind: 'filter', params: [N('r', 'شعاع', 8, 0, 80, 0.5)] },
  glow:    { label: 'درخشش', cat: 'تصویر', kind: 'filter', params: [
             N('r', 'پخش', 18, 1, 120, 0.5), N('amt', 'شدت', 120, 0, 400), COL('color', 'رنگ', '#E4142A')] },
  shadow:  { label: 'سایه', cat: 'تصویر', kind: 'filter', params: [
             N('dx', 'افقی', 10, -200, 200), N('dy', 'عمودی', 12, -200, 200),
             N('r', 'نرمی', 16, 0, 100), COL('color', 'رنگ', '#000000'), N('op', 'شفافیت', 75, 0, 100)] },
  color:   { label: 'تنظیم رنگ', cat: 'رنگ', kind: 'filter', params: [
             N('bright', 'روشنایی', 100, 0, 300), N('contrast', 'کنتراست', 100, 0, 300),
             N('sat', 'اشباع', 100, 0, 300), N('hue', 'چرخش فام', 0, -180, 180),
             N('gray', 'سیاه‌وسفید', 0, 0, 100), N('sepia', 'قدیمی', 0, 0, 100),
             N('invert', 'نگاتیو', 0, 0, 100)] },
  tint:    { label: 'رنگ‌آمیزی', cat: 'رنگ', kind: 'filter', params: [
             COL('color', 'رنگ', '#E4142A'), N('amt', 'میزان', 60, 0, 100)] },
  pixel:   { label: 'پیکسلی', cat: 'تصویر', kind: 'filter', params: [N('size', 'اندازهٔ خانه', 14, 1, 120)] },
  rgb:     { label: 'تفکیک رنگ', cat: 'تصویر', kind: 'filter', params: [
             N('amt', 'فاصله', 8, 0, 80, 0.5), N('ang', 'زاویه', 0, -360, 360)] },
  glitch:  { label: 'گلیچ', cat: 'تصویر', kind: 'filter', params: [
             N('amt', 'شدت', 40, 0, 100), N('speed', 'سرعت', 12, 1, 60), N('beat', 'وابستگی به ضرب', 60, 0, 100)] },
  chroma:  { label: 'پردهٔ سبز (حذف رنگ)', cat: 'تصویر', kind: 'filter', params: [
             COL('color', 'رنگ حذفی', '#00FF00'), N('tol', 'دامنه', 32, 0, 100), N('soft', 'نرمی لبه', 12, 0, 100)] },
  vignette:{ label: 'سایهٔ لبه', cat: 'رنگ', kind: 'filter', params: [N('amt', 'شدت', 55, 0, 100), N('size', 'اندازه', 60, 10, 100)] },
  shake:   { label: 'لرزش ضربی', cat: 'حرکت', kind: 'move', params: [
             N('amt', 'شدت', 22, 0, 200), N('freq', 'تندی', 14, 1, 60), N('beat', 'فقط روی ضرب', 100, 0, 100)] },
  wiggle:  { label: 'شناوری نرم', cat: 'حرکت', kind: 'move', params: [
             N('amt', 'دامنه', 30, 0, 400), N('freq', 'تندی', 1.5, 0.1, 12, 0.1), N('rot', 'چرخش', 0, 0, 90)] },
  pulse:   { label: 'تپش با ضرب', cat: 'حرکت', kind: 'move', params: [N('amt', 'شدت', 25, 0, 150)] },
  repeat:  { label: 'تکرارکننده', cat: 'ترکیب', kind: 'draw', params: [
             N('count', 'تعداد', 5, 1, 40), N('dx', 'فاصلهٔ افقی', 90, -800, 800), N('dy', 'فاصلهٔ عمودی', 0, -800, 800),
             N('rot', 'چرخش هر نسخه', 0, -180, 180), N('scale', 'اندازهٔ هر نسخه', 100, 30, 160),
             N('fade', 'محو تدریجی', 50, 0, 100)] },
  mirror:  { label: 'آینه', cat: 'ترکیب', kind: 'draw', params: [
             N('gap', 'فاصله', 0, -1200, 1200), N('op', 'شفافیت قرینه', 60, 0, 100), N('axis', 'محور: ۰ افقی، ۱ عمودی', 0, 0, 1, 1)] },
};

/* ── ساخت داده ──────────────────────────────────────────────── */
let _seq = 0;
export const uid = p => p + Date.now().toString(36) + (++_seq).toString(36) + Math.floor(Math.random() * 1296).toString(36);

const track = v => ({ v });

/** همهٔ تعریف‌های ویژگی یک نوع لایه (تبدیل + ظاهر) */
export function propDefs(type) {
  return [...TRANSFORM_PROPS, ...(LAYER_TYPES[type]?.props || [])];
}
export function propDef(type, key) {
  return propDefs(type).find(d => d.key === key) || null;
}

/** لایهٔ تازه با مقادیر پیش‌فرض */
export function newLayer(type, t0 = 0, dur = 5, over = {}) {
  const T = LAYER_TYPES[type];
  if (!T) throw new Error('نوع لایهٔ ناشناخته: ' + type);
  const props = {};
  for (const d of propDefs(type)) props[d.key] = track(d.def);
  return {
    id: uid('ly'),
    type,
    name: T.label,
    t0: +t0.toFixed(2),
    t1: +(t0 + dur).toFixed(2),
    visible: true,
    locked: false,
    behind: false,         // پشت شعر کشیده شود؟
    blend: 'source-over',
    parent: null,          // شناسهٔ لایهٔ والد
    clip: 'none',          // 'none' | 'below' | 'belowInv'  ماسک با لایهٔ زیرین
    mblur: 0,              // تاری حرکت ۰..۱۰۰
    anim: { in: { id: 'none', d: 0.5 }, out: { id: 'none', d: 0.5 }, loop: { id: 'none', s: 1, a: 100 } },
    props,
    effects: [],
    data: T.data(),
    ...over,
  };
}

/** افکت تازه با مقادیر پیش‌فرض */
export function newEffect(type) {
  const E = EFFECTS[type];
  const p = {};
  for (const d of E.params) p[d.key] = track(d.def);
  return { id: uid('fx'), type, on: true, p };
}

/**
 * لایهٔ ذخیره‌شده را با نسخهٔ فعلی برنامه سازگار می‌کند.
 * اگر بعداً ویژگی تازه‌ای اضافه شود، پروژه‌های قدیمی خراب نمی‌شوند.
 */
export function normalizeLayer(L) {
  const T = LAYER_TYPES[L.type];
  if (!T) return null;
  const base = newLayer(L.type, L.t0 || 0, (L.t1 || 5) - (L.t0 || 0));
  const out = { ...base, ...L };
  out.anim = {
    in: { ...base.anim.in, ...(L.anim?.in || {}) },
    out: { ...base.anim.out, ...(L.anim?.out || {}) },
    loop: { ...base.anim.loop, ...(L.anim?.loop || {}) },
  };
  out.props = { ...base.props, ...(L.props || {}) };
  out.data = { ...base.data, ...(L.data || {}) };
  out.effects = (L.effects || []).filter(e => EFFECTS[e.type]).map(e => {
    const ne = newEffect(e.type);
    return { ...ne, ...e, p: { ...ne.p, ...(e.p || {}) } };
  });
  return out;
}
