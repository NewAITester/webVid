/** پول رسانه: کش تصویر/ویدیو بر اساس src. */
export class MediaPool {
  constructor() { this.cache = new Map(); }
  image(src) {
    if (!src) return null;
    let e = this.cache.get(src);
    if (!e) { e = new Image(); e.src = src; this.cache.set(src, e); }
    return e.complete && e.naturalWidth ? e : null;
  }
  video(src) {
    if (!src) return null;
    let e = this.cache.get(src);
    if (!e) {
      e = document.createElement('video');
      e.src = src; e.muted = true; e.playsInline = true; e.preload = 'auto';
      this.cache.set(src, e);
    }
    return e.readyState >= 2 ? e : null;
  }
  seekVideo(src, t) {
    const v = this.cache.get(src);
    if (v && Math.abs(v.currentTime - t) > 0.12) { try { v.currentTime = t; } catch { /* نه */ } }
  }
}
