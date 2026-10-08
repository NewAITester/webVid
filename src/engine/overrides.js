/**
 * لایهٔ جابه‌جایی دستی کلمات
 *
 * فلسفهٔ کار: چیدمان خودکار مرجع می‌ماند. این لایه فقط «استثناها» را
 * نگه می‌دارد — کلماتی که شما دستی جابه‌جا کرده‌اید.
 *
 *   { "l12w3": { dx: -40, dy: 12, scale: 1.1 } }
 *
 * مزیتش این است که اگر شعر یا تایمینگ عوض شود، بقیهٔ چیدمان خودکار
 * درست می‌ماند و فقط همین چند کلمه دست‌کاری‌شده باقی می‌مانند.
 *
 * تصمیم طراحی: افست برای **کل عمر کلمه** اعمال می‌شود، نه کی‌فریم در
 * یک لحظهٔ خاص. کی‌فریم یعنی ساختن یک افترافکتس کوچک؛ فعلاً لازم نیست.
 */

/**
 * نگه‌داری عمداً «بدون محل ذخیره» است.
 *
 * نسخهٔ اول همه را در یک کلید localStorage می‌ریخت و این یک باگ جدی
 * بود: شناسهٔ کلمه‌ها (مثل l3w2) فقط شمارهٔ خط و کلمه است، پس بین
 * آهنگ‌های مختلف تکرار می‌شود. جابه‌جا کردن یک کلمه در یک پروژه،
 * کلمهٔ بی‌ربطی را در پروژهٔ دیگر تکان می‌داد.
 *
 * حالا هر پروژه نقشهٔ خودش را دارد و ذخیره از بیرون تزریق می‌شود.
 */
export class Overrides {
  constructor(data = {}, onSave = null) { this.map = data || {}; this.onSave = onSave; }

  /** جایگزینی کامل نقشه — هنگام باز کردن پروژه */
  setMap(m, onSave = this.onSave) { this.map = m || {}; this.onSave = onSave; }

  save() { this.onSave?.(this.map); }

  get(id) { return this.map[id]; }
  get count() { return Object.keys(this.map).length; }

  /** افست را نسبی اضافه می‌کند (برای درگ) */
  nudge(id, dx, dy) {
    const o = this.map[id] || (this.map[id] = { dx: 0, dy: 0, scale: 1 });
    o.dx = +( (o.dx || 0) + dx ).toFixed(2);
    o.dy = +( (o.dy || 0) + dy ).toFixed(2);
    return o;
  }

  setScale(id, s) {
    const o = this.map[id] || (this.map[id] = { dx: 0, dy: 0, scale: 1 });
    o.scale = Math.max(0.3, Math.min(3, +s.toFixed(3)));
    return o;
  }

  clear(id) { delete this.map[id]; }
  clearAll() { this.map = {}; }

  toJSON() { return JSON.stringify(this.map, null, 2); }

  fromJSON(txt) {
    const d = JSON.parse(txt);
    if (d && typeof d === 'object') { this.map = d; return true; }
    return false;
  }
}

/**
 * اعمال افست‌ها روی خروجی چیدمان.
 *
 * عمداً بیرون از place() انجام می‌شود: place() کش می‌شود و باید خالص
 * بماند، وگرنه موقع درگ هر حرکت انگشت کل کش را دور می‌ریخت.
 */
export function applyOverrides(items, ov) {
  if (!ov) return items;
  let any = false;
  for (const it of items) if (ov.map[it.id]) { any = true; break; }
  if (!any) return items;
  return items.map(it => {
    const o = ov.map[it.id];
    if (!o) return it;
    return {
      ...it,
      cx: it.cx + (o.dx || 0),
      cy: it.cy + (o.dy || 0),
      size: it.size * (o.scale || 1),
      w: it.w * (o.scale || 1),
      moved: true,
    };
  });
}

/** کدام کلمه زیر این نقطه است؟ از آخر به اول، چون آخری‌ها رویی‌ترند */
export function hitWord(items, px, py, pad = 12) {
  for (let i = items.length - 1; i >= 0; i--) {
    const it = items[i];
    const hw = (it.w || it.size) / 2 + pad;
    const hh = it.size * 0.62 + pad;
    if (px >= it.cx - hw && px <= it.cx + hw && py >= it.cy - hh && py <= it.cy + hh) return it;
  }
  return null;
}
