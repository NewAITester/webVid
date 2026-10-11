import { newLayer } from './schema.js';

/**
 * «المان‌ها» — قطعه‌های موشن با تنظیمات نام‌دار
 * ─────────────────────────────────────────────────────────────
 * هر المان در اصل یک لایهٔ کد است، اما به‌جای کد خام، چند تنظیم
 * با اسم فارسی دارد (تعداد ذره، سرعت، نوشته …). کد لایه هر بار از روی
 * همین تنظیم‌ها ساخته می‌شود؛ پس می‌شود:
 *   • تنظیم‌ها را با اسلایدر عوض کرد،
 *   • المان را با المان دیگری «تعویض» کرد (زمان، جا، رنگ و افکت‌ها می‌مانند)،
 *   • و برای هر کار پیشرفته‌تر کد را دستی ویرایش کرد (آن وقت لایهٔ کد آزاد می‌شود).
 *
 * رنگ‌های اصلی (c1 و c2) ویژگی‌های خود لایه‌اند تا کی‌فریم بخورند.
 * بقیهٔ تنظیم‌ها در L.data.el.p نگه داشته می‌شوند.
 */

const N = (key, label, def, min, max, step = 1) => ({ key, label, type: 'num', def, min, max, step });
const C = (key, label, def) => ({ key, label, type: 'color', def });
const T = (key, label, def) => ({ key, label, type: 'text', def });
const S = (key, label, def, opts) => ({ key, label, type: 'sel', def, opts });

const FONTS = [['fa', 'فارسی ضخیم'], ['en', 'لاتین ضخیم'], ['mono', 'ماشین‌تحریر']];
const FONT_CSS = {
  fa: '"IRANSansX Black", Vazirmatn, Tahoma, sans-serif',
  en: '"Arial Black", "Helvetica Neue", Arial, sans-serif',
  mono: 'ui-monospace, Menlo, Consolas, monospace',
};

/** نوشتن یک مقدار به شکل کد JS (رنگ‌های لایه به e.c1 / e.c2 وصل می‌شوند) */
const lit = v => (typeof v === 'string' ? JSON.stringify(v) : Array.isArray(v) ? `[${v.map(lit).join(', ')}]` : String(+v));
const obj = o => '{ ' + Object.entries(o).filter(([, v]) => v !== undefined).map(([k, v]) => `${k}: ${v}`).join(', ') + ' }';
const R = (f, k = 'min') => `e.${k}(e.w, e.h) * ${+f}`;

/*  box  اندازهٔ پیش‌فرض کادر:  full تمام‌قاب · sq مربع · band نوار پهن
    cols نگاشت تنظیم رنگ ← ویژگی لایه (c1/c2)
    tr   گذار است (کوتاه، روی برش صحنه‌ها، تمام‌قاب)                 */
