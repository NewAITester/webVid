import { W, H, C, S, SF, outQuint } from './song.js';
import { clamp, ease, rgba, hash } from './core.js';
import { place, modeFor, fitFa } from './layout.js';
import { textFa, wordDraw, line, rect } from './draw.js';
import { applyOverrides } from './overrides.js';
import { FONTS, font } from './text.js';

/**
 * سبک‌های متنی تازه
 *
 * هرکدام یک تابع (ctx, song, t, acc, kick, ov) است و خودش تصمیم
 * می‌گیرد خط فعال را چطور بکشد. همان قانون طلایی برقرار است:
 * خروجی فقط به t بستگی دارد، نه به فریم قبلی.
 */

/** خط فعال با پاکت ورود/خروج — پایهٔ مشترک همه */
function active(song, t, pad = 0.35) {
  const cur = song.activeLine(t);
  if (cur < 0) return null;
  const line = song.lines[cur];
  const t0 = song.lineStart(cur), t1 = song.lineOut(cur);
  if (t < t0 - pad || t > t1 + pad) return null;
  const a = clamp((t - (t0 - 0.2)) / 0.25) * (1 - clamp((t - t1) / 0.3));
  return { line, cur, t0, t1, a };
}

/* ── ۱) تایپ ──────────────────────────────────────────────
   حروف یکی‌یکی ظاهر می‌شوند، با نشانگر چشمک‌زن. */
export function fxType(ctx, song, t, acc, kick, ov) {
  const A = active(song, t);
  if (!A || A.a <= 0.01) return;
  const { line, t0, t1, a } = A;

  // کدام کلمه‌ها تا حالا خوانده شده‌اند
  const shown = line.words.filter(w => t >= w.t);
  if (!shown.length) return;
  const full = shown.map(w => w.text).join(' ');

  // آخرین کلمه حرف‌به‌حرف می‌آید
  const lastW = shown[shown.length - 1];
  const nextT = line.words[shown.length]?.t ?? t1;
  const k = clamp((t - lastW.t) / Math.max(0.12, (nextT - lastW.t) * 0.7));
  const nChars = Math.max(1, Math.round(lastW.text.length * k));
  const head = shown.slice(0, -1).map(w => w.text).join(' ');
  const txt = (head ? head + ' ' : '') + lastW.text.slice(0, nChars);

  const size = Math.min(130 * SF(), fitFa(ctx, full || txt, W * 0.84));
  ctx.save();
  ctx.globalAlpha = a;
  textFa(ctx, txt, W / 2, H * 0.5, size, C.BONE, 1);
  // نشانگر
  if (Math.floor(t * 3) % 2 === 0) {
    ctx.font = font(size, FONTS.black);
    ctx.direction = 'rtl';
    const wdt = ctx.measureText(txt).width;
    rect(ctx, W / 2 - wdt / 2 - size * 0.14, H * 0.5 - size * 0.38,
         size * 0.07, size * 0.76, acc, 0.9);
  }
  ctx.restore();
}

/* ── ۲) کاریوکی ───────────────────────────────────────────
   خط کامل خاکستری است و یک موج رنگ از راست رویش می‌رود. */
export function fxKaraoke(ctx, song, t, acc, kick, ov) {
  const A = active(song, t);
  if (!A || A.a <= 0.01) return;
  const { line, a } = A;
  const txt = line.text;
  const size = Math.min(120 * SF(), fitFa(ctx, txt, W * 0.86));
  const y = H * 0.5;

  ctx.save();
  ctx.globalAlpha = a;
  textFa(ctx, txt, W / 2, y, size, C.GHOST, 0.85);

  // پیشرفت بر اساس زمان کلمه‌ها، نه زمان خطی
  let prog = 0;
  for (let i = 0; i < line.words.length; i++) {
    const w = line.words[i];
    const nx = line.words[i + 1]?.t ?? w.end;
    if (t >= nx) prog = (i + 1) / line.words.length;
    else if (t >= w.t) {
      prog = (i + clamp((t - w.t) / Math.max(0.05, nx - w.t))) / line.words.length;
      break;
    }
  }
  ctx.font = font(size, FONTS.black);
  ctx.direction = 'rtl';
  const wdt = ctx.measureText(txt).width;
  // راست‌به‌چپ: برش از لبهٔ راست باز می‌شود
  ctx.beginPath();
  ctx.rect(W / 2 + wdt / 2 - wdt * prog, y - size * 0.8, wdt * prog, size * 1.6);
  ctx.clip();
  textFa(ctx, txt, W / 2, y, size, acc, 1);
  ctx.restore();
}

/* ── ۳) موج ───────────────────────────────────────────────
   کلمه‌ها روی یک موج سینوسی می‌نشینند که با ضرب نفس می‌کشد. */
