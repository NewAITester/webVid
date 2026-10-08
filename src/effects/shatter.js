import { ease, clamp, ramp, hash, PALETTE } from '../engine/core.js';
import { setupRTL, font, FONTS, fitSize } from '../engine/text.js';
import { lineAt } from '../engine/lyrics.js';
import { textPoints } from '../engine/glyphs.js';

/**
 * پاشیدن حروف
 * ─────────────
 * کلمه به هزاران نقطه تجزیه می‌شود و نقطه‌ها پخش می‌شوند.
 *
 * ترفند اصلی: نقطه‌ها از قبل حساب شده‌اند (ابر نقطه)، و هر نقطه
 * یک جهت ثابت دارد که از hash شماره‌اش می‌آید. چون hash همیشه
 * همان عدد را می‌دهد، انیمیشن کاملاً تکرارپذیر است.
 *
 * زمان‌بندی هر خط، مستقل از طول خط:
 *   ظهور (۰٫۳۵ث) → مکث (hold) → پاشیدن (burstDur) → خالی
 * اگر پاشیدن به طول خط گره بخورد، در خطوط بلند بیشتر عمرش
 * نامرئی می‌شود — اشتباهی که اول مرتکب شدیم.
 */
export default {
  id: 'shatter',
  label: 'پاشیدن حروف',
  category: 'متن',
  desc: 'کلمه چند لحظه می‌ماند، بعد به ذرات ریز تجزیه می‌شود و پخش می‌شود.',

  params: {
    size:     { type: 'number', label: 'حداکثر اندازه', def: 150, min: 40, max: 300, step: 5, hint: 'متن بلند خودکار کوچک می‌شود' },
    maxW:     { type: 'number', label: 'عرض مجاز',     def: 1680, min: 600, max: 1900, step: 20 },
    cy:       { type: 'number', label: 'ارتفاع',       def: 540, min: 100, max: 980, step: 10 },
    step:     { type: 'number', label: 'تراکم ذرات',   def: 5,   min: 3, max: 12, step: 1, hint: 'کمتر = ذرات بیشتر' },
    spread:   { type: 'number', label: 'میزان پخش',    def: 300, min: 40, max: 900, step: 10 },
    dot:      { type: 'number', label: 'اندازهٔ ذره',  def: 3.4, min: 1, max: 9, step: 0.2 },
    hold:     { type: 'number', label: 'مکث قبل از پاشیدن', def: 0.85, min: 0, max: 3, step: 0.05 },
    burstDur: { type: 'number', label: 'مدت پاشیدن',   def: 1.15, min: 0.3, max: 3, step: 0.05 },
    gravity:  { type: 'number', label: 'جاذبه',        def: 150, min: -400, max: 700, step: 20 },
    color:    { type: 'color',  label: 'رنگ',          def: PALETTE.crimson },
  },

  /** زمان‌بندی مشترک بین draw و انتخاب تصویر کوچک */
  phase(line, t, p) {
    const rel = t - line.t;
    const appear = ramp(t, line.t - 0.3, line.t + 0.35, ease.outCubic);
    const burst  = ramp(rel, p.hold, p.hold + p.burstDur, ease.outQuad);
    return { rel, appear, burst };
  },

  draw(ctx, e) {
    const { t, lyrics, p } = e;
    const line = lineAt(lyrics, t, 1.2);
    if (!line) return;

    const { appear, burst } = this.phase(line, t, p);
    if (appear <= 0.001) return;

    setupRTL(ctx);
    const text = line.text;
    // مثل افکت متن معمولی: اگر خط بلند باشد خودکار کوچک می‌شود
    // تا از دو طرف صفحه بیرون نزند.
    const fs = fitSize(ctx, text, p.maxW, p.size, 30, FONTS.black);

    ctx.save();
    ctx.translate(960, p.cy);

    // هنوز نپاشیده: کلمهٔ سالم
    if (burst <= 0.001) {
      ctx.globalAlpha = appear;
      ctx.fillStyle = p.color;
      ctx.font = font(fs, FONTS.black);
      ctx.fillText(text, 0, 0);
      ctx.restore();
      return;
    }
    // کاملاً پاشیده و رفته
    if (burst >= 0.999) { ctx.restore(); return; }

    const pts = textPoints(text, fs, FONTS.black, p.step);
    if (!pts.length) { ctx.restore(); return; }

    ctx.fillStyle = p.color;
    const g = burst * burst * p.gravity;
    for (let i = 0; i < pts.length; i++) {
      const q = pts[i];
      const ang = hash(i * 1.7) * Math.PI * 2;
      const mag = (0.35 + hash(i * 3.1) * 0.65) * p.spread;
      const lag = hash(i * 5.3) * 0.32;           // هر ذره کمی دیرتر راه می‌افتد
      const b = clamp((burst - lag) / (1 - lag));
      const bb = ease.outQuad(b);

      const x = q.x + Math.cos(ang) * mag * bb;
      const y = q.y + Math.sin(ang) * mag * bb + g * b * b;
      const a = (1 - b) * appear;
      if (a <= 0.02) continue;
      ctx.globalAlpha = a;
      const s = p.dot * (1 - b * 0.4);
      ctx.fillRect(x - s / 2, y - s / 2, s, s);
    }
    ctx.restore();
  },
};
