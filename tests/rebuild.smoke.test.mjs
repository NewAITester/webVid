/**
 * تست دود بازسازی از صفر — بدون DOM.
 *   node tests/rebuild.smoke.test.mjs
 */
import { LAYER_TYPES, SHAPE_KINDS, EFFECTS, EFFECT_CATS, effectById, newLayer, newProject, demoProject } from '../src/core/schema.js';
import { Store } from '../src/core/store.js';
import { valueAt, layerTransform, layerOpacity, isActive, visibleLayers, filterString } from '../src/core/evaluate.js';
import { ease, EASINGS } from '../src/core/easing.js';

let fail = 0;
const ok = (c, m) => { console.log((c ? '  ✅' : '  ❌') + ' ' + m); if (!c) fail++; };

console.log('── اسکیما ──');
ok(LAYER_TYPES.length === 9, '۹ نوع لایه');
ok(SHAPE_KINDS.length === 12, '۱۲ شکل پایه');
ok(EFFECTS.length >= 40, `رجیستری افکت ${EFFECTS.length} مورد دارد`);
ok(EFFECT_CATS.length >= 8, `دسته‌های افکت: ${EFFECT_CATS.join(', ')}`);
ok(effectById('brightness')?.kind === 'filter', 'افکت روشنایی از نوع filter است');
ok(effectById('pixelate')?.kind === 'canvas', 'افکت پیکسلی از نوع canvas است');
{
  const p = newProject('تست', 1080, 1920);
  ok(p.width === 1080 && p.fps === 30 && p.layers.length === 0, 'پروژهٔ تازه درست ساخته می‌شود');
  const l = newLayer('text');
  ok(l.type === 'text' && l.text.content && l.transform.opacity === 1, 'لایهٔ متن پیش‌فرض دارد');
  const d = demoProject();
  ok(d.layers.length === 4 && d.duration === 10, 'پروژهٔ نمایشی ۴ لایه و ۱۰ ثانیه است');
}

console.log('── ارزیابی خالص ──');
ok(valueAt([{ t: 0, v: 0 }, { t: 2, v: 10 }], 1, 0) === 5, 'درون‌یابی خطی کی‌فریم');
ok(valueAt([{ t: 0, v: 0 }, { t: 2, v: 10, ease: 'easeOut' }], 1, 0) > 5, 'کی‌فریم با easeOut تندتر شروع می‌شود');
ok(Math.abs(ease('linear', 0.5) - 0.5) < 1e-9, 'easing خطی');
ok(EASINGS.hash(7) === EASINGS.hash(7) && EASINGS.hash(7) >= 0 && EASINGS.hash(7) < 1, 'هش قطعی است');
{
  const l = newLayer('shape');
  l.transform.x = 100; l.keyframes = { x: [{ t: 0, v: 100 }, { t: 4, v: 300 }] };
  ok(layerTransform(l, 2).x === 200, 'ترنسفورم با کی‌فریم در t=2 برابر ۲۰۰ است');
  l.effects = [{ id: 'pulse', params: { amount: 0.1, speed: 1 } }];
  ok(layerTransform(l, 0.25).scaleX > 1, 'افکت تپش مقیاس را بزرگ می‌کند');
  ok(layerOpacity(l, 0) <= 1 && layerOpacity(l, 0) > 0, 'شفافیت در بازهٔ [۰،۱] است');
  l.effects = [{ id: 'blink', params: { speed: 4 } }];
  ok(layerOpacity(l, 0) !== layerOpacity(l, 0.06), 'افکت چشمک شفافیت را عوض می‌کند');
  const f = newLayer('text');
  f.effects = [{ id: 'brightness', params: { amount: 0.2 } }, { id: 'blur', params: { amount: 5 } }];
  ok(filterString(f) === 'brightness(1.2) blur(5px)', 'رشتهٔ ctx.filter درست ساخته می‌شود: ' + filterString(f));
  ok(isActive(l, 1) && !isActive(l, 6), 'فعال بودن لایه با start/end');
  const p = demoProject();
  ok(visibleLayers(p, 0.1).length === 2, 'در t=0.1 فقط ۲ لایه فعال‌اند (پس‌زمینه و حلقه)');
  ok(visibleLayers(p, 2).length === 4, 'در t=2 هر ۴ لایه فعال‌اند');
}

console.log('── فروشگاه ──');
{
  const s = new Store();
  s.projects = [];
  const p = s.createProject('الف');
  ok(s.projects.length === 1 && s.project.name === 'الف', 'ساخت پروژه');
  const l = newLayer('text', { start: 0, end: 4 });
  s.addLayer(l);
  ok(s.project.layers.length === 1 && s.selId === l.id, 'افزودن لایه و انتخاب آن');
  s.duplicateLayer(l.id);
  ok(s.project.layers.length === 2, 'کپی لایه');
  s.splitLayer(l.id, 2);
  ok(s.project.layers.length === 3, 'تقسیم لایه به دو تکه');
  s.undo();
  ok(s.project.layers.length === 2, 'واگرد تقسیم را برمی‌گرداند');
  s.redo();
  ok(s.project.layers.length === 3, 'ازنو تقسیم را برمی‌گرداند');
  s.removeLayer(l.id);
  ok(s.project.layers.length === 2, 'حذف لایه');
  s.moveLayer(s.project.layers[0].id, 1);
  ok(true, 'جابه‌جایی لایه خطا نمی‌دهد');
  s.setTime(99);
  ok(s.time === s.project.duration, 'زمان به انتهای پروژه محدود می‌شود');
  s.renameProject(p.id, 'ب');
  ok(s.project.name === 'ب', 'تغییر نام پروژه');
  s.deleteProject(p.id);
  ok(s.projects.length === 0, 'حذف پروژه');
}

console.log(fail === 0 ? '\n✅ همهٔ تست‌ها گذشت' : `\n❌ ${fail} تست ناموفق`);
process.exit(fail ? 1 : 0);
