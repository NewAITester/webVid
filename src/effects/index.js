import backdrop      from './backdrop.js';
import wordReveal    from './wordReveal.js';
import shatter       from './shatter.js';
import particleField from './particleField.js';
import titleCard     from './titleCard.js';
import beatGrid      from './beatGrid.js';

export const EFFECTS = [backdrop, particleField, beatGrid, wordReveal, shatter, titleCard];

export const byId = Object.fromEntries(EFFECTS.map(f => [f.id, f]));

/** مقادیر پیش‌فرض پارامترهای یک افکت */
export function defaults(id) {
  const f = byId[id];
  if (!f) return {};
  const o = {};
  for (const [k, d] of Object.entries(f.params || {})) o[k] = d.def;
  return o;
}

/** پارامترهای ذخیره‌شده را با پیش‌فرض‌ها ترکیب می‌کند */
export function resolve(id, saved) {
  return { ...defaults(id), ...(saved || {}) };
}
