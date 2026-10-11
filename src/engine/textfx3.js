import { W, H, C, S, SF } from './song.js';
import { clamp, ease, hash, hexToRgb } from './core.js';
import { place, modeFor } from './layout.js';
import { textFa, outlineTextFa, DRAW } from './draw.js';
import { applyOverrides } from './overrides.js';
import { FONTS, font } from './text.js';

/**
 * سبک‌های موشن‌گرافی شعر
 *
 * به‌جای ده‌ها تابع جدا، یک «موتور ترکیبی» داریم: هر سبک فقط یک
 * دستهٔ تنظیمات است (نوع ورود، تأکید روی کلمهٔ فعال، تزئین، سایه،
 * پالت، کجی، ضرب…). سبک‌های آماده (پاپ، هیپ‌هاپ، EDM، …) همین
 * تنظیمات‌اند و کاربر می‌تواند از روی هرکدام «سبک دلخواه» بسازد.
 * همه‌چیز تابع خالص زمان است (بدون Math.random) تا اسکراب نلرزد.
 */

/* ── تنظیمات قابل انتخاب (برای سازندهٔ سبک) ───────────────── */
export const MIX_OPTS = [
  { k: 'bg', label: 'پس‌زمینهٔ ویدیو', ch: [
    ['none', 'بدون (پس‌زمینهٔ معمول)'], ['grad', 'گرادیان زنده'], ['blobs', 'لکه‌های رنگی'], ['sunburst', 'پرتوهای چرخان'],
    ['synth', 'سینت‌ویو'], ['lasers', 'لیزر'], ['bokeh', 'بوکه'], ['halftone', 'نقطه‌های کمیک'], ['stripes', 'راه‌راه'],
    ['stars', 'پرواز در ستاره‌ها'], ['vhs', 'نوار VHS'], ['paper', 'کاغذ روشن'], ['aurora', 'شفق'], ['embers', 'آتش و جرقه']] },
  { k: 'bgA', label: 'رنگ ۱ پس‌زمینه', color: true },
  { k: 'bgB', label: 'رنگ ۲ پس‌زمینه', color: true },
  { k: 'enter', label: 'ورود کلمه', ch: [
    ['pop', 'پاپ فنری'], ['rise', 'بالا آمدن'], ['drop', 'افتادن'], ['slide', 'سُر از کنار'],
    ['zoom', 'زوم از جلو'], ['blur', 'از تاری'], ['spin', 'چرخشی'], ['flip', 'ورق خوردن'],
    ['type', 'تایپ'], ['stretch', 'کش‌سان'], ['glitch', 'گلیچ'], ['none', 'بدون حرکت']] },
  { k: 'reveal', label: 'زمان ورود', ch: [['timed', 'هر کلمه سر وقت خودش'], ['all', 'کل خط با هم']] },
  { k: 'layout', label: 'چیدمان', ch: [['line', 'خط معمولی'], ['big', 'درشت (کرس)'], ['solo', 'تک‌کلمهٔ غول‌پیکر']] },
  { k: 'emph', label: 'کلمهٔ فعال', ch: [
    ['color', 'رنگی شود'], ['scale', 'بزرگ شود'], ['glow', 'بدرخشد'], ['box', 'جعبهٔ رنگی'],
    ['marker', 'ماژیک هایلایت'], ['underline', 'خط زیر'], ['bounce', 'بپرد'], ['outline', 'تو‌خالی ← پر'], ['none', 'هیچ']] },
  { k: 'deco', label: 'تزئین', ch: [
    ['none', 'بدون'], ['pill', 'کپسول پشت خط'], ['sticker', 'استیکر هر کلمه'], ['bars', 'خط‌های بالا و پایین'],
    ['burst', 'پرتو روی ضرب کلمه'], ['ring', 'موج دایره'], ['confetti', 'کاغذرنگی'], ['brackets', 'گوشه‌های قاب']] },
  { k: 'shadow', label: 'سایه', ch: [['none', 'بدون'], ['hard', 'سایهٔ تخت (پاپ‌آرت)'], ['soft', 'نرم'], ['long', 'بلند'], ['neon', 'نئون']] },
  { k: 'palette', label: 'پالت', ch: [
    ['mono', 'سفید + رنگ تأکید'], ['rainbow', 'رنگین‌کمان'], ['sunset', 'غروب'], ['candy', 'آب‌نباتی'],
    ['ice', 'یخی'], ['gold', 'طلایی'], ['custom', 'رنگ‌های خودم']] },
  { k: 'exit', label: 'خروج خط', ch: [['fade', 'محو'], ['up', 'رفتن بالا'], ['down', 'افتادن'], ['zoom', 'زوم'], ['blur', 'تار شدن'], ['scatter', 'پخش شدن']] },
  { k: 'text', label: 'رنگ متن', color: true },
  { k: 'hi', label: 'رنگ تأکید', color: true, note: 'خالی = رنگ تأکید بخش' },
  { k: 'box', label: 'رنگ جعبه/کپسول', color: true },
  { k: 'tilt', label: 'کجی', min: -14, max: 14, step: 1, unit: '°' },
  { k: 'beat', label: 'تپش با ضرب', min: 0, max: 2, step: 0.1 },
  { k: 'speed', label: 'سرعت ورود', min: 0.4, max: 2.5, step: 0.1 },
  { k: 'size', label: 'اندازه', min: 0.6, max: 1.6, step: 0.05 },
  { k: 'ghost', label: 'پیدایی کلمه‌های نخوانده', min: 0, max: 1, step: 0.05 },
];

export const MIX_DEFAULT = {
  enter: 'pop', reveal: 'timed', layout: 'line', emph: 'color', deco: 'none', shadow: 'none',
  palette: 'mono', exit: 'fade', text: '#F6F3EC', hi: '', box: '#F6F3EC',
  tilt: 0, beat: 0.6, speed: 1, size: 1, ghost: 0.35,
  bg: 'none', bgA: '#120A24', bgB: '#FF2E97',
};

