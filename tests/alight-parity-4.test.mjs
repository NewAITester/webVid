/**
 * تست فاز ۴ هم‌ترازی با Alight Motion — افکت‌های تازه.
 * رندر واقعی بوم می‌خواهد، پس اینجا تعریف افکت و وجود پیاده‌سازی
 * در render.js را بررسی می‌کنیم (بدون کپی کد/شیدر Alight).
 *   node tests/alight-parity-4.test.mjs
 */
import { readFileSync } from 'node:fs';
import { EFFECTS, effectsFor } from '../src/motion/schema.js';

let fail = 0;
const ok = (c, m) => { console.log((c ? '  ✅' : '  ❌') + ' ' + m); if (!c) fail++; };

const NEW = ['sharpen', 'spinBlur', 'findEdges', 'vibrance', 'lumaKey', 'wipe'];
const renderSrc = readFileSync(new URL('../src/motion/render.js', import.meta.url), 'utf8');

console.log('── افکت‌های تازهٔ فاز ۴ ──');
for (const k of NEW) {
  const E = EFFECTS[k];
  ok(!!E, `افکت ${k} در EFFECTS هست`);
  ok(!!E && E.kind === 'filter' && E.params.length >= 1, `افکت ${k} از نوع filter با پارامتر است`);
  ok(renderSrc.includes(`case '${k}'`), `پیاده‌سازی ${k} در render.js هست`);
}
ok(effectsFor('image').some(([id]) => id === 'sharpen'), 'sharpen برای لایهٔ تصویر در دسترس است');
ok(effectsFor('video').some(([id]) => id === 'lumaKey'), 'lumaKey برای لایهٔ ویدیو در دسترس است');
ok(Object.keys(EFFECTS).length >= 53, `تعداد کل افکت‌ها ${Object.keys(EFFECTS).length} است (قبل از فاز ۴: ۴۷)`);

console.log(fail ? `❌ ${fail} خطا` : '✅ همهٔ تست‌ها گذشت');
process.exit(fail ? 1 : 0);