export function fxWave(ctx, song, t, acc, kick, ov) {
  const A = active(song, t);
  if (!A || A.a <= 0.01) return;
  const { line, a } = A;
  const items = applyOverrides(place(ctx, line, modeFor(line, 'pre')), ov);
  const amp = (26 + 34 * kick) * SF();
  for (const it of items) {
    const sung = t >= it.t;
    const heat = sung ? Math.exp(-(t - it.t) * 4.5) : 0;
    const ph = (it.cx / W) * 6.2832;
    const dy = Math.sin(t * 2.1 + ph) * amp;
    const rot = Math.cos(t * 2.1 + ph) * 0.09;
    ctx.save();
    ctx.translate(it.cx, it.cy + dy);
    ctx.rotate(rot);
    wordDraw(ctx, it.word, 0, 0, it.size, sung, heat, 1, a, it.key && sung, acc);
    ctx.restore();
  }
}

/* ── ۴) پرش ───────────────────────────────────────────────
   هر کلمه در لحظهٔ خوانده شدن از بزرگ به اندازهٔ عادی می‌کوبد. */
export function fxPunch(ctx, song, t, acc, kick, ov) {
  const A = active(song, t);
  if (!A || A.a <= 0.01) return;
  const { line, a } = A;
  const items = applyOverrides(place(ctx, line, modeFor(line, 'chorus')), ov);
  for (const it of items) {
    const sung = t >= it.t;
    if (!sung) continue;                       // فقط خوانده‌شده‌ها دیده می‌شوند
    const k = clamp((t - it.t) / 0.22);
    const sc = 1 + 1.4 * (1 - outQuint(k));
    const al = a * clamp(k / 0.18);
    const heat = Math.exp(-(t - it.t) * 4.0);
    ctx.save();
    ctx.translate(it.cx, it.cy);
    ctx.scale(sc, sc);
    wordDraw(ctx, it.word, 0, 0, it.size, true, heat, 1, al, it.key, acc);
    ctx.restore();
  }
}

/* ── ۵) دوپاره ────────────────────────────────────────────
   خط از وسط نصف می‌شود و دو نیمه از دو سمت وارد می‌شوند. */
export function fxSplit(ctx, song, t, acc, kick, ov) {
  const A = active(song, t);
  if (!A || A.a <= 0.01) return;
  const { line, t0, a } = A;
  const items = applyOverrides(place(ctx, line, modeFor(line, 'pre')), ov);
  const k = ease.outCubic(clamp((t - t0) / 0.5));
  const slide = (1 - k) * W * 0.55;
  for (const it of items) {
    const right = it.cx >= W / 2;
    const sung = t >= it.t;
    const heat = sung ? Math.exp(-(t - it.t) * 4.5) : 0;
    wordDraw(ctx, it.word, it.cx + (right ? slide : -slide), it.cy,
             it.size, sung, heat, 1, a, it.key && sung, acc);
  }
  if (k > 0.98) {
    const y = H * 0.5 + (items[0]?.size || 100) * 0.95;
    line_(ctx, y, acc, a * 0.4);
  }
}
function line_(ctx, y, acc, al) {
  line(ctx, W * 0.12, y, W * 0.88, y, acc, 2 * S(), al);
}

/* ── ۶) ستونی ─────────────────────────────────────────────
   کلمه‌ها زیر هم می‌چینند — مناسب قاب عمودی. */
export function fxStack(ctx, song, t, acc, kick, ov) {
  const A = active(song, t);
  if (!A || A.a <= 0.01) return;
  const { line, t0, a } = A;
  const ws = line.words;
  const n = ws.length;
  const size = Math.min(104 * SF(), (H * 0.62) / Math.max(3, n) * 0.82,
                        fitFa(ctx, ws.reduce((p, c) => c.text.length > p.text.length ? c : p).text, W * 0.8));
  const gap = size * 1.22;
  const y0 = H * 0.5 - ((n - 1) * gap) / 2;
  for (let i = 0; i < n; i++) {
    const w = ws[i];
    const sung = t >= w.t;
    const inA = clamp((t - (t0 + i * 0.05 - 0.3)) / 0.3);
    if (inA <= 0) continue;
    const heat = sung ? Math.exp(-(t - w.t) * 4.0) : 0;
    const dx = (1 - inA) * 40 * S() * (i % 2 ? 1 : -1);
    wordDraw(ctx, w.text, W / 2 + dx, y0 + i * gap, size, sung, heat, 1,
             a * inA, false, acc);
  }
}

export const TEXT_FX = {
  type: fxType,
  karaoke: fxKaraoke,
  wave: fxWave,
  punch: fxPunch,
  split: fxSplit,
  stack: fxStack,
};
