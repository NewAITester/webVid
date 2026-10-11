import { W, H, C, S, SF } from './song.js';
import { clamp, ease, hash, hexToRgb } from './core.js';
import { place, modeFor } from './layout.js';
import { textFa, outlineTextFa, DRAW, ghostHidden } from './draw.js';
import { applyOverrides } from './overrides.js';
import * as REEL from './reelfx.js';
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
    ['stars', 'پرواز در ستاره‌ها'], ['vhs', 'نوار VHS'], ['paper', 'کاغذ روشن'], ['aurora', 'شفق'], ['embers', 'آتش و جرقه'],
    ['tunnel', 'تونل'], ['eq', 'اکولایزر'], ['rain', 'باران'], ['checker', 'شطرنجی'], ['waves', 'خط‌های موج'],
    ['film', 'فیلم قدیمی'], ['rays', 'پرتو نور از بالا'], ['confetti', 'جشن کاغذرنگی'], ['neonframe', 'قاب نئون'], ['liquid', 'مایع رنگی'],
    ['swarm', '✦ کهکشان ذرات'], ['burstbg', '✦ انفجار روی ضرب'], ['morph', '✦ دگردیسی شکل‌ها'], ['wire', '✦ بیست‌وجهی سیمی'], ['warp', '✦ پرواز سریع'], ['grid3d', '✦ زمین نئونی'], ['eqring', '✦ اکولایزر حلقه‌ای']] },
  { k: 'bgA', label: 'رنگ ۱ پس‌زمینه', color: true },
  { k: 'bgB', label: 'رنگ ۲ پس‌زمینه', color: true },
  { k: 'enter', label: 'ورود کلمه', ch: [
    ['pop', 'پاپ فنری'], ['rise', 'بالا آمدن'], ['drop', 'افتادن'], ['slide', 'سُر از کنار'],
    ['zoom', 'زوم از جلو'], ['blur', 'از تاری'], ['spin', 'چرخشی'], ['flip', 'ورق خوردن'],
    ['type', 'تایپ'], ['stretch', 'کش‌سان'], ['glitch', 'گلیچ'], ['swing', 'تاب خوردن'], ['bounceIn', 'توپی'],
    ['scatterIn', 'جمع شدن از اطراف'], ['stamp', 'مُهر'], ['mask', 'پرده از پایین'], ['fade', 'محو آرام'], ['slam', '✦ کوبنده (شوریل)'], ['none', 'بدون حرکت']] },
  { k: 'reveal', label: 'زمان ورود', ch: [['timed', 'هر کلمه سر وقت خودش'], ['all', 'کل خط با هم']] },
  { k: 'layout', label: 'چیدمان', ch: [['line', 'خط معمولی'], ['big', 'درشت (کرس)'], ['solo', 'تک‌کلمهٔ غول‌پیکر']] },
  { k: 'emph', label: 'کلمهٔ فعال', ch: [
    ['color', 'رنگی شود'], ['scale', 'بزرگ شود'], ['glow', 'بدرخشد'], ['box', 'جعبهٔ رنگی'],
    ['marker', 'ماژیک هایلایت'], ['underline', 'خط زیر'], ['bounce', 'بپرد'], ['outline', 'تو‌خالی ← پر'],
    ['wave', 'موج کلمه‌ها'], ['shake', 'لرزش'], ['none', 'هیچ']] },
  { k: 'deco', label: 'تزئین', ch: [
    ['none', 'بدون'], ['pill', 'کپسول پشت خط'], ['sticker', 'استیکر هر کلمه'], ['bars', 'خط‌های بالا و پایین'],
    ['burst', 'پرتو روی ضرب کلمه'], ['ring', 'موج دایره'], ['confetti', 'کاغذرنگی'], ['brackets', 'گوشه‌های قاب'],
    ['frame', 'قاب دور خط'], ['hearts', 'قلب‌های پرنده'], ['sparkle', 'ستاره‌ریز'], ['speed', '✦ خط‌های سرعت (شوریل)']] },
  { k: 'shadow', label: 'سایه', ch: [['none', 'بدون'], ['hard', 'سایهٔ تخت (پاپ‌آرت)'], ['soft', 'نرم'], ['long', 'بلند'], ['neon', 'نئون']] },
  { k: 'palette', label: 'پالت', ch: [
    ['mono', 'سفید + رنگ تأکید'], ['rainbow', 'رنگین‌کمان'], ['sunset', 'غروب'], ['candy', 'آب‌نباتی'],
    ['ice', 'یخی'], ['gold', 'طلایی'], ['duo', 'دو رنگ یکی‌درمیان'], ['mint', 'نعنایی'], ['fire', 'آتشی'], ['custom', 'رنگ‌های خودم']] },
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
  P('mg_swing', 'تاب', 'کلمه‌ها از بالا آویزان می‌شوند و تاب می‌خورند',
    { enter: 'swing', emph: 'color', shadow: 'soft', palette: 'duo', beat: 0.4, speed: 0.9 }),
  P('mg_bouncy', 'توپی', 'کلمه‌ها مثل توپ می‌افتند و بالا می‌پرند',
    { enter: 'bounceIn', emph: 'bounce', palette: 'candy', shadow: 'hard', layout: 'big', beat: 0.8 }),
  P('mg_gather', 'جمع شدن', 'کلمه‌ها از گوشه‌های قاب جمع می‌شوند و پخش می‌روند',
    { enter: 'scatterIn', exit: 'scatter', emph: 'glow', reveal: 'all', speed: 0.8, ghost: 0, beat: 0.5 }),
  P('mg_surf', 'موج‌سوار', 'کلمه‌های خوانده‌شده روی موج بالا و پایین می‌روند',
    { enter: 'rise', emph: 'wave', palette: 'mint', shadow: 'soft', deco: 'sparkle', beat: 0.3 }),
  P('mg_quake', 'زلزله', 'سنگین و لرزان روی ضرب، با مهر و سایهٔ تخت',
    { enter: 'stamp', emph: 'shake', shadow: 'hard', layout: 'big', tilt: -3, beat: 2, exit: 'down' }),
  P('mg_framed', 'قاب‌دار', 'قابی که دور خط کشیده می‌شود، مینیمال و شیک',
    { enter: 'mask', emph: 'color', deco: 'frame', ghost: 0.2, beat: 0.3 }),
  P('mg_soft', 'زمزمه', 'خیلی آرام و محو، فقط کلمهٔ فعال روشن',
    { enter: 'fade', reveal: 'all', emph: 'scale', ghost: 0.25, speed: 0.5, beat: 0, exit: 'blur', size: 0.85 }),
  P('mg_love', 'عاشقانهٔ قلبی', 'قلب‌های کوچک از هر کلمه بالا می‌روند',
    { enter: 'pop', deco: 'hearts', palette: 'custom', text: '#FFE3EC', hi: '#FF4F81', emph: 'glow', shadow: 'soft', beat: 0.4 }),
  P('mg_stamp', 'مُهر', 'هر کلمه مثل مهر روی صفحه کوبیده می‌شود',
    { enter: 'stamp', emph: 'box', shadow: 'hard', tilt: 4, beat: 1, speed: 1.3 }),
  P('mg_curtain', 'پرده', 'کلمه‌ها از پشت یک لبهٔ نامرئی بالا می‌آیند، رنگ آتشی',
    { enter: 'mask', palette: 'fire', emph: 'underline', layout: 'big', beat: 0.6, exit: 'up' }),
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
VIDEO_PRESETS.push(
  P('vs_tunnel', 'تونل نئون', 'شش‌ضلعی‌های چرخان که به سمت شما می‌آیند',
    { bg: 'tunnel', bgA: '#05000F', bgB: '#B026FF', enter: 'zoom', shadow: 'neon', emph: 'glow', hi: '#E9B8FF', beat: 1.2, exit: 'zoom' }),
  P('vs_eq', 'اکولایزر', 'ستون‌های صدا که با ضرب بالا و پایین می‌روند',
    { bg: 'eq', bgA: '#070A12', bgB: '#00E5A0', enter: 'rise', emph: 'box', hi: '#00E5A0', beat: 1, layout: 'big' }),
  P('vs_rain', 'باران شب', 'باران مورب و برق روی ضرب‌های قوی',
    { bg: 'rain', bgA: '#05080F', bgB: '#7FB2FF', enter: 'blur', reveal: 'all', emph: 'glow', palette: 'ice', hi: '#BFE0FF', shadow: 'soft', speed: 0.7, beat: 0.3, exit: 'down' }),
  P('vs_checker', 'شطرنجی پاپ', 'خانه‌های شطرنجی متحرک، استیکرهای کج',
    { bg: 'checker', bgA: '#1B1B1B', bgB: '#FF3E7F', enter: 'pop', deco: 'sticker', shadow: 'hard', text: '#141414', box: '#FFFFFF', hi: '#FFE14F', tilt: -4, beat: 0.8 }),
  P('vs_waves', 'امواج', 'خط‌های موج روی آب، آرام و ریتمیک',
    { bg: 'waves', bgA: '#031322', bgB: '#38D9FF', hi: '#7CFFCB', enter: 'swing', emph: 'wave', palette: 'mint', shadow: 'soft', beat: 0.4 }),
  P('vs_film', 'فیلم قدیمی', 'نوار فیلم، دانه و خش، حس سینمای کلاسیک',
    { bg: 'film', bgA: '#0D0B08', bgB: '#6B5A3E', enter: 'fade', reveal: 'all', emph: 'underline', text: '#F3E9D2', hi: '#FFD68A', palette: 'custom', shadow: 'soft', speed: 0.7, beat: 0 }),
  P('vs_heaven', 'پرتو صبح', 'نور از بالا می‌تابد و ذره‌های معلق',
    { bg: 'rays', bgA: '#0B0F1E', bgB: '#FFE8A3', hi: '#FFF3C4', enter: 'rise', reveal: 'all', emph: 'glow', palette: 'gold', shadow: 'soft', speed: 0.7, beat: 0.2, exit: 'up' }),
  P('vs_party', 'جشن', 'کاغذرنگی که مدام می‌بارد، کلمه‌های توپی',
    { bg: 'confetti', bgA: '#170B33', bgB: '#FF4FA3', hi: '#FFE14F', enter: 'bounceIn', palette: 'candy', shadow: 'hard', emph: 'bounce', layout: 'big', beat: 1 }),
  P('vs_neonbox', 'قاب نئون', 'دو قاب نئونی که با ضرب روشن می‌شوند',
    { bg: 'neonframe', bgA: '#06040C', bgB: '#00F0FF', enter: 'mask', shadow: 'neon', emph: 'scale', palette: 'duo', text: '#FFFFFF', hi: '#FF2E97', beat: 0.9 }),
  P('vs_liquid', 'مایع رنگی', 'رنگ‌های روان و درخشان مثل جوهر در آب',
    { bg: 'liquid', bgA: '#0A0614', bgB: '#FF2E97', enter: 'stretch', emph: 'scale', shadow: 'hard', text: '#FFFFFF', hi: '#FFE14F', beat: 0.8 }),
);
/* قطعه‌های شوریل موشن به‌شکل استایل ویدیو */
VIDEO_PRESETS.push(
  P('vs_reel_galaxy', '✦ کهکشان ذرات', 'هزار ذره در یک گرداب که با هر ضرب به بیرون پرت می‌شوند',
    { bg: 'swarm', bgA: '#05030D', bgB: '#E4142A', enter: 'blur', reveal: 'all', emph: 'glow', palette: 'ice', hi: '#9BE7FF', shadow: 'soft', beat: 0.7, exit: 'blur' }),
  P('vs_reel_burst', '✦ انفجار ضربی', 'روی هر ضرب یک انفجار ذره و موج ضربه',
    { bg: 'burstbg', bgA: '#07070C', bgB: '#E4142A', enter: 'slam', deco: 'speed', emph: 'scale', hi: '#FFD447', shadow: 'hard', layout: 'big', beat: 1.3, exit: 'zoom' }),
  P('vs_reel_shapes', '✦ دگردیسی شکل‌ها', 'دایره، مثلث، مربع و ستاره که روی ضرب به هم تبدیل می‌شوند',
    { bg: 'morph', bgA: '#E4142A', bgB: '#F6F3EC', enter: 'pop', emph: 'box', box: '#07070C', text: '#F6F3EC', hi: '#FFD447', shadow: 'hard', beat: 0.9 }),
  P('vs_reel_wire', '✦ سه‌بعدی سیمی', 'بیست‌وجهی نئونی چرخان و پرواز در ستاره‌ها',
    { bg: 'wire', bgA: '#060A1A', bgB: '#18E0FF', enter: 'glitch', deco: 'brackets', emph: 'glow', palette: 'ice', hi: '#18E0FF', shadow: 'neon', beat: 0.8 }),
  P('vs_reel_type', '✦ تایپوگرافی کوبنده', 'کلمهٔ غول‌پیکر که می‌کوبد، با خط‌های سرعت',
    { bg: 'warp', bgA: '#07070C', bgB: '#F6F3EC', enter: 'slam', deco: 'speed', layout: 'solo', emph: 'none', shadow: 'long', text: '#F6F3EC', hi: '#E4142A', beat: 1, ghost: 0, exit: 'zoom' }),
  P('vs_reel_grid', '✦ زمین نئونی', 'خورشید راه‌راه، شهر اکولایزری و زمین شبکه‌ای',
    { bg: 'grid3d', bgA: '#05010F', bgB: '#FF2E97', enter: 'mask', emph: 'scale', text: '#FFFFFF', hi: '#18E0FF', shadow: 'hard', layout: 'big', beat: 0.9 }),
  P('vs_reel_eq', '✦ اکولایزر حلقه‌ای', 'حلقهٔ میله‌های صدا دور شعر',
    { bg: 'eqring', bgA: '#0A0710', bgB: '#E4142A', enter: 'zoom', emph: 'scale', hi: '#FFD447', shadow: 'soft', beat: 1 }),
);
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
    case 'duo': return i % 2 ? (okHex(o.hi) ? o.hi : acc) : (okHex(o.text) ? o.text : C.BONE);
    case 'mint': return mix2('#7CFFCB', '#E9FFF7', (Math.sin(t * 1.5 + i * 0.8) + 1) / 2);
    case 'fire': return mix2('#FF3D00', '#FFD54F', (Math.sin(t * 6 + i * 1.3) + 1) / 2);
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

