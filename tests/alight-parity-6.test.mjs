/**
 * تست فازهای ۶ تا ۸ هم‌ترازی با Alight Motion — لایهٔ صدا و دوربین،
 * شکل‌های plus و stamp، افکت‌های تازه و حساب صدا.
 *   node tests/alight-parity-6.test.mjs
 */
import { LAYER_TYPES, SHAPE_KINDS, EFFECTS, newLayer } from '../src/motion/schema.js';
import { shapePath } from '../src/motion/render.js';
import { audioGain, mediaTime, sourceWindow, hasLayerAudio } from '../src/motion/audio.js';

let fail = 0;
const ok = (c, m) => { console.log((c ? '  ✅' : '  ❌') + ' ' + m); if (!c) fail++; };
function fakeCtx() {
  const calls = [];
  return { calls,
    beginPath: () => calls.push('beginPath'),
    moveTo: (x, y) => calls.push(['moveTo', x, y]),
    lineTo: (x, y) => calls.push(['lineTo', x, y]),
    closePath: () => calls.push('closePath'),
    ellipse: (...a) => calls.push(['ellipse', ...a]),
    bezierCurveTo: (...a) => calls.push(['bezier', ...a]),
    rect: (...a) => calls.push(['rect', ...a]),
    roundRect: (...a) => calls.push(['roundRect', ...a]),
  };
}

console.log('── لایه‌های تازه ──');
ok(!!LAYER_TYPES.audio && LAYER_TYPES.audio.label === 'صدا', 'لایهٔ صدا (audio) هست');
ok(!!LAYER_TYPES.camera && LAYER_TYPES.camera.label === 'دوربین', 'لایهٔ دوربین (camera) هست');
{
  const a = newLayer('audio', 2, 5);
  a.data.media = 'md1'; a.data.fadeIn = 2; a.data.fadeOut = 2;
  ok(a.props.vol && a.props.vol.v === 100, 'لایهٔ صدا بلندی پیش‌فرض ۱۰۰ دارد');
  ok(audioGain(a, 0, 100) === 0, 'محو شروع: در لحظهٔ ۰ بهره ۰ است');
  ok(Math.abs(audioGain(a, 1, 100) - 0.5) < 1e-9, 'محو شروع: در وسط محو بهره ۰٫۵ است');
  ok(Math.abs(audioGain(a, 2.5, 100) - 1) < 1e-9, 'وسط لایه بهرهٔ کامل است');
  ok(Math.abs(audioGain(a, 4, 100) - 0.5) < 1e-9, 'محو پایان: یک ثانیه مانده به انتها بهره ۰٫۵ است');
  ok(hasLayerAudio(a), 'لایهٔ صوتی با فایل، صدا دارد');
  const v = newLayer('video', 0, 5);
  ok(!hasLayerAudio(v), 'ویدیوی بدون sound، صدا ندارد');
  v.data.sound = true; v.data.media = 'md2';
  ok(hasLayerAudio(v), 'ویدیوی با sound روشن، صدا دارد');
  const [s, e] = sourceWindow(a, 30);
  ok(s === 0 && e === 30, 'trimOut برابر null یعنی تا انتهای فایل');
  a.data.trimIn = 5; a.data.trimOut = 15;
  ok(mediaTime(a, 12, 30) === 7, 'تکرار: زمان محلی ۱۲ در پنجرهٔ [۵،۱۵) می‌شود ۷');
  a.data.loop = false;
  ok(mediaTime(a, 12, 30) === 14.96, 'بدون تکرار: در پایان پنجره می‌ایستد');
}
{
  const c = newLayer('camera', 0, 10);
  ok(c.type === 'camera' && c.props.sc && c.props.rot, 'دوربین ویژگی‌های تبدیل (اندازه/چرخش) را دارد');
}

console.log('── شکل‌های تازه ──');
for (const k of ['plus', 'stamp']) {
  ok(SHAPE_KINDS.some(([id]) => id === k), `شکل ${k} در SHAPE_KINDS هست`);
  const ctx = fakeCtx();
  const len = shapePath(ctx, k, 320, 320, { radius: 10, sides: 5, inner: 45, strokeW: 0, trimS: 0, trimE: 100 });
  ok(len > 0 && ctx.calls.length >= 2, `مسیر ${k} ساخته شد (طول=${len?.toFixed?.(0)})`);
}
ok(SHAPE_KINDS.length === 19, `تعداد شکل‌ها ۱۹ است (بود ${SHAPE_KINDS.length})`);

console.log('── افکت‌های تازه ──');
for (const k of ['bulge', 'fisheye', 'twirl', 'ripple', 'noise', 'channelShift', 'solarize', 'emboss', 'tile', 'squeeze']) {
  ok(!!EFFECTS[k], `افکت ${k} در EFFECTS هست`);
}
ok(Object.keys(EFFECTS).length === 63, `تعداد افکت‌ها ۶۳ است (بود ${Object.keys(EFFECTS).length})`);

console.log(fail ? `\n❌ ${fail} تست ناموفق` : '\n✅ همهٔ تست‌ها گذشت');
process.exit(fail ? 1 : 0);
