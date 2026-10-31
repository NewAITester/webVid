/**
 * استخر رسانه — تصویر و ویدیوهایی که به پروژه اضافه شده‌اند
 * ─────────────────────────────────────────────────────────────
 * فایل‌ها به‌صورت Blob در IndexedDB ذخیره می‌شوند (library.js) و
 * اینجا به عنصر <img> یا <video> تبدیل می‌شوند تا روی بوم کشیده شوند.
 *
 * ویدیو چالش دارد: کشیدنش روی بوم همان فریمی را می‌دهد که الان در
 * عنصر video نمایش داده می‌شود. پس:
 *   • هنگام پخش: ویدیو را بی‌صدا هم‌زمان پخش می‌کنیم و اگر بیش از
 *     ربع ثانیه عقب/جلو افتاد، جایش را درست می‌کنیم.
 *   • هنگام توقف و اسکراب: جای ویدیو را تنظیم می‌کنیم و وقتی فریم
 *     رسید (seeked) دوباره می‌کشیم.
 *   • هنگام خروجی: قبل از هر فریم صبر می‌کنیم تا ویدیو دقیقاً به آن
 *     لحظه برسد — کندتر، ولی فریم‌به‌فریم دقیق.
 */
export class MediaPool {
  constructor() {
    this.items = new Map();       // id → { id, type, name, url, el, w, h, dur, ready }
    this.onUpdate = null;         // وقتی فریم تازه‌ای آماده شد (برای کشیدن دوباره)
  }

  clear() {
    for (const it of this.items.values()) {
      try { it.el?.pause?.(); } catch { /* */ }
      URL.revokeObjectURL(it.url);
    }
    this.items.clear();
  }

  /** @param {{id, type:'image'|'video', name, blob}} rec */
  add(rec) {
    if (this.items.has(rec.id)) return this.items.get(rec.id);
    const url = URL.createObjectURL(rec.blob);
    const it = { id: rec.id, type: rec.type, name: rec.name, url, el: null, w: 1, h: 1, dur: 0, ready: false };
    if (rec.type === 'image') {
      const img = new Image();
      img.onload = () => { it.w = img.naturalWidth; it.h = img.naturalHeight; it.ready = true; this.onUpdate?.(); };
      img.src = url;
      it.el = img;
    } else {
      const v = document.createElement('video');
      v.muted = true; v.playsInline = true; v.preload = 'auto'; v.crossOrigin = 'anonymous';
      v.setAttribute('playsinline', '');
      v.onloadeddata = () => {
        it.w = v.videoWidth; it.h = v.videoHeight; it.dur = v.duration || 0; it.ready = true;
        this.onUpdate?.();
      };
      v.onseeked = () => this.onUpdate?.();
      v.src = url;
      it.el = v;
    }
    this.items.set(rec.id, it);
    return it;
  }

  get(id) { return this.items.get(id) || null; }
  list() { return [...this.items.values()]; }
  remove(id) {
    const it = this.items.get(id);
    if (!it) return;
    try { it.el?.pause?.(); } catch { /* */ }
    URL.revokeObjectURL(it.url);
    this.items.delete(id);
  }

  /** پنجرهٔ منبع کلیپ: [شروع، پایان] بر حسب ثانیهٔ فایل.
   *  trimOut برابر null یعنی تا انتهای فایل (یا it.dur اگر معلوم باشد). */
  static sourceWindow(L, it) {
    const start = Math.max(0, L.data?.trimIn || 0);
    let end = L.data?.trimOut;
    if (end == null || !(end > start)) end = it?.dur > 0 ? it.dur : start + 1e9;
    return [start, Math.max(start + 0.01, end)];
  }

  /** زمانی از فایل ویدیو که باید در زمان محلی lt نمایش داده شود.
   *  با تکرار: داخل پنجرهٔ [trimIn, trimOut) می‌چرخد؛ بدون تکرار:
   *  در پایان پنجره می‌ایستد (نه در پایان فایل). */
  static mediaTime(L, lt, it) {
    const sp = L.data?.speed || 1;
    const [start, end] = MediaPool.sourceWindow(L, it);
    const win = end - start;
    let mt;
    if (L.data?.loop !== false) mt = start + ((lt * sp) % win + win) % win;
    else mt = Math.min(start + lt * sp, end - 0.04);
    return Math.max(start, mt);
  }

  /** هم‌زمان کردن ویدیو با زمان پیش‌نمایش (بدون انتظار) */
  sync(L, lt, playing) {
    const it = this.get(L.data?.media);
    if (!it || it.type !== 'video' || !it.ready) return;
    const v = it.el, mt = MediaPool.mediaTime(L, lt, it);
    if (playing) {
      v.playbackRate = Math.min(4, Math.max(0.25, L.data?.speed || 1));
      if (v.paused) v.play().catch(() => {});
      if (Math.abs(v.currentTime - mt) > 0.25) v.currentTime = mt;
    } else {
      if (!v.paused) v.pause();
      if (Math.abs(v.currentTime - mt) > 0.02 && !v.seeking) v.currentTime = mt;
    }
  }

  /** همهٔ ویدیوهای فعال را متوقف کن (وقتی پخش می‌ایستد) */
  pauseAll() {
    for (const it of this.items.values()) if (it.type === 'video' && !it.el.paused) it.el.pause();
  }

  /** برای خروجی: صبر تا ویدیوهای فعال دقیقاً به لحظهٔ t برسند */
  async prepare(layers, t) {
    const jobs = [];
    for (const L of layers || []) {
      if (L.type !== 'video' || !L.visible || t < L.t0 || t > L.t1) continue;
      const it = this.get(L.data?.media);
      if (!it?.ready) continue;
      const v = it.el;
      if (!v.paused) v.pause();
      const mt = MediaPool.mediaTime(L, t - L.t0, it);
      if (Math.abs(v.currentTime - mt) < 0.001) continue;
      jobs.push(new Promise(res => {
        const done = () => { v.removeEventListener('seeked', done); clearTimeout(to); res(); };
        const to = setTimeout(done, 3000);
        v.addEventListener('seeked', done);
        v.currentTime = mt;
      }));
    }
    if (jobs.length) await Promise.all(jobs);
  }
}
