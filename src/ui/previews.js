import { Stage } from '../engine/stage.js';
import { Renderer } from '../engine/renderer.js';

/**
 * پیش‌نمایش‌های متحرک افکت
 *
 * قبلاً هر کارت یک فریم ثابت بود، پس نمی‌شد فهمید افکت چه حرکتی
 * دارد — و همین نکته کل فایدهٔ گالری را از بین می‌برد.
 *
 * حالا همهٔ کارت‌ها یک حلقهٔ زمانی مشترک دارند که مدام از نو
 * شروع می‌شود، پس ورود و خروج هر افکت را می‌بینید.
 *
 * سه نکته برای اینکه روی گوشی کُند نشود:
 *   • فقط کارت‌هایی که واقعاً روی صفحه‌اند رندر می‌شوند
 *   • نرخ رندر ۲۰ فریم بر ثانیه است، نه ۶۰
 *   • درخشش و دانه خاموش‌اند؛ روی بوم ۱۱۰ پیکسلی دیده نمی‌شوند
 */
export class PreviewPool {
  constructor() {
    this.items = [];
    this.raf = 0;
    this.last = 0;
    this.base = 0;        // لحظهٔ شروع حلقه در زمان آهنگ
    this.loop = 2.8;      // طول حلقه (ثانیه)
    this.io = null;
    this._tick = this._tick.bind(this);
  }

  clear() {
    this.stop();
    this.io?.disconnect();
    this.io = null;
    this.items = [];
  }

  /** @param {object} o { canvas, style, song, sections, accent, customSet, lineFx } */
  add(o) {
    const st = new Stage(o.canvas);
    st.resize(o.canvas.width, o.canvas.height);
    const r = new Renderer(st);
    r.setSong(o.song);
    r.sections = [[0, 1e5, o.style, o.accent]];
    r.customSet = o.customSet || null;
    r.showFurniture = false;
    r.grain = 0;
    r.bloom = 0;          // روی بوم کوچک دیده نمی‌شود و گران است
    r.chroma = 0;
    const it = { r, visible: true, el: o.canvas };
    this.items.push(it);
    return it;
  }

  /** بعد از ساختن همهٔ کارت‌ها صدا زده می‌شود */
  observe(root) {
    if (!('IntersectionObserver' in window)) return;
    this.io?.disconnect();
    this.io = new IntersectionObserver(entries => {
      for (const e of entries) {
        const it = this.items.find(x => x.el === e.target);
        if (it) it.visible = e.isIntersecting;
      }
    }, { root: root || null, rootMargin: '60px' });
    for (const it of this.items) this.io.observe(it.el);
  }

  start(base) {
    this.base = base;
    this.t0 = performance.now();
    if (!this.raf) this.raf = requestAnimationFrame(this._tick);
  }

  stop() {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  _tick(now) {
    this.raf = requestAnimationFrame(this._tick);
    if (now - this.last < 50) return;        // حدود ۲۰ فریم بر ثانیه
    this.last = now;
    const t = this.base - 0.3 + (((now - this.t0) / 1000) % this.loop);
    for (const it of this.items) {
      if (!it.visible) continue;
      try { it.r.renderFrame(t); } catch { /* افکت خراب، کارت خالی */ }
    }
  }
}