export const ELEMENT_KINDS = {
  vortex: {
    label: 'کهکشان ذرات', ic: '🌀', box: 'full', cat: 'particles',
    desc: 'گرداب ذره‌ها که با هر ضرب به بیرون پرت می‌شوند',
    params: [C('c1', 'رنگ ۱', '#E4142A'), C('c2', 'رنگ ۲', '#18E0FF'),
      N('n', 'تعداد ذره', 900, 50, 3000, 10), N('spin', 'سرعت چرخش', 1, -3, 3, 0.05),
      N('arms', 'تعداد بازو', 3, 1, 8), N('tilt', 'کجی دید', 0.55, 0.1, 1, 0.01),
      N('size', 'درشتی ذره', 1, 0.3, 3, 0.05), N('r', 'شعاع', 0.46, 0.05, 0.8, 0.01)],
    code: p => `e.reel.vortex(${obj({ n: lit(p.n), spin: lit(p.spin), arms: lit(p.arms), tilt: lit(p.tilt), size: lit(p.size), r: R(p.r), c1: 'e.c1', c2: 'e.c2' })})`,
  },
  burst: {
    label: 'انفجار ضربی', ic: '💥', box: 'sq', cat: 'particles',
    desc: 'روی ضرب‌ها: پاشش ذره + موج ضربه',
    params: [C('c1', 'رنگ ۱', '#E4142A'), C('c2', 'رنگ ۲', '#FFD447'),
      N('n', 'تعداد ذره', 60, 5, 400, 1), N('life', 'عمر ذره (ثانیه)', 1.2, 0.2, 4, 0.05),
      N('ring', 'موج ضربه', 1, 0, 3, 0.05), N('size', 'درشتی', 1, 0.3, 3, 0.05),
      N('every', 'هر چند ضرب یک‌بار', 1, 1, 8, 1)],
    code: p => `e.reel.burst(${obj({ n: lit(p.n), life: lit(p.life), ring: lit(p.ring), size: lit(p.size), every: lit(p.every), c1: 'e.c1', c2: 'e.c2' })})`,
  },
  starfield: {
    label: 'پرواز در ستاره‌ها', ic: '✧', box: 'full', cat: 'particles',
    desc: 'ستاره‌ها از وسط به بیرون می‌آیند؛ با ضرب تندتر',
    params: [C('c', 'رنگ', '#FFFFFF'), N('n', 'تعداد ستاره', 500, 20, 2500, 10), N('speed', 'سرعت', 1, 0, 6, 0.05)],
    cols: { c: 'c1' },
    code: p => `e.reel.starfield(${obj({ n: lit(p.n), speed: lit(p.speed), c: 'e.c1' })})`,
  },
  swarmText: {
    label: 'نوشتهٔ ذره‌ای', ic: '⁂', box: 'full', cat: 'type',
    desc: 'ذره‌ها جمع می‌شوند و نوشته را می‌سازند',
    params: [T('text', 'نوشته', 'MOTION'), C('c1', 'رنگ نوشته', '#F6F3EC'), C('c2', 'رنگ ذرات', '#E4142A'),
      S('font', 'قلم', 'en', FONTS), N('assemble', 'زمان جمع شدن (ثانیه)', 1.1, 0.1, 6, 0.05),
      N('width', 'پهنای نوشته', 0.78, 0.1, 1, 0.01),
      N('n', 'تعداد ذره', 1400, 200, 4000, 50), N('dot', 'درشتی ذره', 1, 0.3, 3, 0.05)],
    code: p => `e.reel.swarmText(${obj({ text: lit(p.text), font: lit(FONT_CSS[p.font] || FONT_CSS.en), k: `e.ease('inOutCubic', e.t / ${+p.assemble})`, n: lit(p.n), dot: lit(p.dot), w: `e.w * ${+p.width}`, c1: 'e.c1', c2: 'e.c2' })})`,
  },
  slamText: {
    label: 'کلمهٔ کوبنده', ic: '💢', box: 'band', cat: 'type',
    desc: 'کلمه از خیلی بزرگ می‌کوبد، می‌لرزد و خط سرعت می‌گیرد',
    params: [T('text', 'نوشته', 'حرکت'), C('c', 'رنگ نوشته', '#F6F3EC'), C('c2', 'رنگ سایه', '#E4142A'),
      S('font', 'قلم', 'fa', FONTS), N('size', 'اندازه (نسبت به کادر)', 0.6, 0.1, 1.5, 0.01), N('skew', 'کجی', -0.04, -0.4, 0.4, 0.01)],
    cols: { c: 'c1' },
    code: p => `// اندازهٔ قلم: «اندازه» × ارتفاع کادر، ولی هیچ‌وقت پهن‌تر از ۹۰٪ کادر نمی‌شود
const font = ${lit(FONT_CSS[p.font] || FONT_CSS.fa)}, text = ${lit(p.text)};
ctx.save(); ctx.font = '900 100px ' + font; const tw = Math.max(1, ctx.measureText(text).width); ctx.restore();
const size = Math.min(e.h * ${+p.size}, e.w * 0.9 / tw * 100);
e.reel.slamText(${obj({ text: 'text', d: 'e.t', font: 'font', ltr: p.font === 'fa' ? 'false' : 'true', size: 'size', rot: lit(p.skew), c: 'e.c1', c2: 'e.c2' })})`,
  },
  morph: {
    label: 'دگردیسی شکل‌ها', ic: '◆', box: 'sq', cat: 'shapes',
    desc: 'دایره ← مثلث ← مربع ← … هر ضرب یک شکل',
    params: [C('c1', 'رنگ پُر', '#E4142A'), C('c2', 'رنگ دورخط', '#F6F3EC'), N('r', 'اندازه', 0.3, 0.05, 0.6, 0.01)],
    code: p => `e.reel.morph(${obj({ r: R(p.r), c1: 'e.c1', c2: 'e.c2' })})`,
  },
  wire: {
    label: 'جسم سیمی سه‌بعدی', ic: '⬡', box: 'sq', cat: 'shapes',
    desc: 'بیست‌وجهی یا مکعب سیمی که می‌چرخد و می‌تپد',
    params: [C('c1', 'رنگ خط', '#18E0FF'), C('c2', 'رنگ گره', '#FF2E97'),
      S('shape', 'جسم', 'ico', [['ico', 'بیست‌وجهی'], ['cube', 'مکعب']]), N('r', 'اندازه', 0.3, 0.05, 0.6, 0.01)],
    code: p => `e.reel.wire(${obj({ shape: lit(p.shape), r: R(p.r), c1: 'e.c1', c2: 'e.c2' })})`,
  },
  grid3d: {
    label: 'زمین نئونی', ic: '🌅', box: 'full', cat: 'scene',
    desc: 'خورشید راه‌راه، شهر اکولایزری و زمین شبکه‌ای',
    params: [C('c1', 'رنگ ۱', '#FF2E97'), C('c2', 'رنگ ۲', '#18E0FF'),
      N('speed', 'سرعت', 1, 0, 5, 0.05), N('horizon', 'جای افق', 0.58, 0.2, 0.9, 0.01), N('bars', 'تعداد ساختمان', 40, 0, 120, 1)],
    code: p => `e.reel.grid3d(${obj({ speed: lit(p.speed), horizon: lit(p.horizon), bars: lit(p.bars), c1: 'e.c1', c2: 'e.c2' })})`,
  },
  eqRing: {
    label: 'اکولایزر حلقه‌ای', ic: '✹', box: 'sq', cat: 'audio',
    desc: 'میله‌های صدا دور یک دایره',
    params: [C('c1', 'رنگ ۱', '#E4142A'), C('c2', 'رنگ ۲', '#18E0FF'),
      N('n', 'تعداد میله', 96, 12, 256, 1), N('r', 'شعاع', 0.3, 0.05, 0.6, 0.01)],
    code: p => `e.reel.eqRing(${obj({ n: lit(p.n), r: R(p.r), c1: 'e.c1', c2: 'e.c2' })})`,
  },
  shock: {
    label: 'موج ضربه', ic: '◎', box: 'sq', cat: 'audio',
    desc: 'حلقه‌ای که روی هر ضرب باز می‌شود',
    params: [C('c', 'رنگ', '#FFFFFF')], cols: { c: 'c1' },
    code: () => `e.reel.shock({ c: e.c1 })`,
  },
  dotGrid: {
    label: 'شبکهٔ نقطه‌ای موجی', ic: '⁘', box: 'full', cat: 'scene',
    desc: 'نقطه‌هایی که از وسط موج برمی‌دارند',
    params: [C('c1', 'رنگ', '#F6F3EC'), N('cols', 'ستون', 16, 3, 40, 1), N('rows', 'ردیف', 9, 3, 40, 1),
      N('op', 'شفافیت', 0.25, 0, 1, 0.01), N('speed', 'سرعت موج', 9, 0, 30, 0.1)],
    code: p => `// شبکهٔ نقطه‌ای که از وسط موج برمی‌دارد
const cols = ${+p.cols}, rows = ${+p.rows}, s = e.min(e.w, e.h) / 1080;
ctx.fillStyle = e.c1; ctx.globalAlpha *= ${+p.op};
for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
  const px = ((x + 0.5) / cols - 0.5) * e.w, py = ((y + 0.5) / rows - 0.5) * e.h;
  const d = Math.hypot(px, py) / e.w, r = (3 + 5 * Math.max(0, e.sin(d * 18 - e.t * ${+p.speed}))) * s * (1 + e.kick * 0.5);
  ctx.beginPath(); ctx.arc(px, py, r, 0, e.TAU); ctx.fill();
}`,
  },
  marquee: {
    label: 'نوشتهٔ روان توخالی', ic: '⇆', box: 'full', cat: 'type',
    desc: 'ردیف‌های نوشتهٔ دورخطی که خلاف هم می‌لغزند',
    params: [T('text', 'نوشته', 'MOTION · DESIGN · RHYTHM · '), C('c1', 'رنگ', '#F6F3EC'),
      N('rows', 'ردیف', 5, 1, 12, 1), N('size', 'اندازه', 190, 30, 500, 1), N('speed', 'سرعت', 420, 0, 2000, 10),
      N('op', 'شفافیت', 0.2, 0, 1, 0.01)],
    code: p => `// ردیف‌های نوشتهٔ توخالی که خلاف هم می‌لغزند
const M = ${lit(p.text)}, rows = ${+p.rows}, s = e.min(e.w, e.h) / 1080;
ctx.save(); ctx.strokeStyle = e.c1; ctx.globalAlpha *= ${+p.op}; ctx.lineWidth = 2 * s;
ctx.font = '900 ' + (${+p.size} * s) + 'px "Arial Black", Arial, sans-serif';
ctx.textBaseline = 'middle'; ctx.textAlign = 'left'; ctx.direction = 'ltr';
const mw = Math.max(1, ctx.measureText(M).width);
for (let r = 0; r < rows; r++) {
  const off = ((((e.t + r * 0.37) * (r % 2 ? ${+p.speed} : -${+p.speed}) * s) % mw) + mw) % mw;
  const y = -e.h / 2 + e.h * (r + 0.5) / rows;
  for (let x = -e.w / 2 - off; x < e.w / 2; x += mw) ctx.strokeText(M, x, y);
}
ctx.restore();`,
  },
  hud: {
    label: 'قاب HUD', ic: '⌜', box: 'full', cat: 'scene',
    desc: 'گوشه‌های قاب فنی با نوشتهٔ ماشین‌تحریر',
    params: [C('c1', 'رنگ', '#18E0FF'), T('tl', 'نوشتهٔ بالا', 'ROT X {rx}°  Y {ry}°'), T('br', 'نوشتهٔ پایین', '3D / WIREFRAME'),
      N('m', 'فاصله از لبه', 50, 0, 300, 1), N('len', 'طول گوشه', 60, 10, 300, 1)],
    code: p => `// گوشه‌های قاب + نوشته‌ها ({rx} و {ry} عدد چرخش زنده‌اند)
const s = e.min(e.w, e.h) / 1080, m = ${+p.m} * s, L = ${+p.len} * s, W2 = e.w / 2, H2 = e.h / 2;
ctx.save(); ctx.strokeStyle = e.c1; ctx.globalAlpha *= 0.7; ctx.lineWidth = 2 * s;
for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
  const x = sx * (W2 - m), y = sy * (H2 - m);
  ctx.beginPath(); ctx.moveTo(x, y - sy * L); ctx.lineTo(x, y); ctx.lineTo(x - sx * L, y); ctx.stroke();
}
ctx.restore();
const fill = str => str.replace('{rx}', (e.t * 40.1 % 360).toFixed(1)).replace('{ry}', (e.t * 51.6 % 360).toFixed(1));
ctx.save(); ctx.fillStyle = e.c1; ctx.globalAlpha *= 0.85; ctx.font = (20 * s) + 'px ui-monospace, Menlo, monospace';
ctx.textBaseline = 'middle'; ctx.direction = 'ltr';
ctx.textAlign = 'left'; ctx.fillText(fill(${lit(p.tl)}), -W2 + m + 20 * s, -H2 + m + 40 * s);
ctx.textAlign = 'right'; ctx.fillText(fill(${lit(p.br)}), W2 - m - 20 * s, H2 - m - 40 * s);
ctx.restore();`,
  },
  /* ── گذارها: تمام‌قاب و کوتاه، معمولاً روی مرز دو صحنه ── */
  wipe: {
    label: 'گذار نوارهای رنگی', ic: '▧', box: 'full', cat: 'transition', tr: true,
    desc: 'نوارهای مورب قاب را می‌پوشانند و باز می‌کنند',
    params: [C('c1', 'رنگ ۱', '#E4142A'), C('c2', 'رنگ ۲', '#FFD447'), C('c3', 'رنگ ۳', '#18E0FF'), C('c4', 'رنگ ۴', '#0B0B12'),
      N('ang', 'زاویه', -0.35, -1.6, 1.6, 0.01)],
    code: p => `e.reel.wipe(e.p, { cols: [e.c1, e.c2, ${lit(p.c3)}, ${lit(p.c4)}], ang: ${+p.ang} })`,
  },
  flash: {
    label: 'فلاش', ic: '⚡', box: 'full', cat: 'transition', tr: true,
    desc: 'قاب یک لحظه سفید (یا هر رنگی) می‌شود',
    params: [C('c1', 'رنگ', '#FFFFFF'), S('mode', 'شکل', 'out', [['out', 'روشن ← محو'], ['in', 'محو ← روشن'], ['peak', 'اوج در وسط']]),
      N('amt', 'شدت', 1, 0, 1, 0.01)],
    code: p => `// فلاش تمام‌قاب
const k = ${p.mode === 'in' ? 'e.p' : p.mode === 'peak' ? '1 - Math.abs(e.p * 2 - 1)' : '1 - e.p'};
ctx.globalAlpha *= Math.max(0, k) * ${+p.amt}; ctx.fillStyle = e.c1;
ctx.fillRect(-e.w / 2, -e.h / 2, e.w, e.h);`,
  },
  glitch: {
    label: 'گلیچ', ic: '▚', box: 'full', cat: 'transition', tr: true,
    desc: 'تکه‌های تصویر زیرین به کنار می‌پرند و آرام می‌شوند',
    params: [N('amt', 'شدت', 1, 0, 1, 0.01)],
    code: p => `e.reel.glitch(${+p.amt} * (1 - e.p), Math.floor(e.time * 30))`,
  },
  iris: {
    label: 'دریچهٔ دایره‌ای', ic: '◉', box: 'full', cat: 'transition', tr: true,
    desc: 'صحنه از دل یک دایره باز می‌شود (یا بسته)',
    params: [C('c1', 'رنگ پوشش', '#07070C'), S('mode', 'جهت', 'open', [['open', 'باز شدن'], ['close', 'بسته شدن']])],
    code: p => `// پوشش با سوراخ دایره‌ای که بزرگ (یا کوچک) می‌شود
const u = e.ease('outQuint', ${p.mode === 'close' ? '1 - e.p' : 'e.p'});
ctx.fillStyle = e.c1; ctx.beginPath(); ctx.rect(-e.w / 2, -e.h / 2, e.w, e.h);
ctx.arc(0, 0, u * Math.hypot(e.w, e.h) * 0.55 + 1, 0, e.TAU, true); ctx.fill('evenodd');`,
  },
};

