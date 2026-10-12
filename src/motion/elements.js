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
  sans: 'Arial, "Helvetica Neue", "Liberation Sans", sans-serif',
};
const FONTS2 = [...FONTS, ['sans', 'لاتین ساده (Arial)']];
const WEIGHTS = [['400', 'معمولی'], ['700', 'ضخیم'], ['900', 'خیلی ضخیم']];
const EASES = [['outExpo', 'تند ← نرم (expo)'], ['outCubic', 'نرم'], ['outBack', 'با برگشت'], ['outElastic', 'فنری'], ['linear', 'خطی']];

/** نوشتن یک مقدار به شکل کد JS (رنگ‌های لایه به e.c1 / e.c2 وصل می‌شوند) */
const lit = v => (typeof v === 'string' ? JSON.stringify(v) : Array.isArray(v) ? `[${v.map(lit).join(', ')}]` : String(+v));
const obj = o => '{ ' + Object.entries(o).filter(([, v]) => v !== undefined).map(([k, v]) => `${k}: ${v}`).join(', ') + ' }';
const R = (f, k = 'min') => `e.${k}(e.w, e.h) * ${+f}`;

/** کد مشترک دو المان «جریان ذره‌ای» (از صحنهٔ FLOW شوریل پایتون) */
const flowCode = (p, mode) => `// ${mode === 'title' ? 'عنوان ذره‌ای ریتمیک: بعد از ساخته شدن، با هر ضرب جلو و عقب می‌رود' : 'جریان ذره‌ای: چرخش ← ساختن نوشته ← انفجار'}
${p.bg === 'yes' ? `{ const g = ctx.createRadialGradient(0, 0, 0, 0, 0, Math.hypot(e.w, e.h) * 0.55); g.addColorStop(0, '#1B1036'); g.addColorStop(1, '#040407'); ctx.fillStyle = g; ctx.fillRect(-e.w / 2, -e.h / 2, e.w, e.h); }
` : ''}e.reel.flowText(${obj({ text: lit(p.text), font: lit(FONT_CSS[p.font] || FONT_CSS.sans), weight: lit(String(p.weight)), size: `e.h * ${+p.size}`, n: lit(p.n),
  cols: `[e.c1, e.c2, ${lit(p.c3)}, ${lit(p.c4)}]`, lw: lit(p.lw), trail: lit(p.trail), t: 'e.t', dur: 'e.dur', mode: lit(mode),
  swirl: lit(p.swirl), inAt: lit(p.inAt), gather: lit(p.gather), outLen: lit(p.outLen),
  ...(mode === 'title' ? { amp: lit(p.amp), beat: lit(p.beat), bpm: lit(p.bpm) } : {}) })})`;

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

