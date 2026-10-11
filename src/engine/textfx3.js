import { W, H, C, S, SF } from './song.js';
import { clamp, ease, hash, hexToRgb } from './core.js';
import { place, modeFor } from './layout.js';
import { textFa, outlineTextFa } from './draw.js';
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
    if (o.emph === 'marker' && sung && col === hi) col = C.BONE;
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
