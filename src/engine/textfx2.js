import { W, H, C, S, SF, outQuint, outExpo } from './song.js';
import { clamp, ease, rgba, hash, hash2, noise1 } from './core.js';
import { place, modeFor, fitFa } from './layout.js';
import { textFa, wordDraw, line as drawLine, rect } from './draw.js';
import { applyOverrides } from './overrides.js';
import { FONTS, font } from './text.js';

/** خط فعال با پاکت ورود/خروج — پایهٔ مشترک */
function act(song, t, pad = 0.35) {
  const cur = song.activeLine(t);
  if (cur < 0) return null;
  const L = song.lines[cur];
  const t0 = song.lineStart(cur), t1 = song.lineOut(cur);
  if (t < t0 - pad || t > t1 + pad) return null;
  const a = clamp((t - (t0 - 0.2)) / 0.25) * (1 - clamp((t - t1) / 0.3));
  return { L, cur, t0, t1, a };
}
const items = (ctx, L, ov, mode = 'pre') =>
  applyOverrides(place(ctx, L, modeFor(L, mode)), ov);

/* ── نئون ── هالهٔ چندلایه که با ضرب نفس می‌کشد ───────────── */
export function fxNeon(ctx, song, t, acc, kick, ov) {
  const A = act(song, t); if (!A) return;
  const glow = 0.35 + 0.5 * kick;
  for (const it of items(ctx, A.L, ov)) {
    const sung = t >= it.t;
    const col = sung ? acc : C.GHOST;
    if (sung) {
      // سه لایهٔ بزرگ‌شونده = هالهٔ نرم، بدون نیاز به بلور
      for (let k = 3; k >= 1; k--) {
        textFa(ctx, it.word, it.cx, it.cy, it.size * (1 + k * 0.022),
               col, A.a * glow * 0.14 * k);
      }
    }
    textFa(ctx, it.word, it.cx, it.cy, it.size, sung ? C.BONE : col, A.a * (sung ? 1 : 0.7));
  }
}

/* ── سایهٔ سه‌بعدی ── لایه‌های جابه‌جاشده پشت حرف ─────────── */
export function fx3D(ctx, song, t, acc, kick, ov) {
  const A = act(song, t); if (!A) return;
  const d = (6 + 4 * kick) * S();
  for (const it of items(ctx, A.L, ov)) {
    const sung = t >= it.t;
    if (sung) for (let k = 7; k >= 1; k--) {
      textFa(ctx, it.word, it.cx + k * d * 0.5, it.cy + k * d * 0.5,
             it.size, acc, A.a * 0.1);
    }
    textFa(ctx, it.word, it.cx, it.cy, it.size,
           sung ? C.BONE : C.GHOST, A.a * (sung ? 1 : 0.65));
  }
}

/* ── سُر خوردن ── هر کلمه از کنار وارد می‌شود ───────────── */
export function fxSlide(ctx, song, t, acc, kick, ov) {
  const A = act(song, t); if (!A) return;
  for (const it of items(ctx, A.L, ov)) {
    const k = ease.outQuart(clamp((t - (it.t - 0.28)) / 0.38));
    if (k <= 0) continue;
    const dx = (1 - k) * W * 0.35;
    const sung = t >= it.t;
    const heat = sung ? Math.exp(-(t - it.t) * 4.5) : 0;
    wordDraw(ctx, it.word, it.cx + dx, it.cy, it.size, sung, heat, 1,
             A.a * k, it.key && sung, acc);
  }
}

/* ── افتادن ── کلمه از بالا می‌افتد و کمی بالا می‌پرد ───── */
export function fxDrop(ctx, song, t, acc, kick, ov) {
  const A = act(song, t); if (!A) return;
  for (const it of items(ctx, A.L, ov)) {
    const r = (t - (it.t - 0.3)) / 0.55;
    if (r <= 0) continue;
    const k = clamp(r);
    const dy = (1 - ease.outBack(k)) * -H * 0.28;
    const sung = t >= it.t;
    const heat = sung ? Math.exp(-(t - it.t) * 4.5) : 0;
    wordDraw(ctx, it.word, it.cx, it.cy + dy, it.size, sung, heat, 1,
             A.a * clamp(k * 2), it.key && sung, acc);
  }
}

/* ── لرزش ── هر کلمه روی ضرب تکان می‌خورد ───────────────── */
export function fxShake(ctx, song, t, acc, kick, ov) {
  const A = act(song, t); if (!A) return;
  const amp = kick * 14 * S();
  for (const it of items(ctx, A.L, ov)) {
    const sung = t >= it.t;
    const h = hash(it.cx);
    const dx = Math.sin(t * 61 + h * 10) * amp * (sung ? 1 : 0.3);
    const dy = Math.cos(t * 53 + h * 10) * amp * 0.7 * (sung ? 1 : 0.3);
    const heat = sung ? Math.exp(-(t - it.t) * 4.5) : 0;
    wordDraw(ctx, it.word, it.cx + dx, it.cy + dy, it.size, sung, heat, 1,
             A.a, it.key && sung, acc);
  }
}

