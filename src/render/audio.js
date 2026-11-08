/**
 * پخش صدا در پیش‌نمایش — فاز R7
 * برای هر لایهٔ صوتی یک <audio> نگه می‌دارد و با زمان پروژه همگام می‌کند:
 * پخش/توقف، جابه‌جایی (seek) و بلندی با محو ورود/خروج.
 * افکت‌های صوتی در پیش‌نمایش خشک‌اند (مثل برنامهٔ قبلی)؛ در خروجی میکس می‌شوند.
 */

/** بلندی لایهٔ صوتی در زمان t (۰ خارج از بازه؛ محو ورود/خروج خطی). */
export function audioVolumeAt(layer, t) {
  const a = layer.audio || {};
  const vol = a.volume ?? 1;
  if (t < layer.start || t > layer.end) return 0;
  const local = t - layer.start;
  const dur = Math.max(0.01, layer.end - layer.start);
  let k = 1;
  const fi = a.fadeIn || 0, fo = a.fadeOut || 0;
  if (fi > 0 && local < fi) k = Math.min(k, local / fi);
  if (fo > 0 && local > dur - fo) k = Math.min(k, (dur - local) / fo);
  return Math.max(0, Math.min(1, vol * k));
}

export class AudioPlayer {
  constructor() {
    this.els = new Map(); // layerId → {el, src}
    this.muted = false;
  }

  /** همگام‌سازی با پروژه: ساخت/حذف المنت‌ها، پخش یا توقف، تنظیم زمان. */
  sync(project, t, playing) {
    if (typeof document === 'undefined') return;
    const layers = (project?.layers || []).filter(l => l.type === 'audio' && l.src);
    const seen = new Set();
    for (const l of layers) {
      seen.add(l.id);
      let rec = this.els.get(l.id);
      if (!rec || rec.src !== l.src) {
        rec?.el.pause();
        const el = document.createElement('audio');
        el.src = l.src; el.preload = 'auto';
        this.els.set(l.id, { el, src: l.src });
        rec = this.els.get(l.id);
      }
      const el = rec.el;
      el.muted = this.muted;
      el.volume = audioVolumeAt(l, t);
      const active = t >= l.start && t <= l.end;
      if (!active || !playing) {
        if (!el.paused) el.pause();
        if (active) { try { el.currentTime = Math.max(0, t - l.start); } catch { /* نه */ } }
        continue;
      }
      const target = Math.max(0, t - l.start);
      if (Math.abs(el.currentTime - target) > 0.25) {
        try { el.currentTime = target; } catch { /* نه */ }
      }
      if (el.paused) el.play().catch(() => { /* مرورگر تا تعامل کاربر صبر می‌کند */ });
    }
    for (const [id, rec] of [...this.els]) {
      if (!seen.has(id)) { rec.el.pause(); rec.el.removeAttribute('src'); this.els.delete(id); }
    }
  }

  /** فقط بلندی‌ها را تازه می‌کند (هر فریمِ پخش، برای محوها). */
  tick(project, t) {
    if (typeof document === 'undefined') return;
    for (const l of (project?.layers || [])) {
      const rec = this.els.get(l.id);
      if (rec) rec.el.volume = audioVolumeAt(l, t);
    }
  }

  stop() {
    for (const rec of this.els.values()) rec.el.pause();
  }

  setMuted(m) {
    this.muted = !!m;
    for (const rec of this.els.values()) rec.el.muted = this.muted;
  }
}