export const ELEMENT_CATS = [
  ['particles', 'ذرات'], ['type', 'تایپوگرافی'], ['shapes', 'شکل و سه‌بعدی'],
  ['scene', 'صحنه و پس‌زمینه'], ['audio', 'صدا و ضرب'], ['transition', 'گذار'],
];

/** تنظیم‌های پیش‌فرض یک المان */
export function elementDefaults(kind) {
  const K = ELEMENT_KINDS[kind];
  const p = {};
  for (const d of K?.params || []) p[d.key] = d.def;
  return p;
}

/** تنظیمی که رنگ لایه است؟  ← کلید ویژگی لایه (c1/c2) یا null */
export function colorProp(kind, key) {
  const K = ELEMENT_KINDS[kind];
  if (!K) return null;
  if (K.cols?.[key]) return K.cols[key];
  return key === 'c1' || key === 'c2' ? key : null;
}

/** اندازهٔ کادر پیش‌فرض در فضای طراحی */
export function elementBox(kind, W, H) {
  const b = ELEMENT_KINDS[kind]?.box || 'sq', m = Math.min(W, H);
  if (b === 'full') return { w: W, h: H };
  if (b === 'band') return { w: Math.round(W * 0.9), h: Math.round(Math.min(H * 0.4, W * 0.45)) };
  return { w: Math.round(m * 0.9), h: Math.round(m * 0.9) };
}

