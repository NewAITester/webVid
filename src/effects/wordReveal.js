import { ease, clamp, ramp, rgba, PALETTE } from '../engine/core.js';
import { layoutLine, setupRTL, font, hitTest } from '../engine/text.js';
import { lineAt, activeWord } from '../engine/lyrics.js';

/**
 * ظهور کلمه‌به‌کلمه
 * ──────────────────
 * پایه‌ای‌ترین افکت لیریک: خط روی صفحه است، هر کلمه دقیقاً وقتی
 * خوانده می‌شود رنگش عوض می‌شود.
 *
 * فقط دو رنگ: خاکستری برای کلمات خوانده‌نشده، قرمز برای کلمهٔ فعال.
 */
export default {
  id: 'wordReveal',
  label: 'ظهور کلمه‌به‌کلمه',
  category: 'متن',
  desc: 'خط شعر وسط صفحه می‌آید و هر کلمه در لحظهٔ خوانده شدن قرمز می‌شود.',

  params: {
    size:     { type: 'number', label: 'اندازهٔ متن', def: 0,   min: 0,  max: 200, step: 2, hint: '۰ یعنی خودکار' },
    cy:       { type: 'number', label: 'ارتفاع',      def: 540, min: 100, max: 980, step: 10 },
    rise:     { type: 'number', label: 'بالا آمدن',   def: 34,  min: 0,  max: 160, step: 2 },
    popScale: { type: 'number', label: 'بزرگ‌نمایی کلمهٔ فعال', def: 1.1, min: 1, max: 1.6, step: 0.02 },
    stagger:  { type: 'number', label: 'تأخیر پلکانی', def: 0.05, min: 0, max: 0.4, step: 0.01 },
    idle:     { type: 'color',  label: 'رنگ عادی',    def: PALETTE.grey },
    active:   { type: 'color',  label: 'رنگ فعال',    def: PALETTE.crimson },
  },

  /**
   * @param ctx بوم (در فضای ۱۹۲۰×۱۰۸۰)
   * @param e   محیط: { t, lyrics, analysis, p (پارامترها), overrides }
   */
  draw(ctx, e) {
    const { t, lyrics, p } = e;
    const line = lineAt(lyrics, t, 0.6);
    if (!line) return;

    setupRTL(ctx);
    const { items } = layoutLine(ctx, line, {
      cy: p.cy, size: p.size || null, overrides: e.overrides,
    });

    const ai = activeWord(line, t);
    const out = ramp(t, line.end, line.end + 0.45, ease.inQuad); // محو شدن خط

    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const w = it.word;

      // هر کلمه کمی بعد از قبلی وارد می‌شود
      const t0 = line.t + i * p.stagger;
      const inA = ramp(t, t0 - 0.42, t0 + 0.1, ease.outCubic);
      if (inA <= 0) continue;

      const alpha = inA * (1 - out);
      const dy = (1 - inA) * p.rise;

      // کلمهٔ فعال: قرمز و کمی بزرگ‌تر
      const isActive = i === ai;
      const hot = isActive ? ramp(t, w.t, w.t + 0.14, ease.outBack) : (i < ai ? 1 : 0);
      const scale = 1 + (isActive ? (p.popScale - 1) * hot : 0);
      const color = i <= ai ? p.active : p.idle;

      ctx.save();
      ctx.translate(it.x, it.y + dy);
      ctx.scale(scale, scale);
      ctx.globalAlpha = alpha * (i <= ai ? 1 : 0.72);
      ctx.fillStyle = color;
      ctx.font = font(it.size, it.family);
      ctx.fillText(w.text, 0, 0);
      ctx.restore();
    }
  },

  /** برای درگ کردن: کادر هر کلمه در لحظهٔ t کجاست */
  pick(ctx, e, px, py) {
    const line = lineAt(e.lyrics, e.t, 0.6);
    if (!line) return null;
    setupRTL(ctx);
    const { items } = layoutLine(ctx, line, {
      cy: e.p.cy, size: e.p.size || null, overrides: e.overrides,
    });
    return hitTest(items, px, py);
  },
};
