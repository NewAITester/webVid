/**
 * تست فازهای ۹ تا ۱۱ — UX گروه و تک‌نمایش، لایهٔ خط آزاد، افکت‌های تازه.
 *   node tests/alight-parity-9.test.mjs
 */
import { LAYER_TYPES, EFFECTS, newLayer } from '../src/motion/schema.js';
import { scribblePoints } from '../src/motion/render.js';
import { collapsedGroupIds, isHiddenByCollapse, toggleCollapse, applySolo, restoreSolo, groupLayers } from '../src/motion/ops.js';

let fail = 0;
const ok = (c, m) => { console.log((c ? '  ✅' : '  ❌') + ' ' + m); if (!c) fail++; };

console.log('── گروه: جمع‌شدن و تک‌نمایش ──');
{
  const a = newLayer('text', 0, 5), b = newLayer('shape', 0, 5);
  const g = groupLayers([a, b], 'گروه تست');
  const layers = [a, b, g];
  ok(!isHiddenByCollapse(a, layers), 'قبل از جمع‌شدن، عضو گروه دیده می‌شود');
  ok(toggleCollapse(g) === true, 'جمع‌کردن گروه true برمی‌گرداند');
  ok(isHiddenByCollapse(a, layers) && isHiddenByCollapse(b, layers), 'بعد از جمع‌شدن، اعضا پنهان‌اند');
  ok(!isHiddenByCollapse(g, layers), 'خود گروه پنهان نمی‌شود');
  ok(collapsedGroupIds(layers).has(g.id), 'شناسهٔ گروه جمع‌شده در مجموعه هست');
  const prev = applySolo(layers, a.id);
  ok(a.visible === true && b.visible === false && g.visible === false, 'تک‌نمایش: فقط لایهٔ انتخاب‌شده دیده می‌شود');
  restoreSolo(layers, prev);
  ok(a.visible === true && b.visible === true && g.visible === true, 'بازگرداندن تک‌نمایش همه را برمی‌گرداند');
}

console.log('── خط آزاد ──');
ok(!!LAYER_TYPES.draw, 'لایهٔ خط آزاد (draw) هست');
{
  const pts = scribblePoints(800, 200, { amp: 40, freq: 3 });
  ok(pts.length === 61, 'خط آزاد ۶۱ نقطه دارد');
  ok(Math.abs(pts[0][0] + 400) < 1e-9 && Math.abs(pts[60][0] - 400) < 1e-9, 'خط از چپ تا راست قاب را می‌پوشاند');
  ok(Math.abs(pts[0][1]) < 1e-9, 'نقطهٔ اول روی محور است (سینوس صفر)');
  const pts2 = scribblePoints(800, 200, { amp: 40, freq: 3 });
  ok(JSON.stringify(pts) === JSON.stringify(pts2), 'نقاط قطعی‌اند — دو بار اجرا یک نتیجه می‌دهد');
  const d = newLayer('draw', 0, 4);
  ok(d.props.strokeW && d.props.trimS && d.props.trimE, 'خط آزاد ضخامت و برش مسیر دارد');
}

console.log('── افکت‌های تازه ──');
for (const k of ['clouds', 'checker', 'tiltShift', 'flipH', 'flipV', 'hueShift', 'invertFx', 'pinch', 'bend', 'fractal', 'grid', 'matte', 'edgeGlow', 'wordPop', 'drift', 'tilt3d', 'flip3d', 'sphere', 'temperature', 'exposure', 'clarity', 'perspective', 'levels', 'feather', 'sepiaFx', 'vintage', 'neon']) {
  ok(!!EFFECTS[k], `افکت ${k} هست`);
}
ok(Object.keys(EFFECTS).length === 90, `تعداد افکت‌ها ۹۰ است (بود ${Object.keys(EFFECTS).length})`);
ok(Object.keys(LAYER_TYPES).length === 11, `تعداد نوع لایه ۱۱ است (بود ${Object.keys(LAYER_TYPES).length})`);

console.log(fail ? `\n❌ ${fail} تست ناموفق` : '\n✅ همهٔ تست‌ها گذشت');
process.exit(fail ? 1 : 0);