/** کد لایه از روی تنظیم‌ها */
export function elementCode(kind, p) {
  const K = ELEMENT_KINDS[kind];
  if (!K) return '';
  const all = { ...elementDefaults(kind), ...(p || {}) };
  return `// المان «${K.label}» — تنظیم‌هایش را در زبانهٔ «✎ تنظیم» عوض کنید.\n${K.code(all)}\n`;
}

/** رنگ‌ها را از p جدا کن: { props: {c1,c2}, rest } */
function splitColors(kind, p) {
  const props = {}, rest = {};
  for (const [k, v] of Object.entries(p || {})) {
    const cp = colorProp(kind, k);
    if (cp) props[cp] = v; else rest[k] = v;
  }
  return { props, rest };
}

/**
 * لایهٔ تازه از روی یک المان
 * @param {string} kind  کلید ELEMENT_KINDS
 * @param {object} p     تنظیم‌ها (هر چه نباشد پیش‌فرض)
 */
export function makeElementLayer(kind, p = {}, t0 = 0, dur = 2, W = 1080, H = 1920) {
  const K = ELEMENT_KINDS[kind];
  if (!K) throw new Error('المان ناشناخته: ' + kind);
  const L = newLayer('code', t0, dur);
  L.name = K.label;
  const all = { ...elementDefaults(kind), ...p };
  const { props, rest } = splitColors(kind, all);
  const box = elementBox(kind, W, H);
  L.props.w = { v: box.w }; L.props.h = { v: box.h };
  for (const [k, v] of Object.entries(props)) L.props[k] = { v };
  L.data.el = { kind, p: rest };
  L.data.code = elementCode(kind, all);
  return L;
}

