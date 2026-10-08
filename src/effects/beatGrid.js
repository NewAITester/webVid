import { clamp, hash, ease, ramp, PALETTE, rgba, lerp } from '../engine/core.js';

/**
 * شبکهٔ ضرب
 * ──────────
 * برای بخش‌های بی‌کلام. یک شبکه از خط‌های نازک که روی هر ضرب
 * نبض می‌زند؛ ستون‌ها با انرژی بیس بالا و پایین می‌روند.
 */
export default {
  id: 'beatGrid',
  label: 'شبکهٔ ضرب',
  category: 'پس‌زمینه',
  desc: 'شبکهٔ خطوط نازک که با ضرب آهنگ نبض می‌زند — برای بخش‌های بی‌کلام.',

  params: {
    cols:   { type: 'number', label: 'تعداد ستون', def: 16, min: 4, max: 48, step: 1 },
    height: { type: 'number', label: 'بلندی',      def: 300, min: 40, max: 700, step: 10 },
    cy:     { type: 'number', label: 'ارتفاع مرکز', def: 540, min: 100, max: 980, step: 10 },
    thick:  { type: 'number', label: 'ضخامت',      def: 3, min: 1, max: 14, step: 1 },
    color:  { type: 'color',  label: 'رنگ',        def: PALETTE.crimson },
    opacity:{ type: 'number', label: 'شفافیت',     def: 0.75, min: 0.05, max: 1, step: 0.05 },
  },

  draw(ctx, e) {
    const { t, p, section, analysis: A } = e;
    const a0 = section ? ramp(t, section.t0, section.t0 + 0.8, ease.outCubic) *
                         (1 - ramp(t, section.t1 - 0.6, section.t1, ease.inQuad)) : 1;
    if (a0 <= 0) return;

    const pulse = A ? A.pulse(t, 0.26, 2) : 0;
    const low   = A ? A.lowAt(t) : 0.5;
    const rms   = A ? A.rmsAt(t) : 0.5;

    const n = p.cols | 0;
    const span = 1500;
    const x0 = 960 - span / 2;
    const gap = span / (n - 1);

    ctx.save();
    ctx.fillStyle = p.color;
    for (let i = 0; i < n; i++) {
      // هر ستون کمی با فاز متفاوت واکنش می‌دهد
      const ph = hash(i * 3.7);
      const h = p.height * (0.18 + 0.82 * (0.35 * low + 0.35 * rms + 0.3 * pulse * (0.4 + ph)));
      const x = x0 + i * gap;
      ctx.globalAlpha = clamp(p.opacity * a0 * (0.35 + 0.65 * ph));
      ctx.fillRect(x - p.thick / 2, p.cy - h / 2, p.thick, h);
    }

    // خط افق
    ctx.globalAlpha = 0.18 * a0;
    ctx.fillRect(x0, p.cy - 1, span, 2);
    ctx.restore();
  },
};