/* ── سبک‌های آماده ──────────────────────────────────────────── */
const P = (id, name, desc, o) => ({ id, name, desc, o: { ...MIX_DEFAULT, ...o } });
export const MG_PRESETS = [
  P('mg_pop', 'پاپ استیکری', 'کلمه‌ها مثل استیکر فنری می‌پرند، سایهٔ تخت',
    { enter: 'pop', deco: 'sticker', shadow: 'hard', text: '#141414', box: '#FFF6E0', tilt: -4, emph: 'scale', palette: 'mono', beat: 0.8 }),
  P('mg_candy', 'پاپ آب‌نباتی', 'هر کلمه یک رنگ، ورود فنری و کاغذرنگی',
    { enter: 'pop', palette: 'candy', deco: 'confetti', shadow: 'hard', emph: 'bounce', layout: 'big', beat: 1 }),
  P('mg_karaoke', 'کپسول کارائوکه', 'خط داخل کپسول، کلمهٔ خوانده‌شده رنگی',
    { enter: 'rise', reveal: 'all', deco: 'pill', box: '#16161C', emph: 'box', ghost: 0.5, beat: 0.3 }),
  P('mg_kinetic', 'تایپوگرافی جنبشی', 'یک کلمهٔ غول‌پیکر در هر لحظه، ضربه‌ای',
    { enter: 'zoom', layout: 'solo', emph: 'none', shadow: 'long', beat: 1.4, speed: 1.6 }),
  P('mg_hiphop', 'هیپ‌هاپ', 'کج، سنگین، سایهٔ تخت قرمز و لرزش روی ضرب',
    { enter: 'drop', layout: 'big', shadow: 'hard', emph: 'marker', tilt: -7, beat: 1.6, exit: 'down' }),
  P('mg_edm', 'EDM انفجاری', 'زوم ضربه‌ای با پرتوهای نور روی هر کلمه',
    { enter: 'zoom', deco: 'burst', shadow: 'neon', emph: 'glow', palette: 'ice', beat: 1.8, exit: 'zoom', speed: 1.4 }),
  P('mg_ballad', 'بالاد عاشقانه', 'آرام، از تاری، درخشش نرم',
    { enter: 'blur', reveal: 'all', emph: 'glow', shadow: 'soft', palette: 'gold', beat: 0.1, speed: 0.6, exit: 'blur', ghost: 0.3 }),
  P('mg_neonretro', 'نئون دهه هشتاد', 'رنگین‌کمان نئونی با خط‌های بالا و پایین',
    { enter: 'flip', deco: 'bars', shadow: 'neon', palette: 'rainbow', emph: 'scale', beat: 0.8 }),
  P('mg_comic', 'کمیک', 'تو‌خالی که پر می‌شود، پرتو و کجی',
    { enter: 'pop', emph: 'outline', deco: 'burst', shadow: 'hard', tilt: 5, palette: 'sunset', layout: 'big' }),
  P('mg_glitch', 'گلیچ دیجیتال', 'ورود با پارگی رنگ‌ها و خروج پخش‌شونده',
    { enter: 'glitch', deco: 'brackets', emph: 'color', exit: 'scatter', beat: 1.1, speed: 1.3 }),
  P('mg_type', 'ماشین تحریر', 'کلمه‌ها تایپ می‌شوند، خط زیر کلمهٔ فعال',
    { enter: 'type', emph: 'underline', deco: 'none', beat: 0, ghost: 0, speed: 1.2 }),
  P('mg_bubble', 'حباب', 'کلمه‌ها کش‌سان در حباب می‌آیند و موج دایره می‌زنند',
    { enter: 'stretch', deco: 'ring', palette: 'candy', emph: 'scale', beat: 0.9 }),
  P('mg_sunset', 'غروب سینمایی', 'گرم و آرام، بالا آمدن نرم با هایلایت',
    { enter: 'rise', reveal: 'all', palette: 'sunset', emph: 'marker', shadow: 'soft', speed: 0.8, beat: 0.2, exit: 'up' }),
  P('mg_spin', 'گردباد', 'کلمه‌ها چرخان وارد می‌شوند و پخش می‌شوند',
    { enter: 'spin', emph: 'bounce', palette: 'rainbow', exit: 'scatter', beat: 0.7 }),
];