/** همهٔ تنظیم‌های فعلی المان (رنگ‌ها از ویژگی‌های لایه خوانده می‌شوند) */
export function elementParams(L) {
  const el = L.data?.el;
  if (!el) return null;
  const out = { ...elementDefaults(el.kind), ...el.p };
  for (const d of ELEMENT_KINDS[el.kind]?.params || []) {
    const cp = colorProp(el.kind, d.key);
    if (cp && L.props[cp]) out[d.key] = L.props[cp].v;
  }
  return out;
}

/** بعد از تغییر یک تنظیم: کد را از نو بساز */
export function setElementParam(L, key, value) {
  const el = L.data.el;
  const cp = colorProp(el.kind, key);
  if (cp) L.props[cp] = { ...(L.props[cp] || {}), v: value };
  else el.p[key] = value;
  L.data.code = elementCode(el.kind, elementParams(L));
}

/**
 * المان را با المان دیگری عوض کن.
 * زمان، جا، اندازه، چرخش، شفافیت، حرکت‌ها، افکت‌ها و رنگ‌ها می‌مانند؛
 * تنظیم‌های هم‌نام (مثل «نوشته» یا «تعداد») هم منتقل می‌شوند.
 */
export function swapElement(L, kind, W = 1080, H = 1920) {
  const K = ELEMENT_KINDS[kind];
  if (!K) return L;
  const old = elementParams(L) || {};
  const oldKind = L.data.el?.kind;
  const oldBox = oldKind ? elementBox(oldKind, W, H) : null;
  const p = elementDefaults(kind);
  for (const d of K.params) {
    if (d.type === 'color') continue;             // رنگ‌ها از ویژگی لایه می‌آیند
    if (old[d.key] === undefined) continue;
    const od = ELEMENT_KINDS[oldKind]?.params.find(x => x.key === d.key);
    if (od && od.type === d.type) p[d.key] = d.type === 'num' ? Math.min(d.max, Math.max(d.min, old[d.key])) : old[d.key];
  }
  const { rest } = splitColors(kind, p);
  L.data.el = { kind, p: rest };
  // اگر کادر دست نخورده بود، کادر المان تازه را بگیر
  if (!oldBox || (L.props.w.v === oldBox.w && L.props.h.v === oldBox.h && !L.props.w.k && !L.props.h.k)) {
    const b = elementBox(kind, W, H);
    L.props.w = { v: b.w }; L.props.h = { v: b.h };
  }
  if (!L._named && (!oldKind || L.name === ELEMENT_KINDS[oldKind]?.label)) L.name = K.label;
  L.data.code = elementCode(kind, elementParams(L));
  return L;
}