/**
 * کلمه با سایهٔ انتخابی، دور (0,0)
 *
 * سایهٔ نرم و نئون با shadowBlur خیلی گران‌اند (هر فریم، هر کلمه).
 * چون اندازه و متن هر کلمه در طول خط ثابت است و حرکت با ترنسفرم
 * انجام می‌شود، «کلمه + سایه» را یک بار روی بوم کوچکی می‌کشیم و
 * بعد فقط همان تصویر را جابه‌جا می‌کنیم. شفافیت هم یک‌جا اعمال
 * می‌شود، پس درز بین حروف هم پیدا نیست.
 */
const _spr = new Map();
function sprite(ctx, s, size, col, o, acc) {
  // وضوح بر پایهٔ اندازهٔ بوم (نه ترنسفرم لحظه‌ای)، تا زوم ورود هر فریم کش تازه نسازد
  const dev = (ctx.canvas?.width || W) / W;
  const k = Math.min(2, Math.max(0.25, Math.round(dev * 4) / 4));
  const key = `${s}|${Math.round(size)}|${col}|${o.shadow}|${o.hi}|${acc}|${k}`;
  let e = _spr.get(key);
  if (e) { _spr.delete(key); _spr.set(key, e); return e; }
  const sc = S();
  const pad = size * 0.5 + 40 * sc;
  const pr = document.createElement('canvas').getContext('2d');
  pr.font = font(size, FONTS.black);
  const w = pr.measureText(s).width;
  const cw = Math.ceil((w + pad * 2) * k), ch = Math.ceil((size * 1.7 + pad * 2) * k);
  if (cw > 6000 || ch > 4000 || cw < 2) return null;
  const c = document.createElement('canvas'); c.width = cw; c.height = ch;
  const g = c.getContext('2d');
  g.scale(k, k);
  const cx = cw / k / 2, cy = ch / k / 2;
  const prevRaw = DRAW.raw, prevNg = DRAW.noGhost, prevGt = DRAW.gtext;
  DRAW.raw = true; DRAW.noGhost = false; DRAW.gtext = null;
  if (o.shadow === 'hard') textFa(g, s, cx + 6 * sc * (size / 90), cy + 6 * sc * (size / 90), size, okHex(o.hi) ? '#000000' : mix2(acc, '#000000', 0.35), 0.95);
  else if (o.shadow === 'long') for (let q = 10; q >= 1; q--) textFa(g, s, cx + q * 2.2 * sc, cy + q * 2.2 * sc, size, '#000000', 0.09);
  g.save();
  if (o.shadow === 'soft') { g.shadowColor = 'rgba(0,0,0,.65)'; g.shadowBlur = 22 * sc * k; g.shadowOffsetY = 6 * sc * k; }
  if (o.shadow === 'neon') { g.shadowColor = col; g.shadowBlur = 26 * sc * k; }
  textFa(g, s, cx, cy, size, col, 1);
  if (o.shadow === 'neon') { g.shadowBlur = 10 * sc * k; textFa(g, s, cx, cy, size, '#FFFFFF', 0.55); }
  g.restore();
  DRAW.raw = prevRaw; DRAW.noGhost = prevNg; DRAW.gtext = prevGt;
  e = { c, w: cw / k, h: ch / k };
  _spr.set(key, e);
  if (_spr.size > 160) _spr.delete(_spr.keys().next().value);
  return e;
}
function word(ctx, s, size, col, a, o, acc, outline = false) {
  if (a <= 0.01) return;
  if (outline) {
    const sc = S();
    if (o.shadow === 'hard') textFa(ctx, s, 6 * sc * (size / 90), 6 * sc * (size / 90), size, '#000000', a * 0.95);
    outlineTextFa(ctx, s, 0, 0, size, col, a, FONTS.black, Math.max(2, size * 0.035));
    return;
  }
  if (o.shadow === 'none' || typeof document === 'undefined') { textFa(ctx, s, 0, 0, size, col, a); return; }
  const e = sprite(ctx, s, size, col, o, acc);
  if (!e) { textFa(ctx, s, 0, 0, size, col, a); return; }
  ctx.save();
  ctx.globalAlpha *= clamp(a);
  ctx.drawImage(e.c, -e.w / 2, -e.h / 2, e.w, e.h);
  ctx.restore();
}