/* استایل‌های کامل ویدیو: پس‌زمینه + رنگ + حرکت شعر با هم */
export const VIDEO_PRESETS = [
  P('vs_poppink', 'پاپ صورتی', 'لکه‌های رنگی صورتی و بنفش، کلمه‌های فنری سفید',
    { bg: 'blobs', bgA: '#FF4FA3', bgB: '#7B2FF7', enter: 'pop', emph: 'scale', shadow: 'hard', text: '#FFFFFF', hi: '#FFE14F', beat: 0.9 }),
  P('vs_synth', 'سینت‌ویو', 'خورشید و شبکهٔ نئونی دهه هشتاد',
    { bg: 'synth', bgA: '#1B0636', bgB: '#FF2E97', enter: 'flip', shadow: 'neon', palette: 'ice', hi: '#00F0FF', emph: 'glow', deco: 'bars', beat: 0.8 }),
  P('vs_street', 'خیابانی', 'راه‌راه زرد و مشکی، هایلایت و کجی هیپ‌هاپ',
    { bg: 'stripes', bgA: '#111111', bgB: '#FFD400', enter: 'drop', emph: 'marker', hi: '#FFD400', shadow: 'hard', tilt: -6, layout: 'big', beat: 1.5, exit: 'down' }),
  P('vs_laser', 'لیزر EDM', 'پرتوهای لیزر روی ضرب، زوم انفجاری',
    { bg: 'lasers', bgA: '#05010F', bgB: '#00F0FF', enter: 'zoom', deco: 'burst', shadow: 'neon', emph: 'glow', palette: 'ice', hi: '#00F0FF', beat: 1.8, speed: 1.4, exit: 'zoom' }),
  P('vs_comic', 'کمیک پاپ‌آرت', 'پرتوهای زرد و نارنجی، استیکر و سایهٔ تخت',
    { bg: 'sunburst', bgA: '#FFD400', bgB: '#FF7A00', enter: 'pop', deco: 'sticker', shadow: 'hard', text: '#141414', box: '#FFFFFF', hi: '#E4142A', tilt: -3, emph: 'scale' }),
  P('vs_dream', 'رؤیایی', 'بوکهٔ صورتی محو و کلمه‌هایی که از تاری می‌آیند',
    { bg: 'bokeh', bgA: '#1A1033', bgB: '#FFB3C7', hi: '#FFB3C7', enter: 'blur', reveal: 'all', emph: 'glow', shadow: 'soft', palette: 'gold', speed: 0.6, beat: 0.1, exit: 'blur' }),
  P('vs_vhs', 'VHS رترو', 'نوار ویدیویی قدیمی با خط‌های اسکن و گلیچ',
    { bg: 'vhs', bgA: '#0B0B12', bgB: '#3BFFB4', enter: 'glitch', deco: 'brackets', emph: 'color', hi: '#3BFFB4', exit: 'scatter', beat: 1 }),
  P('vs_paper', 'مینیمال کاغذی', 'زمینهٔ روشن، تایپ مشکی و خط زیر قرمز',
    { bg: 'paper', bgA: '#F2EEE6', bgB: '#E4142A', enter: 'type', emph: 'underline', text: '#151515', hi: '#E4142A', ghost: 0, beat: 0 }),
  P('vs_space', 'کهکشان', 'پرواز در میان ستاره‌ها، درخشش یخی',
    { bg: 'stars', bgA: '#02010A', bgB: '#3A1C71', enter: 'rise', emph: 'glow', palette: 'ice', hi: '#9BE7FF', shadow: 'soft', beat: 0.6 }),
  P('vs_aurora', 'شفق قطبی', 'نوارهای سبز و بنفش روان، آرام و سینمایی',
    { bg: 'aurora', bgA: '#020814', bgB: '#00FFA3', enter: 'blur', reveal: 'all', emph: 'scale', hi: '#B9FFE6', shadow: 'soft', speed: 0.7, beat: 0.2, exit: 'up' }),
  P('vs_candy', 'آب‌نباتی', 'نقطه‌های صورتی کمیک، کلمه‌های رنگارنگ پرشی',
    { bg: 'halftone', bgA: '#FFD6EA', bgB: '#FF5FA8', enter: 'stretch', palette: 'candy', shadow: 'hard', emph: 'bounce', deco: 'confetti', layout: 'big', beat: 1 }),
  P('vs_fire', 'آتشین', 'گرادیان گدازه و جرقه‌های بالارونده',
    { bg: 'embers', bgA: '#1A0300', bgB: '#FF4D00', enter: 'rise', emph: 'glow', palette: 'sunset', hi: '#FFC371', shadow: 'soft', beat: 1.1, exit: 'up' }),
];
MG_PRESETS.push(...VIDEO_PRESETS);
export const MG_LABELS = Object.fromEntries(MG_PRESETS.map(p => [p.id, p.name]));

/* ── سبک‌های دلخواه کاربر (ثبت سراسری، تا پیش‌نمایش و خروجی هم ببینند) ── */
export const MIX = new Map();
export function setMixes(list) {
  MIX.clear();
  for (const m of list || []) if (m?.id) MIX.set(String(m.id), { ...m, o: { ...MIX_DEFAULT, ...(m.o || {}) } });
}
export const mixOf = style => {
  const s = String(style || '');
  if (s.startsWith('mx:')) return MIX.get(s.slice(3))?.o || null;
  return MG_PRESETS.find(p => p.id === s)?.o || null;
};
/** تابع رسم برای یک سبک «mx:…» (یا null) */
export function mixFn(style) {
  const o = String(style || '').startsWith('mx:') ? mixOf(style) : null;
  return o ? (c, s, t, a, k, ov) => drawMix(c, s, t, a, k, ov, o) : null;
}
/** حالت چیدمان برای انتخاب کلمه با انگشت */
export const mixMode = style => (mixOf(style)?.layout === 'big' ? 'chorus' : 'pre');

/* ── رنگ ────────────────────────────────────────────────────── */
const hx = n => Math.round(clamp(n, 0, 255)).toString(16).padStart(2, '0');
function hsl(h, s, l) {
  h = ((h % 360) + 360) % 360; s /= 100; l /= 100;
  const k = n => (n + h / 30) % 12, a = s * Math.min(l, 1 - l);
  const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return '#' + hx(f(0) * 255) + hx(f(8) * 255) + hx(f(4) * 255);
}
const mix2 = (a, b, t) => { const A = hexToRgb(a), B = hexToRgb(b); return '#' + A.map((v, i) => hx(v + (B[i] - v) * t)).join(''); };
const lum = h => { const [r, g, b] = hexToRgb(h); return (0.299 * r + 0.587 * g + 0.114 * b) / 255; };
const okHex = s => typeof s === 'string' && /^#[0-9a-f]{3,6}$/i.test(s);
const CANDY = ['#FF4FA3', '#4FD1FF', '#FFE14F', '#7CFF6B', '#B98CFF'];
function wordColor(o, i, n, t, acc) {
  switch (o.palette) {
    case 'rainbow': return hsl(i * 47 + t * 40, 90, 64);
    case 'sunset': return mix2('#FF5F6D', '#FFC371', n > 1 ? i / (n - 1) : 0);
    case 'candy': return CANDY[i % CANDY.length];
    case 'ice': return i % 2 ? '#BFF0FF' : '#FFFFFF';
    case 'gold': return mix2('#FFD36B', '#FFF3C4', (Math.sin(t * 2 + i) + 1) / 2);
    default: return okHex(o.text) ? o.text : C.BONE;
  }
}

