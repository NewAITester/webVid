import { easeFn, BEZIER_OF } from '../motion/easing.js';

/**
 * ویرایشگر منحنی بزیه — همان «گراف سرعت» Alight Motion
 * ─────────────────────────────────────────────────────────────
 * دو دستگیره دارید. محور افقی زمان است و عمودی پیشرفت حرکت.
 *   • دستگیرهٔ اول نزدیک کف = شروع آرام
 *   • دستگیرهٔ دوم نزدیک سقف = پایان آرام
 *   • بالاتر از سقف بردن = «فراتر رفتن» و برگشتن
 * یک نقطهٔ قرمز هم مدام روی منحنی حرکت می‌کند تا حسش را ببینید.
 */
export class BezierEditor {
  /** @param {(bez:number[])=>void} onChange */
  constructor(onChange) {
    this.onChange = onChange;
    this.v = [0.42, 0, 0.58, 1];
    this.cv = document.createElement('canvas');
    this.cv.className = 'bez';
    this.cv.width = 520; this.cv.height = 400;
    this._drag = -1;
    this._raf = 0;
    this._t0 = performance.now();
    this._bind();
  }

  /** مقدار را از نام منحنی یا آرایه تنظیم کن */
  set(spec) {
    if (Array.isArray(spec)) this.v = spec.slice();
    else if (BEZIER_OF[spec]) this.v = BEZIER_OF[spec].slice();
    this.spec = spec;
    this.draw();
  }

  // فضای منحنی: x در ۰..۱، y در -۰٫۵..۱٫۵
  _box() {
    const { width: w, height: h } = this.cv;
    const pad = 36;
    return { x0: pad, x1: w - pad, y0: h - pad - (h - 2 * pad) * 0.25, y1: pad + (h - 2 * pad) * 0.25, w, h, pad };
  }
  _toPx(x, y) { const b = this._box(); return [b.x0 + (b.x1 - b.x0) * x, b.y0 + (b.y1 - b.y0) * y]; }
  _fromPx(px, py) {
    const b = this._box();
    return [Math.min(1, Math.max(0, (px - b.x0) / (b.x1 - b.x0))),
            Math.min(1.6, Math.max(-0.6, (py - b.y0) / (b.y1 - b.y0)))];
  }

  _bind() {
    const pos = e => {
      const r = this.cv.getBoundingClientRect();
      return [(e.clientX - r.left) * (this.cv.width / r.width), (e.clientY - r.top) * (this.cv.height / r.height)];
    };
    this.cv.addEventListener('pointerdown', e => {
      const [x, y] = pos(e);
      const p1 = this._toPx(this.v[0], this.v[1]), p2 = this._toPx(this.v[2], this.v[3]);
      const d1 = Math.hypot(x - p1[0], y - p1[1]), d2 = Math.hypot(x - p2[0], y - p2[1]);
      this._drag = d1 < d2 ? 0 : 1;
      this.cv.setPointerCapture(e.pointerId);
      e.preventDefault();
    });
    this.cv.addEventListener('pointermove', e => {
      if (this._drag < 0) return;
      const [x, y] = this._fromPx(...pos(e));
      const i = this._drag * 2;
      this.v[i] = +x.toFixed(3); this.v[i + 1] = +y.toFixed(3);
      this.spec = this.v.slice();
      this.draw();
      e.preventDefault();
    });
    const up = () => {
      if (this._drag < 0) return;
      this._drag = -1;
      this.onChange?.(this.v.slice());
    };
    this.cv.addEventListener('pointerup', up);
    this.cv.addEventListener('pointercancel', up);
  }

  start() {
    cancelAnimationFrame(this._raf);
    const tick = () => { this.draw(); this._raf = requestAnimationFrame(tick); };
    this._raf = requestAnimationFrame(tick);
  }
  stop() { cancelAnimationFrame(this._raf); }

  draw() {
    const c = this.cv.getContext('2d'), b = this._box();
    c.clearRect(0, 0, b.w, b.h);
    c.fillStyle = '#07080B'; c.fillRect(0, 0, b.w, b.h);
    // شبکه
    c.strokeStyle = '#1C2130'; c.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const x = b.x0 + ((b.x1 - b.x0) * i) / 4;
      c.beginPath(); c.moveTo(x, b.pad / 2); c.lineTo(x, b.h - b.pad / 2); c.stroke();
    }
    c.strokeStyle = '#2C3446';
    for (const y of [b.y0, b.y1]) { c.beginPath(); c.moveTo(b.x0, y); c.lineTo(b.x1, y); c.stroke(); }
    c.fillStyle = '#5A6372'; c.font = '20px system-ui'; c.textAlign = 'left';
    c.fillText('۰', 8, b.y0 + 6); c.fillText('۱', 8, b.y1 + 6);

    const f = easeFn(this.spec && !Array.isArray(this.spec) && !BEZIER_OF[this.spec] ? this.spec : this.v);
    // خط خطی برای مقایسه
    c.setLineDash([6, 6]); c.strokeStyle = '#39425A';
    c.beginPath(); c.moveTo(...this._toPx(0, 0)); c.lineTo(...this._toPx(1, 1)); c.stroke();
    c.setLineDash([]);
    // منحنی
    c.strokeStyle = '#E4142A'; c.lineWidth = 4; c.beginPath();
    for (let i = 0; i <= 80; i++) {
      const x = i / 80, [px, py] = this._toPx(x, f(x));
      if (i) c.lineTo(px, py); else c.moveTo(px, py);
    }
    c.stroke();
    // دستگیره‌ها
    const p0 = this._toPx(0, 0), p3 = this._toPx(1, 1);
    const p1 = this._toPx(this.v[0], this.v[1]), p2 = this._toPx(this.v[2], this.v[3]);
    c.strokeStyle = '#9AA3B4'; c.lineWidth = 2;
    c.beginPath(); c.moveTo(...p0); c.lineTo(...p1); c.stroke();
    c.beginPath(); c.moveTo(...p3); c.lineTo(...p2); c.stroke();
    for (const p of [p1, p2]) {
      c.fillStyle = '#F6F3EC'; c.beginPath(); c.arc(p[0], p[1], 13, 0, Math.PI * 2); c.fill();
      c.strokeStyle = '#E4142A'; c.lineWidth = 3; c.stroke();
    }
    // نقطهٔ نمایشی که روی منحنی حرکت می‌کند
    const u = ((performance.now() - this._t0) / 1400) % 1.4;
    const x = Math.min(1, u), [mx, my] = this._toPx(x, f(x));
    c.fillStyle = '#FFD84D'; c.beginPath(); c.arc(mx, my, 9, 0, Math.PI * 2); c.fill();
    // نوار پیشرفت در پایین: جای واقعی شیء
    const by = b.h - 12;
    c.fillStyle = '#1C2130'; c.fillRect(b.x0, by - 3, b.x1 - b.x0, 6);
    c.fillStyle = '#FFD84D';
    c.beginPath(); c.arc(b.x0 + (b.x1 - b.x0) * Math.min(1.3, Math.max(-0.3, f(x))), by, 8, 0, Math.PI * 2); c.fill();
  }
}

/** آیکون کوچک SVG یک منحنی — برای دکمه‌های گالری منحنی */
export function easeIcon(spec, w = 44, h = 30) {
  const f = easeFn(spec);
  const pts = [];
  for (let i = 0; i <= 24; i++) {
    const x = i / 24, y = f(x);
    pts.push(`${(4 + x * (w - 8)).toFixed(1)},${(h - 6 - y * (h - 14)).toFixed(1)}`);
  }
  return `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}"><polyline points="${pts.join(' ')}" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>`;
}