/** حالت ورود: k از ۰ تا ۱ → جابه‌جایی، مقیاس، چرخش، شفافیت */
function enterT(o, k, it, i, t) {
  const r = { dx: 0, dy: 0, sx: 1, sy: 1, rot: 0, a: 1, blur: 0, clip: 1, clipY: 1, rgb: 0, py: 0 };
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
    case 'swing': { const b = ease.outElastic(e); r.rot = (1 - b) * -1.1; r.py = -it.size * 0.7; r.a = clamp(e * 3); break; }
    case 'bounceIn': r.dy = -(1 - outBounce(e)) * it.size * 2.2; r.a = clamp(e * 5); break;
    case 'scatterIn': {
      const an = hash(i * 9.1 + 0.3) * Math.PI * 2, b = ease.outCubic(e);
      r.dx = Math.cos(an) * (1 - b) * W * 0.45; r.dy = Math.sin(an) * (1 - b) * H * 0.45;
      r.rot = (1 - b) * (hash(i * 3.3) - 0.5) * 4; r.a = clamp(e * 2); break;
    }
    case 'stamp': {
      const b = ease.outQuart(clamp(e * 1.4));
      r.sx = r.sy = 1 + (1 - b) * 1.8; r.rot = (1 - b) * 0.25; r.a = clamp(e * 3);
      if (e > 0.7) r.dx = Math.sin(e * 60) * it.size * 0.04 * (1 - e) * 3;
      break;
    }
    case 'slam': {
      // از خیلی بزرگ می‌کوبد، لرزش کوتاه و جدا شدن رنگ — مثل شوریل
      const b = REEL.E.out5(clamp(e * 1.25));
      r.sx = r.sy = 1 + (1 - b) * 1.9; r.rot = (1 - b) * -0.06; r.a = clamp(e * 6);
      if (e > 0.25 && e < 0.9) { const q = (0.9 - e) * it.size * 0.07; r.dx = Math.sin(e * 90) * q; r.dy = Math.cos(e * 70) * q; }
      r.rgb = (1 - b) * it.size * 0.1; break;
    }
    case 'mask': r.clipY = ease.outCubic(e); r.dy = (1 - ease.outCubic(e)) * it.size * 0.5; break;
    case 'fade': r.a = ease.inOutCubic ? ease.inOutCubic(e) : e; break;
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

function outBounce(x) {
  const n1 = 7.5625, d1 = 2.75;
  if (x < 1 / d1) return n1 * x * x;
  if (x < 2 / d1) return n1 * (x -= 1.5 / d1) * x + 0.75;
  if (x < 2.5 / d1) return n1 * (x -= 2.25 / d1) * x + 0.9375;
  return n1 * (x -= 2.625 / d1) * x + 0.984375;
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
  } else if (o.deco === 'speed') {
    const k = 1 - clamp(dt / 0.5);
    if (k > 0) {
      ctx.save(); ctx.strokeStyle = col; ctx.globalAlpha = 0.75 * k; ctx.lineWidth = 3 * sc; ctx.lineCap = 'round'; ctx.beginPath();
      for (let j = 0; j < 16; j++) {
        const an = hash(i * 11 + j) * Math.PI * 2, r0 = (it.w / 2 + z * 0.3) * (1 + (1 - k) * 0.6), L = z * 0.9 * k;
        ctx.moveTo(Math.cos(an) * r0, Math.sin(an) * r0 * 0.6); ctx.lineTo(Math.cos(an) * (r0 + L), Math.sin(an) * (r0 + L) * 0.6);
      }
      ctx.stroke(); ctx.restore();
    }
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
  } else if (o.deco === 'hearts') {
    ctx.save();
    for (let j = 0; j < 5; j++) {
      const h1 = hash(i * 13 + j), x = (h1 - 0.5) * it.w * 1.2 + Math.sin(dt * 6 + j) * z * 0.15;
      const y = -z * 0.6 - dt * z * (1.2 + hash(j + i) * 1.2), r = z * (0.12 + 0.08 * hash(j * 7 + i));
      ctx.globalAlpha = (1 - clamp(dt / 0.9)) * 0.9; ctx.fillStyle = j % 2 ? col : '#FF6B9A';
      ctx.beginPath(); ctx.moveTo(x, y + r * 0.9);
      ctx.bezierCurveTo(x - r * 1.6, y - r * 0.2, x - r * 0.6, y - r * 1.4, x, y - r * 0.5);
      ctx.bezierCurveTo(x + r * 0.6, y - r * 1.4, x + r * 1.6, y - r * 0.2, x, y + r * 0.9);
      ctx.fill();
    }
    ctx.restore();
  } else if (o.deco === 'sparkle') {
    ctx.save(); ctx.fillStyle = '#FFFFFF';
    for (let j = 0; j < 7; j++) {
      const an = hash(i * 5 + j) * Math.PI * 2, rr = (it.w / 2 + z * 0.2) * (0.6 + 0.6 * hash(j * 3 + i));
      const x = Math.cos(an) * rr, y = Math.sin(an) * rr * 0.55;
      const k = Math.sin(clamp(dt / 0.7) * Math.PI), q = z * 0.13 * k * (0.6 + hash(j) * 0.8);
      ctx.globalAlpha = k;
      ctx.beginPath(); ctx.moveTo(x, y - q); ctx.lineTo(x + q * 0.25, y - q * 0.25); ctx.lineTo(x + q, y); ctx.lineTo(x + q * 0.25, y + q * 0.25);
      ctx.lineTo(x, y + q); ctx.lineTo(x - q * 0.25, y + q * 0.25); ctx.lineTo(x - q, y); ctx.lineTo(x - q * 0.25, y - q * 0.25); ctx.closePath(); ctx.fill();
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
  // پیدایی کلمهٔ نخوانده، جدا برای هر کلمه (تنظیم بخش ← خط ← کلمه)
  const g0 = +o.ghost || 0;
  const gOf = w => (ghostHidden(w) ? 0 : g0 > 0 ? g0 : DRAW.gtext?.get(w) === false ? 0.35 : 0);
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
  if ((o.deco === 'pill' || o.deco === 'bars' || o.deco === 'frame') && o.layout !== 'solo') {
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
      } else if (o.deco === 'frame') {
        // قاب دور خط که از یک گوشه کشیده می‌شود
        const fw = x1 - x0 + pad * 2.2, fh = h + pad * 0.6, per = 2 * (fw + fh);
        const pr = clamp((t - t0 + 0.3) / 0.6) * (1 - exK);
        ctx.save(); ctx.strokeStyle = hi; ctx.lineWidth = 5 * sc; ctx.lineJoin = 'miter';
        ctx.setLineDash([per * pr, per]);
        ctx.strokeRect(cx - fw / 2, cy - fh / 2, fw, fh);
        ctx.setLineDash([]);
        ctx.globalAlpha = 0.25 * kick; ctx.lineWidth = 14 * sc; ctx.strokeRect(cx - fw / 2, cy - fh / 2, fw, fh);
        ctx.restore();
      } else {
        ctx.save(); ctx.strokeStyle = hi; ctx.lineWidth = 5 * sc; ctx.globalAlpha = clamp(k);
        for (const y of [cy - h / 2 - pad * 0.3, cy + h / 2 + pad * 0.3]) { ctx.beginPath(); ctx.moveTo(cx - w / 2, y); ctx.lineTo(cx + w / 2, y); ctx.stroke(); }
        ctx.restore();
      }
    }
  }

  list.forEach((it, j) => {
    const i = idx[j];
    const gh = gOf(it.word);
    const k = (t - wt(it, i)) / dur;
    if (k <= 0 && (o.reveal === 'timed' || gh <= 0)) {
      if (o.reveal === 'timed' && gh > 0 && o.layout !== 'solo' && o.enter !== 'type') {
        // پیش‌نمایش کم‌رنگ کلمه‌های بعدی
        ctx.save(); ctx.translate(it.cx, it.cy);
        textFa(ctx, it.word, 0, 0, it.size, C.GHOST, gh * 0.8 * clamp((t - t0 + 0.5) / 0.3) * (1 - exK));
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
    if (!sung && o.reveal === 'all' && gh <= 0) return;
    let a = en.a * ex.a * (sung || o.reveal === 'timed' ? 1 : Math.max(0.12, gh));

    ctx.save();
    ctx.translate(it.cx + en.dx + ex.dx, it.cy + en.dy + ex.dy);
    let s = ex.s;
    if (o.emph === 'scale') s *= active ? 1 + 0.18 * clamp((t - it.t) / 0.15) : (sung ? 0.94 : 0.9);
    if (o.emph === 'wave' && sung) ctx.translate(0, Math.sin(t * 5 - i * 0.9) * it.size * 0.12);
    if (o.emph === 'shake' && active) {
      const f = Math.floor(t * 40), q = Math.exp(-(t - it.t) * 2) * it.size * 0.06 + kick * it.size * 0.05;
      ctx.translate((hash(f + i) - 0.5) * q * 2, (hash(f * 1.7 + i) - 0.5) * q * 2);
    }
    if (o.emph === 'bounce' && active) ctx.translate(0, -Math.abs(Math.sin((t - it.t) * 9)) * it.size * 0.18 * Math.exp(-(t - it.t) * 2.5));
    if (o.deco === 'sticker') ctx.rotate(((i % 2 ? 1 : -1) * (3 + (Math.abs(+o.tilt) || 2) * 0.4)) * Math.PI / 180);
    if (en.py) { ctx.translate(0, en.py); ctx.rotate(en.rot); ctx.translate(0, -en.py); }
    else ctx.rotate(en.rot);
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
      DRAW.raw = true;
      textFa(ctx, it.word, -en.rgb, 0, it.size, '#FF2E63', a * 0.7);
      textFa(ctx, it.word, en.rgb, 0, it.size, '#08F7FE', a * 0.7);
      DRAW.raw = false;
    }
    // تاری با چند کپی (روی همهٔ مرورگرها کار می‌کند)
    const bl = (en.blur + ex.blur) * sc;
    if (bl > 0.6) {
      DRAW.raw = true;
      for (let q = 0; q < 4; q++) {
        const an = (q / 4) * Math.PI * 2 + 0.6;
        textFa(ctx, it.word, Math.cos(an) * bl, Math.sin(an) * bl, it.size, col, a * 0.2);
      }
      DRAW.raw = false;
      a *= 0.55;
    }
    // پرده از پایین
    if (en.clipY < 1) {
      ctx.beginPath(); ctx.rect(-it.w, it.size * 0.75 - it.size * 1.6 * en.clipY - en.dy, it.w * 2, it.size * 1.6 * en.clipY); ctx.clip();
    }
    // تایپ: از راست باز می‌شود
    if (en.clip < 1) {
      ctx.beginPath(); ctx.rect(it.w / 2 + it.size * 0.2 - (it.w + it.size * 0.4) * en.clip, -it.size, (it.w + it.size * 0.4) * en.clip, it.size * 2); ctx.clip();
    }
    if (o.emph === 'glow' && sung && heat > 0.02) {
      DRAW.raw = true;
      for (let g = 2; g >= 1; g--) textFa(ctx, it.word, 0, 0, it.size * (1 + g * 0.03), hi, a * heat * 0.25 * g);
      DRAW.raw = false;
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
/* پس‌زمینه‌های نرم (گرادیان، لکه، بوکه…) جزئیات تیز ندارند؛ آن‌ها را با
   وضوح کمتر روی بوم کمکی می‌کشیم و بزرگ می‌کنیم — چند برابر سریع‌تر. */
const SOFT_BG = new Set(['grad', 'blobs', 'bokeh', 'aurora', 'liquid', 'rays', 'embers', 'sunburst']);
let _bgC = null, _vigC = null, _vigKey = '';
function vignette(ctx) {
  const key = W + 'x' + H;
  if (!_vigC || _vigKey !== key) {
    _vigC = document.createElement('canvas'); _vigC.width = 320; _vigC.height = Math.max(1, Math.round(320 * H / W));
    const g = _vigC.getContext('2d'), w = _vigC.width, h = _vigC.height, d = Math.hypot(w, h);
    const v = g.createRadialGradient(w / 2, h / 2, d * 0.25, w / 2, h / 2, d * 0.6);
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.45)');
    g.fillStyle = v; g.fillRect(0, 0, w, h); _vigKey = key;
  }
  ctx.drawImage(_vigC, 0, 0, W, H);
}
export function drawMixBg(ctx, song, t, acc, kick, o) {
  if (typeof document !== 'undefined' && SOFT_BG.has(o.bg)) {
    const dev = (ctx.canvas?.width || W) / W;
    const q = Math.max(0.15, Math.min(0.5, dev * 0.45));
    const cw = Math.max(2, Math.round(W * q)), ch = Math.max(2, Math.round(H * q));
    if (!_bgC) _bgC = document.createElement('canvas');
    if (_bgC.width !== cw || _bgC.height !== ch) { _bgC.width = cw; _bgC.height = ch; }
    const g = _bgC.getContext('2d');
    g.setTransform(q, 0, 0, q, 0, 0);
    paintBg(g, song, t, acc, kick, o, true);
    ctx.save(); ctx.imageSmoothingEnabled = true;
    ctx.drawImage(_bgC, 0, 0, W, H);
    ctx.restore();
    if (o.bg !== 'paper') vignette(ctx);
    return;
  }
  paintBg(ctx, song, t, acc, kick, o, false);
  if (o.bg !== 'paper' && typeof document !== 'undefined') vignette(ctx);
}
function paintBg(ctx, song, t, acc, kick, o, soft) {
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
      const step = 40 * sc, ph = t * 0.5;
      ctx.fillStyle = B; ctx.beginPath();
      for (let y = step / 2; y < H + step; y += step) {
        for (let x = (Math.floor(y / step) % 2) * step / 2; x < W + step; x += step) {
          const d = Math.hypot(x - W / 2, y - H / 2) / (D / 2);
          const r = step * 0.42 * clamp(0.15 + 0.85 * (0.5 + 0.5 * Math.sin(d * 9 - ph * 4)) * (0.6 + 0.4 * d)) * (1 + 0.15 * kick);
          if (r < 0.6) continue;
          ctx.moveTo(x + r, y); ctx.arc(x, y, r, 0, Math.PI * 2);
        }
      }
      ctx.fill();
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
      for (let bk = 0; bk < 3; bk++) {
        ctx.strokeStyle = `rgba(255,255,255,${0.35 + bk * 0.3})`; ctx.lineWidth = (1 + bk * 1.2) * sc;
        ctx.beginPath();
        for (let i = 0; i < 160; i++) {
          const z = (hash(i * 5.1) + t * 0.18 * (1 + hash(i) * 0.5)) % 1;
          if (Math.min(2, Math.floor(z * 3)) !== bk) continue;
          const an = hash(i * 2.3) * Math.PI * 2;
          const r0 = z * z * D * 0.6, r1 = r0 + (6 + 40 * z * spd) * sc;
          ctx.moveTo(W / 2 + Math.cos(an) * r0, H / 2 + Math.sin(an) * r0);
          ctx.lineTo(W / 2 + Math.cos(an) * r1, H / 2 + Math.sin(an) * r1);
        }
        ctx.stroke();
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
    case 'tunnel': {
      ctx.translate(W / 2, H / 2);
      for (let k = 14; k >= 0; k--) {
        const z = ((k + (t * 0.9) % 1)) / 14, r = z * z * D * 0.75;
        ctx.save(); ctx.rotate(t * 0.3 + k * 0.18);
        ctx.strokeStyle = rgbaH(k % 2 ? B : mix2(B, '#FFFFFF', 0.4), clamp(z * 1.2) * (0.5 + 0.5 * kick));
        ctx.lineWidth = (2 + 10 * z) * sc;
        const n = 6;
        ctx.beginPath();
        for (let j = 0; j <= n; j++) { const an = (j / n) * Math.PI * 2; ctx.lineTo(Math.cos(an) * r, Math.sin(an) * r); }
        ctx.stroke(); ctx.restore();
      }
      ctx.translate(-W / 2, -H / 2);
      break;
    }
    case 'eq': {
      const n = 32, bw = W / n;
      for (let j = 0; j < n; j++) {
        const lvl = clamp(0.15 + 0.55 * Math.abs(Math.sin(t * (2 + hash(j) * 3) + j * 0.7)) * (0.5 + 0.8 * kick) + 0.2 * hash(j + Math.floor(t * 8)));
        const h = lvl * H * 0.55, cells = Math.ceil(h / (18 * sc));
        for (let c = 0; c < cells; c++) {
          const y = H - (c + 1) * 18 * sc;
          ctx.fillStyle = rgbaH(mix2(B, '#FF2E63', c / 26), 0.75);
          ctx.fillRect(j * bw + bw * 0.12, y, bw * 0.76, 14 * sc);
        }
        ctx.fillStyle = rgbaH(B, 0.12);
        ctx.fillRect(j * bw + bw * 0.12, 0, bw * 0.76, h * 0.4);
      }
      break;
    }
    case 'rain': {
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, A); g.addColorStop(1, mix2(A, B, 0.3)); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = rgbaH(B, 0.35); ctx.lineWidth = 1.5 * sc; ctx.beginPath();
      for (let i = 0; i < 180; i++) {
        const x = hash(i * 1.3) * W * 1.2 - W * 0.1, sp = 0.6 + hash(i * 2.9) * 0.8;
        const y = ((hash(i * 4.7) + t * sp) % 1) * (H + 100 * sc) - 50 * sc, L = (30 + 50 * sp) * sc;
        ctx.moveTo(x, y); ctx.lineTo(x - L * 0.15, y + L);
      }
      ctx.stroke();
      const fl = kick > 0.6 ? (kick - 0.6) * 0.5 : 0;
      if (fl) { ctx.fillStyle = `rgba(255,255,255,${fl})`; ctx.fillRect(0, 0, W, H); }
      break;
    }
    case 'checker': {
      const M0 = ctx.getTransform();
      const c = 120 * sc, ox = (t * 60 * sc) % (c * 2), oy = (t * 35 * sc) % (c * 2);
      ctx.translate(W / 2, H / 2); ctx.rotate(0.18 + Math.sin(t * 0.3) * 0.05); ctx.scale(1 + 0.04 * kick, 1 + 0.04 * kick);
      ctx.fillStyle = B;
      for (let y = -D / 2 - oy; y < D / 2; y += c) for (let x = -D / 2 - ox; x < D / 2; x += c) {
        if (((Math.round((x + ox) / c) + Math.round((y + oy) / c)) & 1) === 0) ctx.fillRect(x, y, c, c);
      }
      ctx.setTransform(M0);
      ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(0, 0, W, H);
      break;
    }
    case 'waves': {
      ctx.lineWidth = 3 * sc;
      for (let k = 0; k < 16; k++) {
        const yb = H * (k + 0.5) / 16;
        ctx.strokeStyle = rgbaH(k % 2 ? B : mix2(B, '#FFFFFF', 0.5), 0.25 + 0.3 * kick);
        ctx.beginPath();
        for (let x = 0; x <= W; x += W / 60) ctx.lineTo(x, yb + Math.sin(x / W * 8 + t * 1.6 + k * 0.5) * (14 + 20 * kick) * sc);
        ctx.stroke();
      }
      break;
    }
    case 'film': {
      const g = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, D / 2);
      g.addColorStop(0, mix2(A, B, 0.35)); g.addColorStop(1, A); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      const f = Math.floor(t * 24);
      for (let i = 0; i < 400; i++) { ctx.fillStyle = `rgba(255,255,255,${0.04 * hash(f * 7 + i)})`; ctx.fillRect(hash(f + i * 1.1) * W, hash(f * 3 + i) * H, 2 * sc, 2 * sc); }
      for (let i = 0; i < 3; i++) if (hash(f + i * 17) > 0.5) { ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.fillRect(hash(f * 5 + i) * W, 0, 1.5 * sc, H); }
      const bh = H * 0.1; ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, bh); ctx.fillRect(0, H - bh, W, bh);
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      const off = (t * 300 * sc) % (80 * sc);
      for (let x = -off; x < W; x += 80 * sc) { ctx.fillRect(x + 20 * sc, bh * 0.3, 36 * sc, bh * 0.4); ctx.fillRect(x + 20 * sc, H - bh * 0.7, 36 * sc, bh * 0.4); }
      ctx.fillStyle = `rgba(255,220,180,${0.04 + 0.05 * Math.sin(t * 17)})`; ctx.fillRect(0, 0, W, H);
      break;
    }
    case 'rays': {
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, mix2(A, B, 0.4)); g.addColorStop(1, A); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 9; i++) {
        const an = Math.PI / 2 + (i - 4) * 0.16 + Math.sin(t * 0.4 + i) * 0.05, wd = 0.04 + 0.03 * hash(i);
        ctx.fillStyle = rgbaH(B, (0.06 + 0.06 * hash(i * 3)) * (1 + kick));
        ctx.beginPath(); ctx.moveTo(W / 2, -H * 0.1);
        ctx.lineTo(W / 2 + Math.cos(an - wd) * D, -H * 0.1 + Math.sin(an - wd) * D);
        ctx.lineTo(W / 2 + Math.cos(an + wd) * D, -H * 0.1 + Math.sin(an + wd) * D); ctx.closePath(); ctx.fill();
      }
      for (let i = 0; i < 50; i++) {
        const x = hash(i * 3.3) * W, y = ((hash(i * 1.9) + t * 0.03 * (1 + hash(i))) % 1) * H;
        ctx.fillStyle = rgbaH('#FFFFFF', 0.3 * hash(i * 7)); ctx.beginPath(); ctx.arc(x, y, (1 + 2 * hash(i)) * sc, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';
      break;
    }
    case 'confetti': {
      const g = ctx.createLinearGradient(0, 0, W, H);
      g.addColorStop(0, A); g.addColorStop(1, mix2(A, B, 0.35)); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      for (let i = 0; i < 120; i++) {
        const x = hash(i * 2.1) * W + Math.sin(t * 2 + i) * 40 * sc;
        const y = ((hash(i * 6.3) + t * (0.08 + 0.1 * hash(i))) % 1) * (H + 60 * sc) - 30 * sc;
        ctx.save(); ctx.translate(x, y); ctx.rotate(t * 3 * (hash(i * 4) - 0.5) + i);
        ctx.scale(1, Math.cos(t * 4 + i));
        ctx.fillStyle = CANDY[i % CANDY.length]; ctx.fillRect(-8 * sc, -4 * sc, 16 * sc, 8 * sc); ctx.restore();
      }
      break;
    }
    case 'neonframe': {
      const m = Math.min(W, H) * 0.06, pw = (6 + 8 * kick) * sc;
      for (const [k, col] of [[0, B], [1, '#FF2E97']]) {
        const inset = m + k * 22 * sc;
        ctx.save(); ctx.strokeStyle = col;
        const ga = 0.6 + 0.4 * (k ? Math.abs(Math.sin(t * 3)) : kick);
        ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(inset, inset, W - inset * 2, H - inset * 2, 30 * sc); else ctx.rect(inset, inset, W - inset * 2, H - inset * 2);
        // هالهٔ ارزان: چند خط پهن کم‌رنگ به‌جای shadowBlur
        for (const [lw, al] of [[pw * 6, 0.08], [pw * 3, 0.16], [pw, 1]]) { ctx.lineWidth = lw; ctx.globalAlpha = ga * al; ctx.stroke(); }
        ctx.restore();
      }
      break;
    }
    case 'liquid': {
      const cols = [B, '#00D4FF', '#FFB800', mix2(A, B, 0.5)];
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 6; i++) {
        const x = W * (0.5 + 0.45 * Math.sin(t * (0.3 + i * 0.05) + i * 1.9 + Math.sin(t * 0.7 + i)));
        const y = H * (0.5 + 0.45 * Math.cos(t * (0.25 + i * 0.04) + i * 2.7));
        const r = D * (0.22 + 0.05 * Math.sin(t + i)) * (1 + 0.1 * kick);
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, rgbaH(cols[i % 4], 0.55)); g.addColorStop(1, rgbaH(cols[i % 4], 0));
        ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      }
      ctx.globalCompositeOperation = 'source-over';
      break;
    }
    /* ── قطعه‌های شوریل (reelfx) — همه با ضرب آهنگ تکان می‌خورند ── */
    case 'swarm': case 'burstbg': case 'morph': case 'wire': case 'warp': case 'grid3d': case 'eqring': {
      const env = REEL.envFromSong(song, t, W, H);
      const C2 = mix2(B, '#FFFFFF', 0.35);
      if (o.bg === 'swarm') REEL.vortex(ctx, env, { c1: B, c2: o.bgB2 || '#18E0FF', n: 1000 });
      else if (o.bg === 'burstbg') { REEL.starfield(ctx, env, { n: 260, c: C2, a: 0.6 }); REEL.burst(ctx, env, { c1: B, c2: '#FFD447' }); }
      else if (o.bg === 'morph') { ctx.globalAlpha = 0.55; REEL.morph(ctx, env, { c1: mix2(A, B, 0.6), c2: C2, r: Math.min(W, H) * 0.3 }); ctx.globalAlpha = 1; }
      else if (o.bg === 'wire') { REEL.starfield(ctx, env, { n: 420, c: B, a: 0.8 }); ctx.globalAlpha = 0.7; REEL.wire(ctx, env, { c1: B, c2: '#FF2E97', r: Math.min(W, H) * 0.3 }); ctx.globalAlpha = 1; }
      else if (o.bg === 'warp') REEL.starfield(ctx, env, { n: 650, c: C2, speed: 1.5 });
      else if (o.bg === 'grid3d') REEL.grid3d(ctx, env, { c1: B, c2: '#18E0FF', horizon: 0.74 });
      else if (o.bg === 'eqring') { REEL.eqRing(ctx, env, { c1: B, c2: C2, r: Math.min(W, H) * 0.36 }); }
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
  ctx.restore();
}

/** بعد از عوض شدن فونت شعر، تصویرهای کش‌شدهٔ کلمه‌ها باید دور ریخته شوند */
export function clearMixCache() { _spr.clear(); }
