/**
 * کمک‌تابع‌های کوچک DOM — تا ساختن رابط کاربری خواناتر باشد
 *
 *   h('button', { class: 'btn sm', onclick: fn }, 'متن')
 *
 * ویژگی‌هایی که با on شروع شوند رویدادند؛ class و style و dataset هم
 * پشتیبانی می‌شوند؛ بقیه مستقیم روی عنصر گذاشته می‌شوند.
 */
export function h(tag, props = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v === undefined || v === null) continue;
    if (v === false && !(k in el)) continue;       // ویژگی HTML نادرست = نگذار
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k in el) el[k] = v;
    else el.setAttribute(k, v);
  }
  for (const c of kids.flat()) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

export const $ = s => document.querySelector(s);
export const $$ = s => [...document.querySelectorAll(s)];

/** عدد با رقم فارسی */
export const faN = n => String(n).replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[+d]);

/** گرد کردن برای نمایش: حداکثر دو رقم اعشار */
export const nice = v => (Math.abs(v) >= 100 ? Math.round(v) : Math.round(v * 100) / 100);

/** فهرست کشویی از آرایهٔ [مقدار، برچسب] */
export function select(options, value, onchange, cls = '') {
  const s = h('select', { class: cls, onchange: () => onchange(s.value) });
  for (const [v, label] of options) s.append(h('option', { value: v, selected: v === value }, label));
  return s;
}

/** کلید روشن/خاموش با برچسب */
export function check(label, value, onchange) {
  const i = h('input', { type: 'checkbox', checked: !!value, onchange: () => onchange(i.checked) });
  return h('label', { class: 'chk' }, i, label);
}