/* ── پردهٔ عمودی ── هر کلمه از پایین باز می‌شود ─────────── */
export function fxWipe(ctx, song, t, acc, kick, ov) {
  const A = act(song, t); if (!A) return;
  for (const it of items(ctx, A.L, ov)) {
    const k = ease.outCubic(clamp((t - (it.t - 0.2)) / 0.3));
    if (k <= 0) continue;
    const hh = it.size * 1.5;
    ctx.save();
    ctx.beginPath();
    ctx.rect(it.cx - it.w, it.cy + hh / 2 - hh * k, it.w * 2, hh * k);
    ctx.clip();
    const sung = t >= it.t;
    wordDraw(ctx, it.word, it.cx, it.cy, it.size, sung,
             sung ? Math.exp(-(t - it.t) * 4) : 0, 1, A.a, it.key && sung, acc);
    ctx.restore();
  }
}

/* ── تمرکز ── کلمه از تار به واضح می‌آید ────────────────── */
export function fxFocus(ctx, song, t, acc, kick, ov) {
  const A = act(song, t); if (!A) return;
  for (const it of items(ctx, A.L, ov)) {
    const k = clamp((t - (it.t - 0.25)) / 0.4);
    if (k <= 0) continue;
    const sung = t >= it.t;
    // تاری را با چند کپی شفاف و کمی جابه‌جا شبیه‌سازی می‌کنیم
    const blur = (1 - k) * 16 * S();
    if (blur > 0.6) {
      for (let i = 0; i < 6; i++) {
        const an = (i / 6) * Math.PI * 2;
        textFa(ctx, it.word, it.cx + Math.cos(an) * blur, it.cy + Math.sin(an) * blur,
               it.size, sung ? C.BONE : C.GHOST, A.a * 0.16);
      }
    }
    wordDraw(ctx, it.word, it.cx, it.cy, it.size, sung,
             sung ? Math.exp(-(t - it.t) * 4) : 0, 1, A.a * k, it.key && sung, acc);
  }
}

/* ── کشویی ── اندازهٔ کلمات مثل موج تغییر می‌کند ────────── */
export function fxBreath(ctx, song, t, acc, kick, ov) {
  const A = act(song, t); if (!A) return;
  const list = items(ctx, A.L, ov);
  for (let i = 0; i < list.length; i++) {
    const it = list[i];
    const sung = t >= it.t;
    const ph = i * 0.6;
    const sc = 1 + 0.16 * Math.sin(t * 2.4 + ph) + 0.1 * kick;
    ctx.save();
    ctx.translate(it.cx, it.cy);
    ctx.scale(sc, sc);
    wordDraw(ctx, it.word, 0, 0, it.size, sung,
             sung ? Math.exp(-(t - it.t) * 4.5) : 0, 1, A.a, it.key && sung, acc);
    ctx.restore();
  }
}

/* ── چرخش ── هر کلمه حول محور افقی می‌چرخد و باز می‌شود ── */
export function fxFlip(ctx, song, t, acc, kick, ov) {
  const A = act(song, t); if (!A) return;
  for (const it of items(ctx, A.L, ov)) {
    const k = ease.outCubic(clamp((t - (it.t - 0.25)) / 0.42));
    if (k <= 0) continue;
    const sy = Math.max(0.02, Math.sin(k * Math.PI / 2));
    const sung = t >= it.t;
    ctx.save();
    ctx.translate(it.cx, it.cy);
    ctx.scale(1, sy);
    wordDraw(ctx, it.word, 0, 0, it.size, sung,
             sung ? Math.exp(-(t - it.t) * 4) : 0, 1, A.a, it.key && sung, acc);
    ctx.restore();
  }
}

/* ── خط‌کشی ── زیر هر کلمهٔ خوانده‌شده خط کشیده می‌شود ──── */
export function fxUnderline(ctx, song, t, acc, kick, ov) {
  const A = act(song, t); if (!A) return;
  for (const it of items(ctx, A.L, ov)) {
    const sung = t >= it.t;
    const heat = sung ? Math.exp(-(t - it.t) * 4.5) : 0;
    wordDraw(ctx, it.word, it.cx, it.cy, it.size, sung, heat, 1,
             A.a, false, acc);
    if (sung) {
      const k = ease.outQuart(clamp((t - it.t) / 0.3));
      const y = it.cy + it.size * 0.66;
      drawLine(ctx, it.cx + it.w / 2, y, it.cx + it.w / 2 - it.w * k, y,
               acc, 4 * S(), A.a);
    }
  }
}

/* ── سایه‌روشن ── کلمهٔ فعال روشن، بقیه خیلی محو ────────── */
export function fxSpot(ctx, song, t, acc, kick, ov) {
  const A = act(song, t); if (!A) return;
  const list = items(ctx, A.L, ov);
  let ai = -1;
  for (let i = list.length - 1; i >= 0; i--) if (t >= list[i].t) { ai = i; break; }
  for (let i = 0; i < list.length; i++) {
    const it = list[i];
    const on = i === ai;
    const d = Math.abs(i - ai);
    const al = A.a * (on ? 1 : Math.max(0.12, 0.42 - d * 0.1));
    const sc = on ? 1 + 0.1 * Math.exp(-(t - it.t) * 6) : 0.94;
    ctx.save();
    ctx.translate(it.cx, it.cy);
    ctx.scale(sc, sc);
    textFa(ctx, it.word, 0, 0, it.size, on ? acc : C.BONE, al);
    ctx.restore();
  }
}

export const TEXT_FX2 = {
  neon: fxNeon, sh3d: fx3D, slide: fxSlide, drop: fxDrop, shake: fxShake,
  wipe: fxWipe, focus: fxFocus, breath: fxBreath, flip: fxFlip,
  underline: fxUnderline, spot: fxSpot,
};
