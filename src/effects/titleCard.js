import { ease, ramp, clamp, PALETTE } from '../engine/core.js';
import { setupRTL, font, FONTS, fitSize } from '../engine/text.js';

/**
 * کارت عنوان
 * ───────────
 * متن ثابت بزرگ وسط صفحه، با امکان «وارونگی رنگ» روی ضرب.
 * برای شروع و پایان کلیپ.
 */
export default {
  id: 'titleCard',
  label: 'کارت عنوان',
  category: 'متن',
  desc: 'یک یا چند خط متن ثابت وسط صفحه، با وارونگی رنگ روی ضرب.',

  params: {
    text:    { type: 'text',   label: 'متن',        def: 'نقاب' },
    sub:     { type: 'text',   label: 'زیرنویس',    def: 'زروان اکو' },
    size:    { type: 'number', label: 'اندازه',     def: 240, min: 40, max: 420, step: 10 },
    subSize: { type: 'number', label: 'اندازهٔ زیرنویس', def: 62, min: 20, max: 160, step: 2 },
    cy:      { type: 'number', label: 'ارتفاع',     def: 500, min: 100, max: 980, step: 10 },
    invert:  { type: 'number', label: 'وارونگی روی ضرب', def: 1, min: 0, max: 1, step: 1 },
    color:   { type: 'color',  label: 'رنگ',        def: PALETTE.white },
    accent:  { type: 'color',  label: 'رنگ تأکید',  def: PALETTE.crimson },
  },

  draw(ctx, e) {
    const { t, p, section, analysis: A } = e;
    const t0 = section.t0, t1 = section.t1;
    const inA  = ramp(t, t0, t0 + 0.9, ease.outCubic);
    const outA = 1 - ramp(t, t1 - 0.7, t1, ease.inQuad);
    const a = inA * outA;
    if (a <= 0) return;

    // یک فریم وارونه دقیقاً روی ضرب — همان ترفند کلیپ اصلی
    let flip = false;
    if (p.invert && A) flip = A.sinceBeat(t) < 1 / 60;

    setupRTL(ctx);
    ctx.save();
    ctx.globalAlpha = a;

    const scale = 0.94 + 0.06 * inA;
    ctx.translate(960, p.cy);
    ctx.scale(scale, scale);

    ctx.fillStyle = flip ? p.accent : p.color;
    ctx.font = font(p.size, FONTS.black);
    ctx.fillText(p.text, 0, 0);

    if (p.sub) {
      ctx.globalAlpha = a * 0.85;
      ctx.fillStyle = flip ? p.color : p.accent;
      ctx.font = font(p.subSize, FONTS.bold);
      ctx.fillText(p.sub, 0, p.size * 0.72);
    }
    ctx.restore();
  },
};
