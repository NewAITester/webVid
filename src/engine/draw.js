import { rgba } from './core.js';
import { font, FONTS } from './text.js';
import { C } from './song.js';

/* ── ابزارهای هندسی ─────────────────────────────────────────── */

export function rect(ctx, x, y, w, h, color, a = 1) {
  ctx.fillStyle = rgba(color, a);
  ctx.fillRect(x, y, w, h);
}

export function line(ctx, x0, y0, x1, y1, color, lw = 2, a = 1) {
  if (a <= 0.003) return;
  ctx.strokeStyle = rgba(color, a);
  ctx.lineWidth = lw;
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
}

export function ring(ctx, cx, cy, r, color, lw = 2, a = 1) {
  if (a <= 0.003 || r <= 0) return;
  ctx.strokeStyle = rgba(color, a);
  ctx.lineWidth = lw;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();
}

/* ── متن ────────────────────────────────────────────────────── */

/**
 * متن فارسی وسط‌چین.
 * baseline: 'mid' وسط حرف، 'cap' بالای حرف
 */
export function textFa(ctx, s, x, y, size, color, a = 1,
                       family = FONTS.black, align = 'center', baseline = 'mid') {
  if (a <= 0.004 || !s) return;
  ctx.save();
  ctx.direction = 'rtl';
  ctx.textAlign = align;
  ctx.textBaseline = baseline === 'mid' ? 'middle' : 'alphabetic';
  ctx.font = font(size, family);
  ctx.fillStyle = rgba(color, a);
  ctx.fillText(s, x, baseline === 'cap' ? y + size * 0.74 : y);
  ctx.restore();
}

/** متن لاتین تک‌فاصله با فاصلهٔ حروف — برای Telegram: @ZurvanEcho */
export function textMono(ctx, s, x, y, size, color, a = 1, tracking = 4, align = 'left') {
  if (a <= 0.004 || !s) return;
  ctx.save();
  ctx.direction = 'ltr';
  ctx.textBaseline = 'alphabetic';
  ctx.font = `${size}px ui-monospace, "SF Mono", Menlo, Consolas, monospace`;
  ctx.fillStyle = rgba(color, a);
  if ('letterSpacing' in ctx) ctx.letterSpacing = `${tracking}px`;
  ctx.textAlign = align;
  ctx.fillText(s, x, y + size * 0.74);
  if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
  ctx.restore();
}

/**
 * متن تورفته (outline)
 *
 * در پایتون با erode کردن ماسک ساخته می‌شد. در canvas مستقیماً
 * strokeText داریم که همان نتیجه را می‌دهد و خیلی سریع‌تر است.
 */
export function outlineTextFa(ctx, s, x, y, size, color, a = 1,
                              family = FONTS.black, w = 3) {
  if (a <= 0.004 || !s) return;
  ctx.save();
  ctx.direction = 'rtl';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = font(size, family);
  ctx.lineWidth = w;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = rgba(color, a);
  ctx.strokeText(s, x, y);
  ctx.restore();
}

/**
 * کشیدن یک کلمهٔ شعر — ترجمهٔ وفادار word_draw
 *
 * سه حالت دارد و تفاوتشان ظریف ولی تعیین‌کننده است:
 *   • خوانده‌نشده  → خاکستری محو (GHOST)
 *   • کلمهٔ کلیدی  → رنگ تأکید، با هالهٔ سفید محوشونده
 *   • بقیهٔ کلمات  → سفید استخوانی، با هالهٔ رنگ تأکید محوشونده
 *
 * یعنی برخلاف تصور اول، همهٔ کلمات خوانده‌شده قرمز نمی‌شوند؛
 * فقط کلمهٔ کلیدی. بقیه سفیدند و فقط لحظه‌ای هالهٔ قرمز می‌گیرند.
 */
export function wordDraw(ctx, word, cx, cy, size, sung, heat, pop, a, isKey, acc, invert = false) {
  if (a <= 0.01) return;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(pop, pop);

  const base = invert ? C.BG : C.BONE;
  const gh   = invert ? '#8E8E96' : C.GHOST;

  if (!sung) {
    textFa(ctx, word, 0, 0, size, gh, 0.8 * a);
  } else if (isKey) {
    if (heat > 0.02) textFa(ctx, word, 0, 0, size * 1.03, C.BONE, heat * 0.5 * a);
    textFa(ctx, word, 0, 0, size, acc, a);
  } else {
    if (heat > 0.02) textFa(ctx, word, 0, 0, size * 1.03, acc, heat * a);
    textFa(ctx, word, 0, 0, size, base, a);
  }
  ctx.restore();
}
