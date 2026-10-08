import { clamp, hash, lerp, noise1, rgba, PALETTE } from '../engine/core.js';

/**
 * میدان ذرات واکنش‌گر به ریتم
 * ────────────────────────────
 * یک ابر ذره که در حالت عادی آرام می‌چرخد و روی هر ضرب از مرکز
 * به بیرون «هل» داده می‌شود.
 *
 * هر ذره یک «خانه» ثابت دارد و همیشه به آن برمی‌گردد — برای همین
 * ابر هیچ‌وقت از هم نمی‌پاشد.
 */
const N_MAX = 900;

export default {
  id: 'particleField',
  label: 'میدان ذرات',
  category: 'پس‌زمینه',
  desc: 'ابر ذرات که روی هر ضرب آهنگ از مرکز به بیرون هل داده می‌شود.',

  params: {
    count:  { type: 'number', label: 'تعداد ذرات', def: 420, min: 40, max: N_MAX, step: 20 },
    radius: { type: 'number', label: 'شعاع ابر',   def: 520, min: 100, max: 1000, step: 20 },
    push:   { type: 'number', label: 'قدرت ضربه',  def: 120, min: 0, max: 400, step: 10 },
    spin:   { type: 'number', label: 'چرخش',       def: 0.1, min: -0.6, max: 0.6, step: 0.02 },
    drift:  { type: 'number', label: 'شناوری',     def: 26,  min: 0, max: 120, step: 2 },
    dot:    { type: 'number', label: 'اندازهٔ ذره', def: 2.6, min: 0.6, max: 8, step: 0.2 },
    color:  { type: 'color',  label: 'رنگ',        def: PALETTE.crimson },
    opacity:{ type: 'number', label: 'شفافیت',     def: 0.5, min: 0.05, max: 1, step: 0.05 },
  },

  draw(ctx, e) {
    const { t, analysis: A, p } = e;
    const pulse = A ? A.pulse(t, 0.3, 2) : 0;
    const lowE  = A ? A.lowAt(t) : 0.5;

    ctx.save();
    ctx.translate(960, 540);
    ctx.fillStyle = p.color;

    const n = Math.min(p.count | 0, N_MAX);
    for (let i = 0; i < n; i++) {
      // خانهٔ ثابت ذره — با مارپیچ طلایی پخش می‌شود تا یکنواخت باشد
      const a0 = i * 2.39996;
      const r0 = Math.sqrt(i / n) * p.radius;

      const ang = a0 + t * p.spin + noise1(i * 0.21 + t * 0.26) * 0.3;
      const push = pulse * p.push * (0.45 + hash(i * 7.7) * 0.55);
      const dr   = noise1(i * 0.37 + t * 0.4) * p.drift;
      const r    = r0 + push + dr;

      const x = Math.cos(ang) * r;
      const y = Math.sin(ang) * r * 0.78;   // کمی بیضی، طبیعی‌تر است

      const a = p.opacity * (0.25 + 0.75 * hash(i * 2.3)) * (0.6 + 0.4 * lowE);
      ctx.globalAlpha = clamp(a);
      const s = p.dot * (0.6 + hash(i * 4.1) * 0.8) * (1 + pulse * 0.5);
      ctx.fillRect(x - s / 2, y - s / 2, s, s);
    }
    ctx.restore();
  },
};