/* ── المان‌های تایپوگرافی و گذار که «تشخیص افکت» از کدهای وارد‌شده هم از آن‌ها استفاده می‌کند ── */
const fontOf = p => lit(FONT_CSS[p.font] || FONT_CSS.sans);
const DIRS = { below: [0, 1], above: [0, -1], left: [-1, 0], right: [1, 0], none: [0, 0] };
Object.assign(ELEMENT_KINDS, {
  letterRise: {
    label: 'حروف پله‌ای', ic: '🔠', box: 'full', cat: 'type',
    desc: 'حروف یکی‌یکی (با فاصلهٔ زمانی) از یک سمت وارد می‌شوند و در پایان خارج می‌شوند؛ با ماسک اختیاری',
    params: [T('text', 'نوشته', 'SHOWREEL'), C('c1', 'رنگ نوشته', '#FFFFFF'), C('c2', 'رنگ تأکید', '#5E9FE8'),
      N('accent', 'هر چند حرف یک حرف تأکیدی (۰ = هیچ)', 0, 0, 12, 1), S('font', 'قلم', 'sans', FONTS2), S('weight', 'ضخامت', '700', WEIGHTS),
      N('size', 'اندازه (نسبت به ارتفاع)', 0.185, 0.01, 1, 0.005), N('track', 'فاصلهٔ حروف (نسبت به اندازه)', 0.07, -0.2, 1, 0.01),
      S('dir', 'ورود از', 'below', [['below', 'پایین'], ['above', 'بالا'], ['left', 'چپ'], ['right', 'راست'], ['none', 'بدون حرکت']]),
      N('dist', 'فاصلهٔ ورود (نسبت به اندازه)', 1.3, 0, 5, 0.05), N('inDur', 'مدت ورود هر حرف (ثانیه)', 0.65, 0.05, 4, 0.05),
      N('stagger', 'فاصلهٔ زمانی حروف (ثانیه)', 0.045, 0, 1, 0.005), N('delay', 'تأخیر شروع (ثانیه)', 0, 0, 20, 0.05), S('ease', 'منحنی', 'outExpo', EASES),
      S('fade', 'محو هم بشود', 'no', [['no', 'نه'], ['yes', 'بله']]), S('mask', 'ماسک (فقط داخل نوار دیده شود)', 'yes', [['yes', 'بله'], ['no', 'نه']]),
      S('outDir', 'خروج در پایان', 'above', [['none', 'بدون خروج'], ['above', 'به بالا'], ['below', 'به پایین'], ['left', 'به چپ'], ['right', 'به راست']]),
      N('outDur', 'مدت خروج (ثانیه)', 0.4, 0.05, 4, 0.05), N('outStagger', 'فاصلهٔ زمانی خروج (ثانیه)', 0.025, 0, 1, 0.005)],
    code: p => `// حروف پله‌ای: هر حرف با کمی تأخیر نسبت به قبلی وارد می‌شود
const chars = [...${lit(p.text)}], font = ${fontOf(p)}, W8 = ${lit(p.weight)};
ctx.save(); ctx.direction = 'ltr'; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
ctx.font = W8 + ' 100px ' + font;
const adv = chars.map(ch => ctx.measureText(ch).width), tr = ${+p.track} * 100;
const tw = adv.reduce((a, b) => a + b, 0) + tr * Math.max(0, chars.length - 1);
const size = Math.min(e.h * ${+p.size}, e.w * 0.94 / Math.max(1, tw) * 100), k = size / 100;
ctx.font = W8 + ' ' + size + 'px ' + font;
${p.mask === 'yes' ? 'ctx.beginPath(); ctx.rect(-e.w, -size * 0.66, e.w * 2, size * 1.32); ctx.clip();' : ''}
const [fx, fy] = ${JSON.stringify(DIRS[p.dir] || DIRS.below)}, [gx, gy] = ${JSON.stringify(DIRS[p.outDir] || DIRS.none)};
const D = ${+p.dist} * size, n = chars.length, exitT = e.dur - ${+p.outDur} - ${+p.outStagger} * Math.max(0, n - 1);
let x = -tw * k / 2;
chars.forEach((ch, i) => {
  const u = e.ease(${lit(p.ease)}, (e.t - ${+p.delay} - i * ${+p.stagger}) / ${+p.inDur});
  const v = ${p.outDir === 'none' ? '0' : `e.ease('inExpo', (e.t - exitT - i * ${+p.outStagger}) / ${+p.outDur})`};
  ctx.globalAlpha = ${p.fade === 'yes' ? 'u * (1 - v)' : '1'};
  ctx.fillStyle = ${+p.accent} > 0 && i % ${+p.accent} === 0 ? e.c2 : e.c1;
  ctx.fillText(ch, x + (fx * (1 - u) + gx * v) * D, size * 0.36 + (fy * (1 - u) + gy * v) * D);
  x += (adv[i] + tr) * k;
});
ctx.restore();`,
  },
  squashText: {
    label: 'حروف کِشی', ic: '↕', box: 'full', cat: 'type',
    desc: 'هر حرف از یک خط صاف قد می‌کشد (پله‌ای)؛ با حرکت آرام افقی',
    params: [T('text', 'نوشته', 'SHAPE'), C('c1', 'رنگ', '#FFFFFF'), S('font', 'قلم', 'sans', FONTS2), S('weight', 'ضخامت', '700', WEIGHTS),
      N('size', 'اندازه (نسبت به ارتفاع)', 0.43, 0.01, 1.2, 0.005), N('track', 'فاصلهٔ حروف (نسبت به اندازه)', 0, -0.2, 1, 0.01),
      N('inDur', 'مدت باز شدن هر حرف (ثانیه)', 0.65, 0.05, 4, 0.05), N('stagger', 'فاصلهٔ زمانی حروف (ثانیه)', 0.06, 0, 1, 0.005),
      N('delay', 'تأخیر شروع (ثانیه)', 0.2, 0, 20, 0.05), N('drift', 'حرکت افقی در کل مدت (نسبت به عرض)', 0.094, -1, 1, 0.005),
      S('axis', 'جهت کش آمدن', 'y', [['y', 'عمودی'], ['x', 'افقی']]), S('ease', 'منحنی', 'outExpo', EASES)],
    code: p => `// حروف کشی: هر حرف از صفر قد می‌کشد
const chars = [...${lit(p.text)}], font = ${fontOf(p)}, W8 = ${lit(p.weight)};
ctx.save(); ctx.direction = 'ltr'; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
ctx.font = W8 + ' 100px ' + font;
const adv = chars.map(ch => ctx.measureText(ch).width), tr = ${+p.track} * 100;
const tw = adv.reduce((a, b) => a + b, 0) + tr * Math.max(0, chars.length - 1);
const size = Math.min(e.h * ${+p.size}, e.w * 0.94 / Math.max(1, tw) * 100), k = size / 100;
ctx.font = W8 + ' ' + size + 'px ' + font; ctx.fillStyle = e.c1;
const drift = e.w * ${+p.drift} * (0.5 - e.p);
let x = -tw * k / 2 + drift;
chars.forEach((ch, i) => {
  const u = e.ease(${lit(p.ease)}, (e.t - ${+p.delay} - i * ${+p.stagger}) / ${+p.inDur});
  const w = adv[i] * k;
  if (u > 0.001) { ctx.save(); ctx.translate(x + w / 2, 0); ctx.scale(${p.axis === 'x' ? 'u, 1' : '1, u'}); ctx.fillText(ch, -w / 2, size * 0.36); ctx.restore(); }
  x += (adv[i] + tr) * k;
});
ctx.restore();`,
  },
  typeOn: {
    label: 'تایپ با مکان‌نما', ic: '⌨', box: 'full', cat: 'type',
    desc: 'نوشته حرف‌به‌حرف تایپ می‌شود و مکان‌نما چشمک می‌زند',
    params: [T('text', 'نوشته', 'MOTION DESIGN — PORTFOLIO 2026'), C('c1', 'رنگ نوشته', '#FFFFFF'), C('c2', 'رنگ مکان‌نما', '#5E9FE8'),
      S('font', 'قلم', 'mono', FONTS2), N('size', 'اندازه (نسبت به ارتفاع)', 0.022, 0.005, 0.5, 0.001), N('track', 'فاصلهٔ حروف (نسبت به اندازه)', 0.25, -0.2, 2, 0.01),
      N('op', 'شفافیت', 0.75, 0, 1, 0.01), N('delay', 'شروع تایپ (ثانیه)', 0, 0, 20, 0.05), N('typeDur', 'مدت تایپ (ثانیه)', 0.45, 0.05, 20, 0.05),
      S('cursor', 'مکان‌نما', 'yes', [['yes', 'دارد'], ['no', 'ندارد']]), N('out', 'محو شدن در پایان (ثانیه، ۰ = نه)', 0.45, 0, 5, 0.05),
      S('align', 'چینش', 'center', [['center', 'وسط'], ['left', 'چپ'], ['right', 'راست']])],
    code: p => `// تایپ حرف‌به‌حرف + مکان‌نمای چشمک‌زن
const chars = [...${lit(p.text)}], font = ${fontOf(p)};
const size = e.h * ${+p.size}, tr = ${+p.track} * size;
ctx.save(); ctx.direction = 'ltr'; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; ctx.font = '400 ' + size + 'px ' + font;
const adv = chars.map(ch => ctx.measureText(ch).width), xs = [];
let tw = 0; for (const a of adv) { xs.push(tw); tw += a + tr; } tw -= tr;
const x0 = ${p.align === 'left' ? '-e.w / 2 + size' : p.align === 'right' ? 'e.w / 2 - size - tw' : '-tw / 2'};
const u = e.clamp((e.t - ${+p.delay}) / ${+p.typeDur}), n = Math.floor(chars.length * u);
const fade = ${+p.out} > 0 ? 1 - e.ease('inExpo', (e.t - (e.dur - ${+p.out})) / ${+p.out}) : 1;
ctx.globalAlpha = ${+p.op} * fade; ctx.fillStyle = e.c1;
for (let i = 0; i < n; i++) ctx.fillText(chars[i], x0 + xs[i], size * 0.36);
${p.cursor === 'yes' ? `if (n < chars.length && e.t > ${+p.delay} - 0.2 && Math.floor(e.t * 8) % 2 === 0) { ctx.globalAlpha = fade; ctx.fillStyle = e.c2; ctx.fillRect(x0 + (n < xs.length ? xs[n] : tw), -size * 0.62, size * 0.58, size); }` : ''}
ctx.restore();`,
  },
  scramble: {
    label: 'رمزگشایی حروف', ic: '🔣', box: 'full', cat: 'type',
    desc: 'حروف تصادفی یکی‌یکی به نوشتهٔ درست تبدیل می‌شوند (مثل رمزگشا)',
    params: [T('text', 'نوشته', '01 — INTRO'), C('c1', 'رنگ', '#FFFFFF'), S('font', 'قلم', 'mono', FONTS2),
      N('size', 'اندازه (نسبت به ارتفاع)', 0.017, 0.005, 0.5, 0.001), N('op', 'شفافیت', 0.85, 0, 1, 0.01),
      N('delay', 'شروع (ثانیه)', 0, 0, 20, 0.05), N('decodeDur', 'مدت رمزگشایی (ثانیه)', 0.3, 0.05, 10, 0.05),
      T('glyphs', 'حروف تصادفی', 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#%&/<>'), S('align', 'چینش', 'left', [['left', 'چپ'], ['center', 'وسط'], ['right', 'راست']])],
    code: p => `// رمزگشایی: حروفِ هنوز‌نرسیده تصادفی‌اند
const T = [...${lit(p.text)}], G = ${lit(p.glyphs)}, size = e.h * ${+p.size};
const keep = Math.floor(T.length * e.clamp((e.t - ${+p.delay}) / ${+p.decodeDur})), f = Math.floor(e.t * 30);
const s = T.map((ch, i) => (i < keep || ch === ' ' ? ch : G[Math.floor(e.random(f * 31 + i * 7.3) * G.length) % G.length])).join('');
ctx.save(); ctx.direction = 'ltr'; ctx.textBaseline = 'middle'; ctx.textAlign = ${lit(p.align)};
ctx.font = '400 ' + size + 'px ' + ${fontOf(p)}; ctx.fillStyle = e.c1; ctx.globalAlpha *= ${+p.op};
ctx.fillText(s, 0, 0);
ctx.restore();`,
  },
  sliceWords: {
    label: 'کلمه‌های برشی با جعبه', ic: '▤', box: 'full', cat: 'type',
    desc: 'کلمه‌ها پشت سر هم؛ هر کلمه در سه برش از دو طرف می‌لغزد و جعبهٔ رنگی پشتش باز می‌شود',
    params: [T('words', 'کلمه‌ها (با ویرگول جدا)', 'TIMING, SPACING, RHYTHM, STORY'), T('colors', 'رنگ جعبه‌ها (با ویرگول)', '#5E9FE8, #DF84A8, #EAC26B, #72BC8F'),
      C('c1', 'رنگ نوشته', '#111114'), S('font', 'قلم', 'sans', FONTS2), N('size', 'اندازه (نسبت به ارتفاع)', 0.23, 0.02, 1, 0.005),
      N('per', 'مدت هر کلمه (ثانیه)', 0.5, 0.1, 10, 0.05), T('label', 'نوشتهٔ کوچک بالا', 'THE ART OF'),
      S('counter', 'شمارنده (۰۱ / ۰۴)', 'yes', [['yes', 'دارد'], ['no', 'ندارد']]), N('slide', 'لغزش برش‌ها (نسبت به عرض)', 0.32, 0, 1, 0.01)],
    code: p => `// کلمه‌های برشی: سه نوار افقی از دو طرف می‌لغزند، جعبه پشتش باز می‌شود
const WS = ${lit(p.words)}.split(',').map(s => s.trim()).filter(Boolean), CS = ${lit(p.colors)}.split(',').map(s => s.trim()).filter(Boolean);
if (WS.length) {
const per = ${+p.per}, k = Math.min(Math.floor(e.t / per), WS.length - 1), wl = e.t - k * per, word = WS[k];
const size = e.h * ${+p.size}, font = ${fontOf(p)};
ctx.save(); ctx.direction = 'ltr'; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
ctx.font = '700 ' + size + 'px ' + font;
const m = ctx.measureText(word), bw = Math.min(e.w * 0.96, m.width + size * 0.56), bh = size * 1.2;
if (k < WS.length - 1) { const ex = e.ease('inExpo', (wl - per * 0.76) / (per * 0.24)); ctx.scale(1 + ex * 0.35, Math.max(0.001, 1 - ex)); }
const bp = e.ease('outExpo', wl / (per * 0.48));
ctx.fillStyle = CS.length ? CS[k % CS.length] : e.c2; ctx.fillRect(-bw / 2, -bh / 2, bw * bp, bh);
ctx.fillStyle = e.c1; ctx.fillRect(-bw / 2 + bw * bp - size * 0.04, -bh / 2, size * 0.04 * (1 - bp) + 0.5, bh);
for (let si = 0; si < 3; si++) {
  const sp = e.ease('outExpo', (wl - per * (0.06 + si * 0.07)) / (per * 0.58));
  ctx.save(); ctx.beginPath(); ctx.rect(-e.w, -bh / 2 + si * bh / 3, e.w * 2, bh / 3 + 1); ctx.clip();
  ctx.fillText(word, (1 - sp) * e.w * ${+p.slide} * (si % 2 ? -1 : 1), size * 0.36); ctx.restore();
}
ctx.font = '400 ' + size * 0.104 + 'px ui-monospace, Menlo, monospace'; ctx.textAlign = 'left';
ctx.globalAlpha = e.ease('outCubic', (wl - per * 0.2) / (per * 0.3));
ctx.fillText(${lit(p.label)}, -bw / 2, -bh / 2 - size * 0.1);
${p.counter === 'yes' ? `ctx.textAlign = 'right'; ctx.globalAlpha = 1; ctx.fillText('0' + (k + 1) + ' / 0' + WS.length, bw / 2, bh / 2 + size * 0.18);` : ''}
ctx.restore();
}`,
  },
  ringBurst: {
    label: 'حلقه‌های انفجاری', ic: '◎', box: 'full', cat: 'shapes',
    desc: 'چند حلقهٔ رنگی یک‌بار از مرکز باز و محو می‌شوند',
    params: [C('c1', 'رنگ ۱', '#5E9FE8'), C('c2', 'رنگ ۲', '#DF84A8'), C('c3', 'رنگ ۳', '#EAC26B'),
      N('n', 'تعداد حلقه', 3, 1, 8, 1), N('delay', 'شروع (ثانیه)', 0.38, 0, 20, 0.05), N('gap', 'فاصلهٔ زمانی حلقه‌ها', 0.08, 0, 1, 0.01),
      N('ringDur', 'مدت هر حلقه (ثانیه)', 0.92, 0.1, 5, 0.05), N('r', 'شعاع نهایی (نسبت به عرض)', 0.41, 0.05, 1.5, 0.01), N('lw', 'ضخامت اول', 12, 1, 60, 1)],
    code: p => `// حلقه‌های انفجاری: یک‌بار باز می‌شوند و نازک و محو
const cols = [e.c1, e.c2, ${lit(p.c3)}], s = e.w / 1920;
ctx.save();
for (let i = 0; i < ${+p.n}; i++) {
  const u = (e.t - ${+p.delay} - i * ${+p.gap}) / ${+p.ringDur};
  if (u <= 0 || u >= 1) continue;
  ctx.strokeStyle = cols[i % 3]; ctx.globalAlpha = 1 - u; ctx.lineWidth = (${+p.lw} + (0.5 - ${+p.lw}) * u) * s;
  ctx.beginPath(); ctx.arc(0, 0, (30 * s) + e.w * ${+p.r} * e.ease('outExpo', u), 0, e.TAU); ctx.stroke();
}
ctx.restore();`,
  },
  dotSphere: {
    label: 'کرهٔ نقطه‌ای سه‌بعدی', ic: '🌐', box: 'full', cat: 'shapes',
    desc: 'کره‌ای از نقطه‌ها که می‌چرخد، عمق دارد و می‌تواند به گره تبدیل شود؛ با حلقه‌های مداری',
    params: [C('c1', 'رنگ ۱', '#4FB9C9'), C('c2', 'رنگ ۲', '#DF84A8'), N('n', 'تعداد نقطه', 1400, 50, 4000, 10),
      N('r', 'شعاع (نسبت به ارتفاع)', 0.31, 0.05, 0.6, 0.01), N('spin', 'سرعت چرخش', 1.3, -5, 5, 0.05),
      N('morph', 'تبدیل به گره در ثانیهٔ (۰ = نه)', 0.65, 0, 30, 0.05), S('rings', 'حلقه‌های مداری', 'yes', [['yes', 'دارد'], ['no', 'ندارد']]),
      N('dot', 'درشتی نقطه', 1, 0.2, 4, 0.05)],
    code: p => `// کرهٔ نقطه‌ای: نقطه‌های فیبوناچی، چرخش + پرسپکتیو، رنگ بر اساس ارتفاع
const N = ${+p.n}, R = e.h * ${+p.r}, t = e.t, hex = c => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16));
const A = hex(e.c1), B = hex(e.c2);
const sc = e.ease('outBack', t / 0.55) * (1 - e.ease('inExpo', (t - (e.dur - 0.4)) / 0.4));
const ry = t * ${+p.spin}, rx = 0.35 + 0.25 * Math.sin(t * 1.7), cy = Math.cos(ry), sy = Math.sin(ry), cx = Math.cos(rx), sx = Math.sin(rx);
const rot = (x, y, z) => { const x2 = x * cy + z * sy, z2 = -x * sy + z * cy; return [x2, y * cx - z2 * sx, y * sx + z2 * cx]; };
ctx.save();
${p.rings === 'yes' ? `for (const [ri, tilt, rr] of [[0, 1.2, 1.58], [1, -0.6, 1.82]]) {
  ctx.beginPath();
  for (let i = 0; i <= 96; i++) { const a = i / 96 * e.TAU; const [x, y, z] = rot(Math.cos(a) * rr, Math.sin(a) * rr * Math.sin(tilt), Math.sin(a) * rr * Math.cos(tilt)); const k = 3.3 / (3.9 + z); i ? ctx.lineTo(x * R * k * sc, y * R * k * sc) : ctx.moveTo(x * R * k * sc, y * R * k * sc); }
  ctx.strokeStyle = ri ? e.c2 : e.c1; ctx.globalAlpha = 0.35; ctx.lineWidth = e.h / 680; ctx.stroke();
}` : ''}
const P = new Float32Array(N * 4), idx = new Array(N);
for (let i = 0; i < N; i++) {
  const ph = Math.acos(1 - 2 * (i + 0.5) / N), th = Math.PI * (1 + Math.sqrt(5)) * (i + 0.5);
  let x = Math.cos(th) * Math.sin(ph), y = Math.cos(ph), z = Math.sin(th) * Math.sin(ph);
  const m = ${+p.morph} > 0 ? e.ease('inOutCubic', (t - ${+p.morph} - i / N * 0.35) / 0.7) : 0;
  if (m > 0) { const u = (i + 0.5) / N * e.TAU, rk = Math.cos(3 * u) + 2.2; x += (rk * Math.cos(2 * u) / 2.9 - x) * m; y += (-Math.sin(3 * u) * 1.2 / 2.9 - y) * m; z += (rk * Math.sin(2 * u) / 2.9 - z) * m; }
  const [X, Y, Z] = rot(x, y, z); P[i * 4] = X; P[i * 4 + 1] = Y; P[i * 4 + 2] = Z; P[i * 4 + 3] = (Math.cos(ph) + 1) / 2; idx[i] = i;
}
idx.sort((a, b) => P[b * 4 + 2] - P[a * 4 + 2]);
for (const i of idx) {
  const z = P[i * 4 + 2], k = 3.3 / (3.9 + z), dn = e.clamp((z + 1.27) / 2.54), h = P[i * 4 + 3];
  ctx.globalAlpha = 0.35 + 0.65 * (1 - dn);
  ctx.fillStyle = 'rgb(' + A.map((v, j) => Math.round(v + (B[j] - v) * h)).join(',') + ')';
  ctx.beginPath(); ctx.arc(P[i * 4] * R * k * sc, P[i * 4 + 1] * R * k * sc, (5 - 3.7 * dn) * Math.max(sc, 0.3) * ${+p.dot} * e.h / 1080, 0, e.TAU); ctx.fill();
}
ctx.restore();`,
  },
  flowText: {
    label: 'جریان ذره‌ای نوشته (FLOW)', ic: '🌊', box: 'full', cat: 'type',
    desc: 'هزاران ذرهٔ رنگی با رد حرکت دور مرکز می‌چرخند، جمع می‌شوند و نوشته را می‌سازند، بعد به بیرون پرت می‌شوند — برای وسط یا آخر ویدیو',
    params: [T('text', 'نوشته', 'FLOW'), C('c1', 'رنگ ۱', '#4FB9C9'), C('c2', 'رنگ ۲', '#5E9FE8'), C('c3', 'رنگ ۳', '#BF8EDA'), C('c4', 'رنگ ۴', '#DF84A8'),
      S('font', 'قلم', 'sans', FONTS2), S('weight', 'ضخامت قلم', '700', WEIGHTS), N('size', 'اندازهٔ نوشته (نسبت به ارتفاع)', 0.46, 0.05, 1.2, 0.01),
      N('n', 'تعداد ذره', 1500, 100, 5000, 50), N('lw', 'ضخامت رد ذره', 4.4, 0.5, 12, 0.1), N('trail', 'طول رد (ثانیه)', 0.06, 0.01, 0.4, 0.01),
      N('swirl', 'شدت چرخش ورود', 2.6, 0, 6, 0.1), N('inAt', 'شروع جمع شدن (ثانیه)', 0.95, 0, 20, 0.05), N('gather', 'مدت جمع شدن (ثانیه)', 0.7, 0.05, 5, 0.05),
      N('outLen', 'انفجار پایانی (ثانیه، ۰ = نه)', 0.45, 0, 5, 0.05), S('bg', 'پس‌زمینهٔ خودش', 'no', [['no', 'ندارد (شفاف)'], ['yes', 'بنفش تیره مثل اصل']])],
    code: p => flowCode(p, 'reel'),
  },
  flowTitle: {
    label: 'عنوان ذره‌ای ریتمیک', ic: '🎵', box: 'full', cat: 'type',
    desc: 'برای اسم اول ویدیو: ذره‌ها می‌چرخند و اسم را می‌سازند، بعد اسم با هر ضرب جلو می‌آید و برمی‌گردد',
    params: [T('text', 'نوشته (اسم ویدیو)', 'SHOWREEL'), C('c1', 'رنگ ۱', '#4FB9C9'), C('c2', 'رنگ ۲', '#5E9FE8'), C('c3', 'رنگ ۳', '#BF8EDA'), C('c4', 'رنگ ۴', '#DF84A8'),
      S('font', 'قلم', 'sans', FONTS2), S('weight', 'ضخامت قلم', '700', WEIGHTS), N('size', 'اندازهٔ نوشته (نسبت به ارتفاع)', 0.3, 0.05, 1.2, 0.01),
      N('n', 'تعداد ذره', 1800, 100, 5000, 50), N('lw', 'ضخامت رد ذره', 3.6, 0.5, 12, 0.1), N('trail', 'طول رد (ثانیه)', 0.06, 0.01, 0.4, 0.01),
      N('amp', 'شدت حرکت با ضرب', 1, 0, 3, 0.05), S('beat', 'ریتم از', 'auto', [['auto', 'آهنگ پروژه (اگر نبود BPM)'], ['bpm', 'فقط BPM پایین']]), N('bpm', 'BPM', 120, 40, 240, 1),
      N('swirl', 'شدت چرخش ورود', 2.6, 0, 6, 0.1), N('inAt', 'شروع جمع شدن (ثانیه)', 0.3, 0, 20, 0.05), N('gather', 'مدت جمع شدن (ثانیه)', 0.8, 0.05, 5, 0.05),
      N('outLen', 'انفجار پایانی (ثانیه، ۰ = نه)', 0.45, 0, 5, 0.05), S('bg', 'پس‌زمینهٔ خودش', 'no', [['no', 'ندارد (شفاف)'], ['yes', 'بنفش تیره مثل اصل']])],
    code: p => flowCode(p, 'title'),
  },
  blinds: {
    label: 'پرده‌های کرکره‌ای', ic: '▥', box: 'full', cat: 'transition', tr: true,
    desc: 'نوارهای عمودی یکی‌یکی پایین می‌آیند و قاب را می‌پوشانند، بعد کنار می‌روند',
    params: [C('c1', 'رنگ', '#F2EFE9'), N('n', 'تعداد نوار', 12, 2, 40, 1)],
    code: p => `// کرکره: نیمهٔ اول می‌پوشاند، نیمهٔ دوم باز می‌کند
const n = ${+p.n}, bw = e.w / n; ctx.fillStyle = e.c1;
for (let i = 0; i < n; i++) {
  const q = e.p < 0.5 ? e.ease('inOutCubic', e.clamp(e.p * 2 * 1.6 - i / n * 0.6)) : 1 - e.ease('inOutCubic', e.clamp((e.p - 0.5) * 2 * 1.6 - i / n * 0.6));
  const y0 = e.p < 0.5 ? -e.h / 2 : e.h / 2 - e.h * q;
  ctx.fillRect(-e.w / 2 + i * bw - 1, y0, bw + 2, e.h * q);
}`,
  },
  clockWipe: {
    label: 'گذار عقربه‌ای', ic: '◔', box: 'full', cat: 'transition', tr: true,
    desc: 'مثل عقربهٔ ساعت دور می‌زند و قاب را می‌پوشاند و باز می‌کند',
    params: [C('c1', 'رنگ پوشش', '#0E1A2C'), C('c2', 'رنگ عقربه', '#72BC8F')],
    code: () => `// عقربه: نیمهٔ اول پوشش دور می‌زند، نیمهٔ دوم از همان جهت باز می‌شود
const R = Math.hypot(e.w, e.h), a0 = -Math.PI / 2, u = e.ease('inOutCubic', e.p < 0.5 ? e.p * 2 : (e.p - 0.5) * 2);
const s0 = e.p < 0.5 ? a0 : a0 + e.TAU * u, s1 = e.p < 0.5 ? a0 + e.TAU * u : a0 + e.TAU;
ctx.fillStyle = e.c1; ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, R, s0, s1); ctx.closePath(); ctx.fill();
const ah = e.p < 0.5 ? s1 : s0;
ctx.strokeStyle = e.c2; ctx.lineWidth = e.w / 240; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(ah) * R, Math.sin(ah) * R); ctx.stroke();`,
  },
  slashWipe: {
    label: 'گذار مورب', ic: '⟋', box: 'full', cat: 'transition', tr: true,
    desc: 'یک نوار مورب رنگی از چپ به راست رد می‌شود',
    params: [C('c1', 'رنگ', '#EAC26B'), C('c2', 'رنگ لبه', '#0A0A0D'), N('ang', 'کجی', 0.28, -1, 1, 0.01)],
    code: p => `// نوار مورب: لبهٔ جلو قاب را می‌پوشاند، لبهٔ عقب باز می‌کند
const u = e.ease('inOutCubic', e.p), k = e.h * ${+p.ang}, W2 = e.w / 2, H2 = e.h / 2, span = e.w + Math.abs(k) * 2;
const lead = -W2 - Math.abs(k) + u * 2 * span, tail = lead - span;
const band = (a, b, c) => { ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(a + k, -H2); ctx.lineTo(b + k, -H2); ctx.lineTo(b - k, H2); ctx.lineTo(a - k, H2); ctx.closePath(); ctx.fill(); };
band(tail, lead, e.c1); band(lead - e.w * 0.02, lead, e.c2);`,
  },
});

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
