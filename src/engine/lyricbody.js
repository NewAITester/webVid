import { W, H, C, outQuint, S } from './song.js';
import { clamp, rgba } from './core.js';
import { place, modeFor, fitFa } from './layout.js';
import { wordDraw, textFa } from './draw.js';
import { textPoints } from './glyphs.js';
import { FONTS } from './text.js';
import { applyOverrides } from './overrides.js';

/**
 * رندر بدنهٔ شعر — ترجمهٔ وفادار draw_lyrics
 *
 * نکتهٔ مهم: دو خط همزمان کشیده می‌شوند (خط فعلی و خط قبلی)، چون
 * خط قبلی هنوز در حال محو شدن است. و هر سومین خط به‌جای محو شدن،
 * «می‌پاشد».
 */

const SHAT_EVERY = 3;

/** پاشیدن یک خط به ذرات — ترجمهٔ وفادار shatter() */
function shatter(ctx, song, line, mode, t, tSh, acc) {
  const dt = t - tSh;
  if (dt <= 0 || dt > 0.95) return dt > 0;

  const items = place(ctx, line, mode);
  for (let wi = 0; wi < items.length; wi++) {
    const it = items[wi];
    let pts = textPoints(it.word, it.size, FONTS.black, Math.max(3, Math.round(7 * S())));
    if (!pts.length) continue;
    if (pts.length > 620) {
      const stp = Math.max(1, Math.floor(pts.length / 620));
      pts = pts.filter((_, i) => i % stp === 0);
    }
    const a = Math.pow(clamp(1 - dt / 0.85), 1.1);
    if (a <= 0.02) continue;
    const s = 4.4 * S() * (1 - 0.35 * dt);
    ctx.fillStyle = rgba(it.key ? acc : C.BONE, a);

    for (let i = 0; i < pts.length; i++) {
      // همان مولد شبه‌تصادفی پایتون، تا حرکت ذرات عیناً یکسان باشد
      const r1 = ((i * 9301 + wi * 49297) % 233280) / 233280;
      const r2 = ((i * 4523 + wi * 7919) % 104729) / 104729;
      const ang = r1 * Math.PI * 2;
      const spd = 120 + 620 * r2;
      const px = pts[i].x, py = pts[i].y;
      const x = it.cx + px + (Math.cos(ang) * spd + (px / 120) * 130) * dt;
      const y = it.cy + py + (Math.sin(ang) * spd * 0.7 - 260 * r2 - 90) * dt + 750 * dt * dt;
      ctx.fillRect(x, y, s, s);
    }
  }
  return true;
}

export function drawLyrics(ctx, song, t, style, acc, invert = false, ov = null) {
  const cur = song.activeLine(t);
  if (cur < 0) return;

  for (const li of [cur - 1, cur]) {
    if (li < 0) continue;
    const line = song.lines[li];
    const mode = modeFor(line, style);
    const start = song.lineStart(li), out = song.lineOut(li);

    const aIn = clamp((t - (start - 0.18)) / 0.12);
    const sh = li % SHAT_EVERY === 0 && (style === 'verse' || style === 'chorus');
    const tSh = out - 0.12;
    if (sh && t >= tSh) { shatter(ctx, song, line, mode, t, tSh, acc); continue; }

    const a = aIn * (1 - clamp((t - out) / 0.16));
    if (a <= 0.01) continue;

    const items = applyOverrides(place(ctx, line, mode), ov);

    // در کرس، کلمهٔ کلیدی به‌صورت یک شبح غول‌پیکر پشت متن می‌آید
    if (style === 'chorus' && li === cur) {
      const kwItem = items.find(i => i.key) || items[0];
      const gs = fitFa(ctx, kwItem.word, 1650 * S());
      textFa(ctx, kwItem.word, W / 2, H * 0.28, gs,
             invert ? C.BG : C.BONE, 0.075 * a);
    }

    for (const it of items) {
      const sung = t >= it.t;
      const p = clamp((t - it.t) / 0.085);
      const pop = sung ? 1 + 0.22 * (1 - outQuint(p)) : 1;
      const heat = sung ? Math.exp(-(t - it.t) * 4.5) : 0;
      // تکان افقی کوتاه در لحظهٔ خوانده شدن
      let dx = 0;
      if (sung && t - it.t < 0.05) {
        dx = (1 - (t - it.t) / 0.05) * 26 * S() * (Math.floor(it.t * 100) % 2 ? 1 : -1);
      }
      wordDraw(ctx, it.word, it.cx + dx, it.cy, it.size, sung, heat, pop, a,
               it.key && sung, acc, invert);
    }
  }
}