/* ── «عددهای قابل تنظیم» در کد آزاد ────────────────────────────
   هر خطی مثل این‌ها در کد، یک کنترل در زبانهٔ تنظیم می‌سازد:
     const count = 12;            // تعداد نقطه‌ها
     let speed = 2.5;             // سرعت
     const color = '#FF2E97';     // رنگ اصلی
   برچسب از توضیح // همان خط گرفته می‌شود.                        */
const TW_RE = /^([ \t]*(?:const|let|var)[ \t]+)([A-Za-z_$\u0600-\u06FF][\w$\u0600-\u06FF]*)([ \t]*=[ \t]*)(-?\d+(?:\.\d+)?|'#[0-9a-fA-F]{3,8}'|"#[0-9a-fA-F]{3,8}"|'[^'\n]{0,60}'|"[^"\n]{0,60}")([ \t]*;?)([ \t]*\/\/[ \t]*(.*))?$/;

/** پیدا کردن عددها/رنگ‌ها/نوشته‌های قابل تنظیم */
export function findTweaks(code) {
  const out = [];
  String(code || '').split('\n').forEach((line, i) => {
    const m = TW_RE.exec(line);
    if (!m) return;
    const raw = m[4];
    let type = 'num', value;
    if (/^['"]#/.test(raw)) { type = 'color'; value = raw.slice(1, -1); }
    else if (/^['"]/.test(raw)) { type = 'text'; value = raw.slice(1, -1); }
    else value = +raw;
    const label = (m[7] || '').trim() || m[2];
    let min = 0, max = 100, step = 1;
    if (type === 'num') {
      const range = /\[\s*(-?\d+(?:\.\d+)?)\s*(?:\.\.|–|-|,)\s*(-?\d+(?:\.\d+)?)\s*\]/.exec(label);
      if (range) { min = +range[1]; max = +range[2]; }
      else {
        const a = Math.abs(value);
        if (Number.isInteger(value)) { max = a <= 10 ? 20 : a <= 100 ? Math.max(100, a * 3) : a * 3; min = value < 0 ? -max : 0; }
        else { max = a <= 1 ? 1 : a * 3; min = value < 0 ? -max : 0; step = a <= 1 ? 0.01 : 0.05; }
      }
      if (!Number.isInteger(value) && step === 1) step = 0.01;
    }
    out.push({ line: i, name: m[2], type, value, label: label.replace(/\[[^\]]*\]/, '').trim() || m[2], min, max, step });
  });
  return out;
}

/** یک مقدار قابل تنظیم را در کد بنویس */
export function setTweak(code, tw, value) {
  const lines = String(code).split('\n');
  const m = TW_RE.exec(lines[tw.line] || '');
  if (!m || m[2] !== tw.name) return code;
  const v = tw.type === 'num' ? String(+(+value).toFixed(4)) : `'${String(value).replace(/['\\\n]/g, '')}'`;
  lines[tw.line] = m[1] + m[2] + m[3] + v + m[5] + (m[6] || '');
  return lines.join('\n');
}
