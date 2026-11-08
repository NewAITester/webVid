/**
 * تست دود بازسازی از صفر — بدون DOM.
 *   node tests/rebuild.smoke.test.mjs
 */
import { LAYER_TYPES, SHAPE_KINDS, EFFECTS, EFFECT_CATS, EFFECT_PRESETS, effectById, newLayer, newProject, demoProject } from '../src/core/schema.js';
import { Store } from '../src/core/store.js';
import { valueAt, layerTransform, layerOpacity, isActive, visibleLayers, filterString, effectParamsAt, isFxOn } from '../src/core/evaluate.js';
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

console.log('── ویرایش لایه (فاز R2) ──');
{
  const s = new Store();
  s.projects = [];
  s.createProject('R2');
  ok(!s.canUndo && !s.canRedo, 'در ابتدا واگرد/ازنو خالی‌اند');
  const a = newLayer('shape', { name: 'الف', start: 0, end: 4 });
  const b = newLayer('text', { name: 'ب', start: 1, end: 5 });
  s.addLayer(a); s.addLayer(b);
  ok(s.canUndo, 'بعد از افزودن، واگرد فعال است');
  // کپی/چسباندن
  s.setTime(2);
  ok(s.copyLayer(a.id), 'کپی لایه');
  const pasted = s.pasteLayer();
  ok(pasted && pasted.id !== a.id && pasted.name === 'الف کپی' && pasted.start === 2 && pasted.end === 6, 'چسباندن در زمان فعلی با شناسهٔ تازه');
  ok(s.project.layers.length === 3, 'بعد از چسباندن ۳ لایه هست');
  // گروه و باز کردن گروه
  s.select(b.id);
  const g = { ...newLayer('group', { name: 'گروه', start: b.start, end: b.end }) };
  g.children = [JSON.parse(JSON.stringify(b))];
  g.children[0].start = 0; g.children[0].end = b.end - b.start;
  s._snapshot();
  s.project.layers = s.project.layers.filter(x => x.id !== b.id);
  s.project.layers.push(g);
  ok(s.project.layers.some(l => l.type === 'group' && l.children.length === 1), 'گروه ساخته شد');
  ok(s.ungroupLayer(g.id), 'باز کردن گروه');
  ok(!s.project.layers.some(l => l.type === 'group'), 'بعد از باز کردن، گروهی نیست');
  ok(s.project.layers.some(l => l.name === 'ب'), 'بچهٔ گروه برگشت');
  ok(!s.ungroupLayer(a.id), 'باز کردن لایهٔ غیرگروه false می‌دهد');
  // تک‌نمایش
  s.toggleSolo(a.id);
  ok(s.soloId === a.id, 'تک‌نمایش فعال شد');
  s.toggleSolo(a.id);
  ok(s.soloId === null, 'تک‌نمایش دوباره خاموش شد');
  // ماسک: فقط مقداردهی در اسکیما
  s.updateLayer(a.id, { clip: 'below' });
  ok(s.project.layers.find(l => l.id === a.id).clip === 'below', 'ماسک below ثبت شد');
  s.updateLayer(a.id, { clip: 'belowInv' });
  ok(s.project.layers.find(l => l.id === a.id).clip === 'belowInv', 'ماسک معکوس ثبت شد');
}

console.log('── افکت‌ها (فاز R3) ──');
{
  // پارامتر متحرک با کی‌فریم
  const fx = { id: 'brightness', params: { amount: 0 }, keyframes: { amount: [{ t: 0, v: 0 }, { t: 2, v: 1 }] } };
  ok(effectParamsAt(fx, 1).amount === 0.5, 'پارامتر افکت در وسط کی‌فریم ۰٫۵ است');
  ok(effectParamsAt(fx, 5).amount === 1, 'بعد از آخرین کی‌فریم مقدار نهایی می‌ماند');
  ok(effectParamsAt({ id: 'brightness', params: { amount: 0.3 } }, 1).amount === 0.3, 'بدون کی‌فریم مقدار ثابت برمی‌گردد');
  // فیلتر متحرک در زمان‌های مختلف
  const l = newLayer('text', { start: 0, end: 4 });
  l.effects = [{ id: 'brightness', params: { amount: 0 }, keyframes: { amount: [{ t: 0, v: 0 }, { t: 2, v: 1 }] }, enabled: true }];
  ok(filterString(l, 0) === 'brightness(1)', 'روشنایی در t=0 صفر است: ' + filterString(l, 0));
  ok(filterString(l, 1) === 'brightness(1.5)', 'روشنایی در t=1 برابر ۱٫۵ است: ' + filterString(l, 1));
  // افکت خاموش نادیده گرفته می‌شود
  l.effects[0].enabled = false;
  ok(filterString(l, 1) === 'none', 'افکت خاموش در فیلتر نیست');
  ok(isFxOn({ id: 'x' }) && !isFxOn({ id: 'x', enabled: false }), 'پیش‌فرض افکت فعال است');
  // کن برنز و فلش
  const k = newLayer('shape', { start: 0, end: 4 });
  k.effects = [{ id: 'kenburns', params: { amount: 0.2 }, enabled: true }];
  ok(layerTransform(k, 4).scaleX > layerTransform(k, 0).scaleX, 'کن برنز مقیاس را در طول لایه بزرگ می‌کند');
  const f = newLayer('shape', { start: 0, end: 4 });
  f.effects = [{ id: 'flash', params: { speed: 2 }, enabled: true }];
  ok(layerOpacity(f, 0) !== layerOpacity(f, 0.13), 'فلش شفافیت را عوض می‌کند');
  // پیش‌تنظیم‌ها
  ok(EFFECT_PRESETS.length >= 5, `۶ پیش‌تنظیم هست (${EFFECT_PRESETS.length})`);
  ok(EFFECT_PRESETS.every(p => p.effects.every(e => effectById(e.id))), 'همهٔ افکت‌های پیش‌تنظیم‌ها در رجیستری‌اند');
  // اخیر و کپی/چسباندن افکت
  const s = new Store();
  s.projects = [];
  s.createProject('R3');
  const a = newLayer('shape', { start: 0, end: 4 });
  a.effects = [{ id: 'brightness', params: { amount: 0.2 }, enabled: true }];
  const b = newLayer('shape', { start: 0, end: 4 });
  s.addLayer(a); s.addLayer(b);
  s.noteFx('brightness'); s.noteFx('blur'); s.noteFx('brightness');
  ok(s.recentFx[0] === 'brightness' && s.recentFx.length === 2, 'اخیر بدون تکرار و با ترتیب تازه‌ترین اول');
  ok(s.copyEffects(a.id), 'کپی افکت‌ها');
  ok(s.pasteEffects(b.id) && b.effects.length === 1 && b.effects[0].id === 'brightness', 'چسباندن افکت‌ها روی لایهٔ دیگر');
  ok(s.copyEffects(b.id), 'کپی از لایهٔ دارای افکت true می‌دهد');
  const c = newLayer('shape', { start: 0, end: 4 });
  s.addLayer(c);
  ok(!s.copyEffects(c.id), 'کپی از لایهٔ بدون افکت false می‌دهد');
}

console.log(fail === 0 ? '\n✅ همهٔ تست‌ها گذشت' : `\n❌ ${fail} تست ناموفق`);
process.exit(fail ? 1 : 0);