/* ── کمک‌تابع‌های رسم ─────────────────────────────────────── */
function rrect(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
  else { ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
}
const fillA = (ctx, col, a) => { ctx.globalAlpha = clamp(a); ctx.fillStyle = col; ctx.fill(); ctx.globalAlpha = 1; };

/** کلمه با سایهٔ انتخابی، دور (0,0) */
function word(ctx, s, size, col, a, o, acc, outline = false) {
  if (a <= 0.01) return;
  const sc = S();
  if (o.shadow === 'hard') textFa(ctx, s, 6 * sc * (size / 90), 6 * sc * (size / 90), size, okHex(o.hi) ? '#000000' : mix2(acc, '#000000', 0.35), a * 0.95);
  else if (o.shadow === 'long') {
    for (let k = 10; k >= 1; k--) textFa(ctx, s, k * 2.2 * sc, k * 2.2 * sc, size, '#000000', a * 0.09);
  }
  ctx.save();
  if (o.shadow === 'soft') { ctx.shadowColor = 'rgba(0,0,0,.65)'; ctx.shadowBlur = 22 * sc; ctx.shadowOffsetY = 6 * sc; }
  if (o.shadow === 'neon') { ctx.shadowColor = col; ctx.shadowBlur = 26 * sc; }
  if (outline) outlineTextFa(ctx, s, 0, 0, size, col, a, FONTS.black, Math.max(2, size * 0.035));
  else {
    textFa(ctx, s, 0, 0, size, col, a);
    if (o.shadow === 'neon') textFa(ctx, s, 0, 0, size, '#FFFFFF', a * 0.55);
  }
  ctx.restore();
}

/** حالت ورود: k از ۰ تا ۱ → جابه‌جایی، مقیاس، چرخش، شفافیت */
function enterT(o, k, it, i, t) {
  const r = { dx: 0, dy: 0, sx: 1, sy: 1, rot: 0, a: 1, blur: 0, clip: 1, rgb: 0 };
  if (k >= 1) return r;
  const e = Math.max(0, k);
  switch (o.enter) {
    case 'pop': { const s = ease.outBack(e) * (1 + 0.25 * Math.sin(e * Math.PI) ); r.sx = r.sy = Math.max(0, s); r.a = clamp(e * 4); break; }
    case 'rise': r.dy = (1 - ease.outCubic(e)) * it.size * 1.1; r.a = e; break;
    case 'drop': r.dy = -(1 - ease.outBack(e)) * H * 0.25; r.a = clamp(e * 2); break;
    case 'slide': r.dx = (1 - ease.outQuart(e)) * W * 0.3; r.a = e; break;
    case 'zoom': r.sx = r.sy = 1 + (1 - ease.outExpo(e)) * 2.6; r.a = clamp(e * 1.6); break;
    case 'blur': r.blur = (1 - e) * 16; r.sx = r.sy = 1 + (1 - e) * 0.12; r.a = e; break;
    case 'spin': { const b = ease.outBack(e); r.rot = (1 - b) * -1.6; r.sx = r.sy = Math.max(0, b); r.a = clamp(e * 3); break; }
    case 'flip': r.sy = Math.max(0.02, Math.sin(ease.outCubic(e) * Math.PI / 2)); r.a = clamp(e * 3); break;
    case 'type': r.clip = e; break;
    case 'stretch': { const b = ease.outElastic(e); r.sx = 0.25 + 0.75 * b; r.sy = 1.7 - 0.7 * b; r.a = clamp(e * 4); break; }
    case 'glitch': {
      const f = Math.floor(t * 30);
      r.dx = (hash(f + i * 7) - 0.5) * it.size * 0.6 * (1 - e);
      r.a = hash(f * 3 + i) < 0.25 + e * 0.75 ? 1 : 0.15;
      r.rgb = (1 - e) * it.size * 0.12; break;
    }
    default: r.a = e > 0 ? 1 : 0;
  }
  return r;
}

/** خروج خط: k از ۰ تا ۱ */
function exitT(o, k, i, it) {
  const r = { dx: 0, dy: 0, s: 1, a: 1 - k, blur: 0 };
  if (k <= 0) return r;
  const e = ease.inCubic ? ease.inCubic(k) : k * k * k;
  switch (o.exit) {
    case 'up': r.dy = -e * it.size * 1.4; break;
    case 'down': r.dy = e * H * 0.25; break;
    case 'zoom': r.s = 1 + e * 1.8; break;
    case 'blur': r.blur = k * 14; break;
    case 'scatter': {
      const an = hash(i * 13.7) * Math.PI * 2;
      r.dx = Math.cos(an) * e * W * 0.35; r.dy = Math.sin(an) * e * H * 0.35; r.s = 1 - 0.4 * e; break;
    }
  }
  return r;
}

/* ── تزئین‌های لحظهٔ ضرب کلمه ─────────────────────────────── */
function decoHit(ctx, o, it, dt, col, i) {
  if (dt < 0 || dt > 0.9) return;
  const sc = S(), z = it.size;
  if (o.deco === 'burst') {
    const k = ease.outCubic(clamp(dt / 0.45)), a = 1 - clamp(dt / 0.55);
    ctx.save(); ctx.strokeStyle = col; ctx.globalAlpha = a; ctx.lineWidth = 5 * sc; ctx.lineCap = 'round';
    for (let j = 0; j < 12; j++) {
      const an = (j / 12) * Math.PI * 2 + i;
      const r0 = (it.w / 2 + z * 0.2) * (0.8 + 0.5 * k), r1 = r0 + z * 0.5 * (1 - k * 0.5);
      ctx.beginPath(); ctx.moveTo(Math.cos(an) * r0, Math.sin(an) * r0 * 0.6); ctx.lineTo(Math.cos(an) * r1, Math.sin(an) * r1 * 0.6); ctx.stroke();
    }
    ctx.restore();
  } else if (o.deco === 'ring') {
    const k = ease.outCubic(clamp(dt / 0.7));
    ctx.save(); ctx.strokeStyle = col; ctx.globalAlpha = (1 - k) * 0.9; ctx.lineWidth = 4 * sc * (1 - k) + 1;
    ctx.beginPath(); ctx.ellipse(0, 0, (it.w / 2 + z * 0.3) * (0.6 + k), z * (0.6 + k * 0.9), 0, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
  } else if (o.deco === 'confetti') {
    ctx.save();
    for (let j = 0; j < 14; j++) {
      const h1 = hash(i * 31 + j), h2 = hash(i * 17 + j * 3.1);
      const an = -Math.PI / 2 + (h1 - 0.5) * 2.6, sp = z * (2 + h2 * 3);
      const x = Math.cos(an) * sp * dt, y = Math.sin(an) * sp * dt + 0.5 * z * 9 * dt * dt;
      ctx.globalAlpha = 1 - clamp(dt / 0.9);
      ctx.fillStyle = CANDY[j % CANDY.length];
      ctx.save(); ctx.translate(x, y); ctx.rotate(dt * 12 * (h1 - 0.5) + j);
      ctx.fillRect(-z * 0.06, -z * 0.03, z * 0.12, z * 0.06); ctx.restore();
    }
    ctx.restore();
  } else if (o.deco === 'brackets') {
    const k = ease.outBack(clamp(dt / 0.3)), a = dt < 0.6 ? 1 : 1 - clamp((dt - 0.6) / 0.3);
    const hw = it.w / 2 + z * 0.25 + (1 - k) * z * 0.5, hh = z * 0.62 + (1 - k) * z * 0.3, L = z * 0.22;
    ctx.save(); ctx.strokeStyle = col; ctx.globalAlpha = a; ctx.lineWidth = 4 * sc;
    for (const [sx, sy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
      ctx.beginPath(); ctx.moveTo(sx * hw, sy * (hh - L)); ctx.lineTo(sx * hw, sy * hh); ctx.lineTo(sx * (hw - L), sy * hh); ctx.stroke();
    }
    ctx.restore();
  }
}

/* ── موتور اصلی ─────────────────────────────────────────────── */
export function drawMix(ctx, song, t, acc, kick, ov, o0) {
  const o = { ...MIX_DEFAULT, ...o0 };
  if (DRAW.noGhost) o.ghost = 0;
  const cur = song.activeLine(t);
  if (cur < 0) return;
  const L = song.lines[cur];
  const t0 = song.lineStart(cur), t1 = song.lineOut(cur);
  const spd = Math.max(0.2, +o.speed || 1);
  if (t < t0 - 0.6 || t > t1 + 0.5) return;
  const hi = okHex(o.hi) ? o.hi : acc;
  const exK = clamp((t - t1) / 0.38);
  const sc = S();

  let list = applyOverrides(place(ctx, L, modeFor(L, o.layout === 'big' ? 'chorus' : 'pre')), ov);
  if (!list.length) return;
  let ai = -1;
  for (let i = list.length - 1; i >= 0; i--) if (t >= list[i].t) { ai = i; break; }

  // تک‌کلمهٔ غول‌پیکر: فقط کلمهٔ فعال، وسط قاب
  if (o.layout === 'solo') {
    const i = Math.max(0, ai);
    const it0 = list[i];
    ctx.save(); ctx.font = font(100, FONTS.black);
    const w100 = Math.max(1, ctx.measureText(it0.word).width); ctx.restore();
    const size = Math.min(SF() * 300 * o.size, (W * 0.84 / w100) * 100);
    list = [{ ...it0, cx: W / 2, cy: H / 2, size, w: w100 * size / 100 }];
    list.idx = [i];
  }
  const idx = list.idx || list.map((_, i) => i);
  const n = song.lines[cur].words.length;

  // ترنسفرم کل خط: اندازه، کجی، تپش
  ctx.save();
  const pulse = 1 + 0.05 * (+o.beat || 0) * kick;
  ctx.translate(W / 2, H / 2);
  ctx.rotate((+o.tilt || 0) * Math.PI / 180);
  const sz = o.layout === 'solo' ? 1 : (+o.size || 1);
  ctx.scale(sz * pulse, sz * pulse);
  if (o.beat > 1.2 && kick > 0.05) ctx.translate((hash(Math.floor(t * 40)) - 0.5) * kick * 10 * sc * (o.beat - 1.2), 0);
  ctx.translate(-W / 2, -H / 2);

  // زمان ورود هر کلمه
  const wt = (it, j) => o.reveal === 'all' ? t0 - 0.25 + j * 0.05 : it.t - 0.12 / spd;
  const dur = 0.36 / spd;

  // کپسول پشت خط / خط‌های بالا و پایین
  if ((o.deco === 'pill' || o.deco === 'bars') && o.layout !== 'solo') {
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9, any = false;
    list.forEach((it, j) => {
      if (t < wt(it, j)) return; any = true;
      x0 = Math.min(x0, it.cx - it.w / 2); x1 = Math.max(x1, it.cx + it.w / 2);
      y0 = Math.min(y0, it.cy - it.size * 0.62); y1 = Math.max(y1, it.cy + it.size * 0.62);
    });
    if (any) {
      const k = ease.outBack(clamp((t - t0 + 0.3) / 0.4)) * (1 - exK);
      const pad = list[0].size * 0.42, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
      const w = (x1 - x0 + pad * 2) * Math.max(0, k), h = y1 - y0 + pad * 0.9;
      if (o.deco === 'pill') {
        rrect(ctx, cx - w / 2, cy - h / 2, w, h, h / 2);
        fillA(ctx, okHex(o.box) ? o.box : '#16161C', 0.82 * clamp(k));
      } else {
        ctx.save(); ctx.strokeStyle = hi; ctx.lineWidth = 5 * sc; ctx.globalAlpha = clamp(k);
        for (const y of [cy - h / 2 - pad * 0.3, cy + h / 2 + pad * 0.3]) { ctx.beginPath(); ctx.moveTo(cx - w / 2, y); ctx.lineTo(cx + w / 2, y); ctx.stroke(); }
        ctx.restore();
      }
    }
  }

  list.forEach((it, j) => {
    const i = idx[j];
    const k = (t - wt(it, i)) / dur;
    if (k <= 0 && (o.reveal === 'timed' || o.ghost <= 0)) {
      if (o.reveal === 'timed' && o.ghost > 0 && o.layout !== 'solo' && o.enter !== 'type') {
        // پیش‌نمایش کم‌رنگ کلمه‌های بعدی
        ctx.save(); ctx.translate(it.cx, it.cy);
        textFa(ctx, it.word, 0, 0, it.size, C.GHOST, o.ghost * 0.8 * clamp((t - t0 + 0.5) / 0.3) * (1 - exK));
        ctx.restore();
      }
      return;
    }
    const en = enterT(o, clamp(k), it, i, t);
    const ex = exitT(o, exK, i, it);
    const sung = t >= it.t;
    const active = i === ai;
    const heat = sung ? Math.exp(-(t - it.t) * 5) : 0;
    let col = wordColor(o, i, n, t, acc);
    if (it.key && sung) col = hi;
    if (o.emph === 'color' && sung && (active || o.palette === 'mono')) col = active ? hi : col;
    // کلمهٔ نخوانده در حالت «کل خط با هم» کم‌رنگ است؛ در حالت «سر وقت» تازه دارد می‌آید
    if (!sung && o.reveal === 'all' && o.ghost <= 0) return;
    let a = en.a * ex.a * (sung || o.reveal === 'timed' ? 1 : Math.max(0.12, o.ghost));

    ctx.save();
    ctx.translate(it.cx + en.dx + ex.dx, it.cy + en.dy + ex.dy);
    let s = ex.s;
    if (o.emph === 'scale') s *= active ? 1 + 0.18 * clamp((t - it.t) / 0.15) : (sung ? 0.94 : 0.9);
    if (o.emph === 'bounce' && active) ctx.translate(0, -Math.abs(Math.sin((t - it.t) * 9)) * it.size * 0.18 * Math.exp(-(t - it.t) * 2.5));
    if (o.deco === 'sticker') ctx.rotate(((i % 2 ? 1 : -1) * (3 + (Math.abs(+o.tilt) || 2) * 0.4)) * Math.PI / 180);
    ctx.rotate(en.rot);
    ctx.scale(s * en.sx, s * en.sy);

    // تزئین ضرب کلمه (پشت متن)
    if (sung) decoHit(ctx, o, it, t - it.t, hi, i);

    // استیکر
    if (o.deco === 'sticker') {
      const pw = it.w + it.size * 0.3, ph = it.size * 1.18;
      if (o.shadow === 'hard') { rrect(ctx, -pw / 2 + 7 * sc, -ph / 2 + 7 * sc, pw, ph, it.size * 0.22); fillA(ctx, '#000000', a * 0.85); }
      rrect(ctx, -pw / 2, -ph / 2, pw, ph, it.size * 0.22);
      fillA(ctx, sung && active ? hi : (okHex(o.box) ? o.box : '#FFFFFF'), a);
      // روی استیکر: متن تیره، روی استیکر رنگی فعال: سفید
      col = sung && active ? '#FFFFFF' : (o.palette === 'mono' ? (okHex(o.text) ? o.text : '#141414') : col);
    }
    // جعبهٔ کلمهٔ فعال
    if (o.emph === 'box' && sung) {
      const kk = ease.outBack(clamp((t - it.t) / 0.22));
      const pw = (it.w + it.size * 0.36) * kk, ph = it.size * 1.12;
      rrect(ctx, -pw / 2, -ph / 2, pw, ph, it.size * 0.2);
      fillA(ctx, hi, a * (active ? 1 : 0.55));
      col = active ? C.BG : col;
    }
    // متن رنگ تأکید روی ماژیک رنگ تأکید دیده نمی‌شود
    if (o.emph === 'marker' && sung && (col === hi || lum(hi) > 0.55)) col = lum(hi) > 0.55 ? '#111111' : C.BONE;
    if (o.emph === 'box' && sung && col === hi) col = C.BONE;
    // ماژیک
    if (o.emph === 'marker' && sung) {
      const kk = ease.outCubic(clamp((t - it.t) / 0.25));
      const pw = (it.w + it.size * 0.2), ph = it.size * 0.5;
      const y0 = it.size * 0.02;
      ctx.save(); ctx.beginPath(); ctx.rect(pw / 2 - pw * kk, y0 - ph * 0.2, pw * kk, ph * 1.4); ctx.clip();
      ctx.rotate(-0.025); rrect(ctx, -pw / 2, y0, pw, ph, ph * 0.3); fillA(ctx, hi, a * 0.8); ctx.restore();
    }
    // گلیچ: کانال‌های رنگی جابه‌جا
    if (en.rgb > 0.5) {
      textFa(ctx, it.word, -en.rgb, 0, it.size, '#FF2E63', a * 0.7);
      textFa(ctx, it.word, en.rgb, 0, it.size, '#08F7FE', a * 0.7);
    }
    // تاری با چند کپی (روی همهٔ مرورگرها کار می‌کند)
    const bl = (en.blur + ex.blur) * sc;
    if (bl > 0.6) {
      for (let q = 0; q < 6; q++) {
        const an = (q / 6) * Math.PI * 2;
        textFa(ctx, it.word, Math.cos(an) * bl, Math.sin(an) * bl, it.size, col, a * 0.15);
      }
      a *= 0.55;
    }
    // تایپ: از راست باز می‌شود
    if (en.clip < 1) {
      ctx.beginPath(); ctx.rect(it.w / 2 + it.size * 0.2 - (it.w + it.size * 0.4) * en.clip, -it.size, (it.w + it.size * 0.4) * en.clip, it.size * 2); ctx.clip();
    }
    if (o.emph === 'glow' && sung && heat > 0.02) {
      for (let g = 3; g >= 1; g--) textFa(ctx, it.word, 0, 0, it.size * (1 + g * 0.025), hi, a * heat * 0.18 * g);
    }
    const outl = o.emph === 'outline' && !sung;
    word(ctx, it.word, it.size, col, a, o, acc, outl);
    if (o.emph === 'outline' && sung && heat > 0.05) textFa(ctx, it.word, 0, 0, it.size * 1.04, '#FFFFFF', a * heat * 0.6);

    // تایپ: مکان‌نما
    if (o.enter === 'type' && en.clip < 1) {
      ctx.fillStyle = hi; ctx.globalAlpha = a;
      ctx.fillRect(it.w / 2 + it.size * 0.2 - (it.w + it.size * 0.4) * en.clip - 3 * sc, -it.size * 0.5, 6 * sc, it.size);
      ctx.globalAlpha = 1;
    }
    // خط زیر
    if (o.emph === 'underline' && sung) {
      const kk = ease.outQuart(clamp((t - it.t) / 0.3));
      ctx.fillStyle = hi; ctx.globalAlpha = a * (active ? 1 : 0.5);
      ctx.fillRect(it.w / 2 - it.w * kk, it.size * 0.62, it.w * kk, 5 * sc);
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  });
  ctx.restore();
}

export const TEXT_FX3 = Object.fromEntries(MG_PRESETS.map(p =>
  [p.id, (c, s, t, a, k, ov) => drawMix(c, s, t, a, k, ov, p.o)]));

/* ── پس‌زمینه‌های متحرک «استایل ویدیو» ─────────────────────── */
const rgbaH = (h, a) => { const [r, g, b] = hexToRgb(h); return `rgba(${r},${g},${b},${a})`; };
export function drawMixBg(ctx, song, t, acc, kick, o) {
  const A = okHex(o.bgA) ? o.bgA : '#120A24', B = okHex(o.bgB) ? o.bgB : acc;
  const sc = S(), D = Math.hypot(W, H);
  ctx.save();
  ctx.globalAlpha = 1;
  ctx.fillStyle = A; ctx.fillRect(0, 0, W, H);
  switch (o.bg) {
    case 'grad': {
      const an = t * 0.25;
      const g = ctx.createLinearGradient(W / 2 - Math.cos(an) * D / 2, H / 2 - Math.sin(an) * D / 2, W / 2 + Math.cos(an) * D / 2, H / 2 + Math.sin(an) * D / 2);
      g.addColorStop(0, A); g.addColorStop(1, mix2(B, '#FFFFFF', 0.15 * kick));
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      break;
    }
    case 'blobs': {
      const cols = [B, mix2(A, B, 0.5), mix2(A, '#FFFFFF', 0.25), B];
      for (let i = 0; i < 4; i++) {
        const x = W * (0.5 + 0.38 * Math.sin(t * (0.21 + i * 0.07) + i * 2.1));
        const y = H * (0.5 + 0.36 * Math.cos(t * (0.17 + i * 0.05) + i * 1.3));
        const r = D * (0.32 + 0.06 * Math.sin(t * 0.5 + i)) * (1 + 0.08 * kick);
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, rgbaH(cols[i], 0.85)); g.addColorStop(1, rgbaH(cols[i], 0));
        ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      }
      break;
    }
    case 'sunburst': {
      const n = 18, rot = t * 0.18;
      ctx.translate(W / 2, H / 2); ctx.rotate(rot);
      ctx.fillStyle = B;
      for (let i = 0; i < n; i += 2) {
        const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2;
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, D, a0, a1); ctx.closePath(); ctx.fill();
      }
      ctx.rotate(-rot); ctx.translate(-W / 2, -H / 2);
      const g = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, D * 0.6);
      g.addColorStop(0, `rgba(255,255,255,${0.25 + 0.3 * kick})`); g.addColorStop(1, 'rgba(0,0,0,0.25)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      break;
    }
    case 'synth': {
      const hz = H * 0.6;
      const sky = ctx.createLinearGradient(0, 0, 0, hz);
      sky.addColorStop(0, A); sky.addColorStop(1, mix2(A, B, 0.55));
      ctx.fillStyle = sky; ctx.fillRect(0, 0, W, hz);
      // خورشید راه‌راه
      const R = Math.min(W, H) * 0.24 * (1 + 0.03 * kick), cy = hz - R * 0.35;
      ctx.save(); ctx.beginPath(); ctx.arc(W / 2, cy, R, 0, Math.PI * 2); ctx.clip();
      const sg = ctx.createLinearGradient(0, cy - R, 0, cy + R);
      sg.addColorStop(0, '#FFE14F'); sg.addColorStop(1, B);
      ctx.fillStyle = sg; ctx.fillRect(W / 2 - R, cy - R, R * 2, R * 2);
      ctx.fillStyle = mix2(A, B, 0.55);
      for (let i = 0; i < 7; i++) { const y = cy + R * (0.05 + i * 0.14), h = R * (0.02 + i * 0.012); ctx.fillRect(W / 2 - R, y, R * 2, h); }
      ctx.restore();
      // زمین و شبکهٔ پرسپکتیو
      ctx.fillStyle = mix2(A, '#000000', 0.4); ctx.fillRect(0, hz, W, H - hz);
      ctx.strokeStyle = rgbaH(B, 0.85); ctx.lineWidth = 2.5 * sc;
      ctx.beginPath();
      for (let i = -14; i <= 14; i++) { ctx.moveTo(W / 2 + i * W * 0.02, hz); ctx.lineTo(W / 2 + i * W * 0.16, H); }
      const ph = (t * 0.6) % 1;
      for (let j = 0; j < 12; j++) { const z = (j + ph) / 12, y = hz + (H - hz) * z * z; ctx.moveTo(0, y); ctx.lineTo(W, y); }
      ctx.stroke();
      const hg = ctx.createLinearGradient(0, hz - 30 * sc, 0, hz + 30 * sc);
      hg.addColorStop(0, rgbaH(B, 0)); hg.addColorStop(0.5, rgbaH(B, 0.6 + 0.4 * kick)); hg.addColorStop(1, rgbaH(B, 0));
      ctx.fillStyle = hg; ctx.fillRect(0, hz - 30 * sc, W, 60 * sc);
      break;
    }
    case 'lasers': {
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 8; i++) {
        const an = -Math.PI / 2 + Math.sin(t * (0.6 + i * 0.13) + i * 1.7) * 0.9;
        const x0 = W * (0.1 + 0.8 * (i / 7)), y0 = H * 1.02;
        const col = i % 2 ? B : mix2(B, '#FF2E97', 0.7);
        ctx.strokeStyle = rgbaH(col, 0.35 + 0.55 * kick); ctx.lineWidth = (3 + 9 * kick) * sc;
        ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x0 + Math.cos(an) * D, y0 + Math.sin(an) * D); ctx.stroke();
        ctx.strokeStyle = rgbaH(col, 0.12); ctx.lineWidth = 26 * sc;
        ctx.stroke();
      }
      ctx.globalCompositeOperation = 'source-over';
      const fl = ctx.createRadialGradient(W / 2, H, 0, W / 2, H, H);
      fl.addColorStop(0, rgbaH(B, 0.35 * kick)); fl.addColorStop(1, rgbaH(B, 0));
      ctx.fillStyle = fl; ctx.fillRect(0, 0, W, H);
      break;
    }
    case 'bokeh': {
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, A); g.addColorStop(1, mix2(A, B, 0.25)); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      for (let i = 0; i < 26; i++) {
        const h1 = hash(i * 3.1), h2 = hash(i * 7.7), h3 = hash(i * 1.9);
        const x = ((h1 * W + t * (12 + h2 * 30) * sc) % (W + 200 * sc)) - 100 * sc;
        const y = H * (0.1 + 0.8 * h2) + Math.sin(t * 0.4 + i) * 30 * sc;
        const r = (30 + 110 * h3) * sc * (1 + 0.1 * kick);
        const rg = ctx.createRadialGradient(x, y, 0, x, y, r);
        const c = i % 3 ? B : '#FFFFFF';
        rg.addColorStop(0, rgbaH(c, 0.22)); rg.addColorStop(0.7, rgbaH(c, 0.12)); rg.addColorStop(1, rgbaH(c, 0));
        ctx.fillStyle = rg; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      }
      break;
    }
    case 'halftone': {
      const step = 34 * sc, ph = t * 0.5;
      ctx.fillStyle = B;
      for (let y = step / 2; y < H + step; y += step) {
        for (let x = (Math.floor(y / step) % 2) * step / 2; x < W + step; x += step) {
          const d = Math.hypot(x - W / 2, y - H / 2) / (D / 2);
          const r = step * 0.42 * clamp(0.15 + 0.85 * (0.5 + 0.5 * Math.sin(d * 9 - ph * 4)) * (0.6 + 0.4 * d)) * (1 + 0.15 * kick);
          if (r < 0.6) continue;
          ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
        }
      }
      break;
    }
    case 'stripes': {
      const w = 90 * sc, off = (t * 120 * sc) % (w * 2);
      ctx.translate(W / 2, H / 2); ctx.rotate(-0.5);
      ctx.fillStyle = B;
      for (let x = -D - off; x < D; x += w * 2) ctx.fillRect(x, -D, w, D * 2);
      ctx.rotate(0.5); ctx.translate(-W / 2, -H / 2);
      ctx.fillStyle = `rgba(0,0,0,${0.55 - 0.25 * kick})`; ctx.fillRect(0, 0, W, H);
      break;
    }
    case 'stars': {
      const g = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, D / 2);
      g.addColorStop(0, mix2(A, B, 0.6)); g.addColorStop(1, A); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      const spd = 0.35 + 0.8 * kick;
      for (let i = 0; i < 160; i++) {
        const an = hash(i * 2.3) * Math.PI * 2;
        const z = (hash(i * 5.1) + t * 0.18 * (1 + hash(i) * 0.5)) % 1;
        const r0 = z * z * D * 0.6, r1 = r0 + (6 + 40 * z * spd) * sc;
        ctx.strokeStyle = `rgba(255,255,255,${clamp(z * 1.4)})`; ctx.lineWidth = (1 + 2.5 * z) * sc;
        ctx.beginPath(); ctx.moveTo(W / 2 + Math.cos(an) * r0, H / 2 + Math.sin(an) * r0);
        ctx.lineTo(W / 2 + Math.cos(an) * r1, H / 2 + Math.sin(an) * r1); ctx.stroke();
      }
      break;
    }
    case 'vhs': {
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, A); g.addColorStop(1, mix2(A, B, 0.12)); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = 'rgba(255,255,255,0.035)';
      for (let y = 0; y < H; y += 4 * sc) ctx.fillRect(0, y, W, 1.5 * sc);
      const f = Math.floor(t * 12);
      for (let i = 0; i < 5; i++) {
        const y = hash(f * 3 + i) * H, h = (2 + hash(f + i * 9) * 14) * sc;
        ctx.fillStyle = rgbaH(i % 2 ? B : '#FF2E63', 0.08 + 0.2 * kick); ctx.fillRect(0, y, W, h);
      }
      const ry = ((t * 0.15) % 1) * (H + 120 * sc) - 60 * sc;
      ctx.fillStyle = 'rgba(255,255,255,0.05)'; ctx.fillRect(0, ry, W, 60 * sc);
      ctx.font = `${Math.round(34 * SF())}px ui-monospace, monospace`; ctx.fillStyle = 'rgba(255,255,255,0.75)'; ctx.textAlign = 'left';
      ctx.fillText('▶ PLAY', 60 * sc, 80 * sc);
      ctx.fillText(`SP ${String(Math.floor(t / 60)).padStart(2, '0')}:${String(Math.floor(t % 60)).padStart(2, '0')}`, 60 * sc, H - 60 * sc);
      break;
    }
    case 'paper': {
      for (let i = 0; i < 260; i++) {
        const x = hash(i * 1.7) * W, y = hash(i * 9.3) * H;
        ctx.fillStyle = `rgba(0,0,0,${0.025 + 0.03 * hash(i * 4.1)})`; ctx.fillRect(x, y, 2 * sc, 2 * sc);
      }
      ctx.fillStyle = rgbaH(B, 0.9);
      ctx.fillRect(W * 0.08, H * 0.08, 60 * sc * (1 + 0.6 * kick), 8 * sc);
      ctx.fillRect(W * 0.92 - 60 * sc * (1 + 0.6 * kick), H * 0.92, 60 * sc * (1 + 0.6 * kick), 8 * sc);
      break;
    }
    case 'aurora': {
      ctx.globalCompositeOperation = 'lighter';
      for (let k = 0; k < 4; k++) {
        const col = k % 2 ? '#7B61FF' : B;
        ctx.beginPath();
        const yb = H * (0.25 + k * 0.1);
        ctx.moveTo(0, H);
        for (let x = 0; x <= W; x += W / 40) ctx.lineTo(x, yb + Math.sin(x / W * 6 + t * (0.4 + k * 0.15) + k) * H * 0.08 + Math.sin(x / W * 13 - t * 0.3) * H * 0.03);
        ctx.lineTo(W, H); ctx.closePath();
        const g = ctx.createLinearGradient(0, yb - H * 0.1, 0, yb + H * 0.45);
        g.addColorStop(0, rgbaH(col, 0)); g.addColorStop(0.25, rgbaH(col, 0.22 + 0.15 * kick)); g.addColorStop(1, rgbaH(col, 0));
        ctx.fillStyle = g; ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';
      break;
    }
    case 'embers': {
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, A); g.addColorStop(0.7, mix2(A, B, 0.35)); g.addColorStop(1, mix2(B, '#FFC371', 0.2 + 0.3 * kick));
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 90; i++) {
        const life = (hash(i * 3.7) + t * (0.12 + 0.12 * hash(i * 1.3))) % 1;
        const x = hash(i * 8.1) * W + Math.sin(t * 2 + i) * 30 * sc;
        const y = H * (1.05 - life * 1.1);
        const r = (1.5 + 4 * hash(i * 2.2)) * sc * (1 - life * 0.6);
        ctx.fillStyle = rgbaH(i % 3 ? '#FFC371' : B, (1 - life) * 0.9);
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';
      break;
    }
  }
  // سایه‌گوشهٔ ملایم تا متن جلوتر بنشیند (جز کاغذ)
  if (o.bg !== 'paper') {
    const v = ctx.createRadialGradient(W / 2, H / 2, D * 0.25, W / 2, H / 2, D * 0.6);
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.45)');
    ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
  }
  ctx.restore();
}
