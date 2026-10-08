import { W as DW, H as DH } from './song.js';

/**
 * صحنه (Stage) — پل بین «فضای طراحی» و بوم واقعی.
 *
 * چرا لازم است؟ پیش‌نمایش ممکن است ۹۶۰×۵۴۰ باشد و خروجی نهایی
 * ۱۹۲۰×۱۰۸۰. اگر افکت‌ها مستقیم با پیکسل بوم کار کنند، ضخامت خط و
 * اندازهٔ ذره در خروجی با چیزی که دیده‌اید فرق می‌کند.
 * راه‌حل: همه با مختصات ۱۹۲۰×۱۰۸۰ می‌کشند و اینجا مقیاس می‌شود.
 */
export class Stage {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.scale = 1;
  }

  /** بوم را به اندازهٔ دلخواه تنظیم می‌کند (پیکسل واقعی، نه CSS) */
  resize(w, h) {
    w = Math.max(2, Math.round(w));
    h = Math.max(2, Math.round(h));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    this.scale = Math.min(w / DW, h / DH);
    return this;
  }

  /** ترنسفرم را طوری می‌چیند که (0,0)..(1920,1080) وسط بوم بیفتد */
  begin() {
    const { ctx, canvas, scale } = this;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const ox = (canvas.width - DW * scale) / 2;
    const oy = (canvas.height - DH * scale) / 2;
    ctx.setTransform(scale, 0, 0, scale, ox, oy);
    ctx.save();
    return ctx;
  }

  end() {
    this.ctx.restore();
  }

  /** تبدیل مختصات رویداد موس/لمس به فضای طراحی — برای درگ کردن کلمات */
  toDesign(clientX, clientY) {
    const r = this.canvas.getBoundingClientRect();
    const px = (clientX - r.left) * (this.canvas.width / r.width);
    const py = (clientY - r.top) * (this.canvas.height / r.height);
    const ox = (this.canvas.width - DW * this.scale) / 2;
    const oy = (this.canvas.height - DH * this.scale) / 2;
    return { x: (px - ox) / this.scale, y: (py - oy) / this.scale };
  }
}
