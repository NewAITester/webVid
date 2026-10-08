import { clamp, hash2, rgba, PALETTE, lerp } from '../engine/core.js';

/**
 * پس‌زمینه و دانهٔ فیلم
 * ──────────────────────
 * یک گرادیان شعاعی تیره که با بیس آهنگ نفس می‌کشد، به‌علاوهٔ دانه.
 *
 * نکتهٔ مهم: دانه اینجا تقریباً رایگان است. در نسخهٔ پایتون همین
 * دانه ۴۰٪ حجم فایل و کلی زمان CPU می‌خورد؛ اینجا یک بافت کوچک
 * است که فقط جابه‌جا می‌شود.
 */
let grainTile = null;

function makeGrain(size = 128) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const img = g.createImageData(size, size);
  for (let i = 0; i < size * size; i++) {
    const v = (hash2(i % size, (i / size) | 0) * 255) | 0;
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return c;
}

export default {
  id: 'backdrop',
  label: 'پس‌زمینه',
  category: 'پس‌زمینه',
  desc: 'گرادیان تیره که با بیس آهنگ نفس می‌کشد، به‌علاوهٔ دانهٔ فیلم.',

  params: {
    bg:     { type: 'color',  label: 'رنگ زمینه',  def: PALETTE.bg },
    glow:   { type: 'color',  label: 'رنگ هاله',   def: '#3A0A12' },
    amount: { type: 'number', label: 'شدت هاله',   def: 0.8, min: 0, max: 2, step: 0.05 },
    react:  { type: 'number', label: 'واکنش به بیس', def: 0.45, min: 0, max: 1.5, step: 0.05 },
    grain:  { type: 'number', label: 'دانهٔ فیلم', def: 0.07, min: 0, max: 0.35, step: 0.01 },
    vignette:{type: 'number', label: 'ویگنت',      def: 0.55, min: 0, max: 1.2, step: 0.05 },
  },

  draw(ctx, e) {
    const { t, p, analysis: A } = e;
    const low = A ? A.lowAt(t) : 0.5;

    ctx.save();
    ctx.fillStyle = p.bg;
    ctx.fillRect(0, 0, 1920, 1080);

    // هالهٔ مرکزی که با بیس بزرگ و کوچک می‌شود
    const r = 760 * (1 + low * p.react);
    const g = ctx.createRadialGradient(960, 560, 0, 960, 560, r);
    g.addColorStop(0, rgba(p.glow, 0.9 * p.amount * (0.6 + low * 0.6)));
    g.addColorStop(0.55, rgba(p.glow, 0.25 * p.amount));
    g.addColorStop(1, rgba(p.glow, 0));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 1920, 1080);

    // ویگنت
    if (p.vignette > 0) {
      const v = ctx.createRadialGradient(960, 540, 420, 960, 540, 1180);
      v.addColorStop(0, 'rgba(0,0,0,0)');
      v.addColorStop(1, `rgba(0,0,0,${clamp(p.vignette)})`);
      ctx.fillStyle = v;
      ctx.fillRect(0, 0, 1920, 1080);
    }
    ctx.restore();
  },

  /** دانه بعد از همه‌چیز کشیده می‌شود — پس تابع جدا دارد */
  post(ctx, e) {
    const { t, p } = e;
    if (p.grain <= 0) return;
    if (!grainTile) grainTile = makeGrain(128);
    const f = Math.floor(t * 60);
    ctx.save();
    ctx.globalAlpha = p.grain;
    ctx.globalCompositeOperation = 'overlay';
    const ox = -(hash2(f, 1) * 128) | 0;
    const oy = -(hash2(f, 2) * 128) | 0;
    const pat = ctx.createPattern(grainTile, 'repeat');
    ctx.translate(ox, oy);
    ctx.fillStyle = pat;
    ctx.fillRect(0, 0, 1920 + 128, 1080 + 128);
    ctx.restore();
  },
};
