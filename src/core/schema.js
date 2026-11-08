/** مدل دادهٔ پروژه و رجیستری افکت‌ها — خالص. */

let _uid = 0;
export const uid = (p = 'l') => `${p}_${Date.now().toString(36)}${(_uid++).toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;

export const LAYER_TYPES = ['text', 'shape', 'image', 'video', 'audio', 'draw', 'camera', 'group', 'null'];
export const SHAPE_KINDS = ['ellipse', 'rect', 'polygon', 'star', 'heart', 'ring', 'line', 'arrow', 'callout', 'flower', 'triangle', 'diamond'];

/** افکت: kind = 'filter' (رشتهٔ ctx.filter) | 'canvas' (عملیات روی بوم) | 'anim' (فقط زمان/ترنسفورم). */
function fx(id, name, cat, kind, params) { return { id, name, cat, kind, params }; }
function P(type, def, min, max, label) { return { type, def, min, max, label }; }

export const EFFECTS = [
  // رنگ
  fx('brightness', 'روشنایی', 'color', 'filter', { amount: P('n', 0, -1, 1, 'مقدار') }),
  fx('contrast', 'کنتراست', 'color', 'filter', { amount: P('n', 0, -1, 1, 'مقدار') }),
  fx('saturation', 'اشباع', 'color', 'filter', { amount: P('n', 0, -1, 1, 'مقدار') }),
  fx('hueShift', 'چرخش رنگ', 'color', 'filter', { amount: P('n', 0, -180, 180, 'درجه') }),
  fx('grayscale', 'سیاه‌سفید', 'color', 'filter', { amount: P('n', 1, 0, 1, 'مقدار') }),
  fx('sepia', 'سپیا', 'color', 'filter', { amount: P('n', 1, 0, 1, 'مقدار') }),
  fx('invert', 'معکوس', 'color', 'filter', { amount: P('n', 1, 0, 1, 'مقدار') }),
  fx('temperature', 'دما', 'color', 'canvas', { amount: P('n', 0, -1, 1, 'گرمی') }),
  fx('tint', 'ته‌رنگ', 'color', 'canvas', { color: P('c', '#F16586', 0, 0, 'رنگ'), amount: P('n', 0.3, 0, 1, 'مقدار') }),
  fx('threshold', 'آستانه', 'color', 'canvas', { amount: P('n', 0.5, 0, 1, 'آستانه') }),
  fx('posterize', 'پوستریز', 'color', 'canvas', { levels: P('n', 4, 2, 16, 'سطح') }),
  // محو
  fx('blur', 'محو', 'blur', 'filter', { amount: P('n', 8, 0, 40, 'شعاع') }),
  fx('motionBlur', 'محو حرکتی', 'blur', 'canvas', { amount: P('n', 10, 0, 40, 'مقدار'), angle: P('n', 0, -180, 180, 'زاویه') }),
  fx('radialBlur', 'محو شعاعی', 'blur', 'canvas', { amount: P('n', 0.4, 0, 1, 'مقدار') }),
  fx('sharpen', 'تیز کردن', 'blur', 'canvas', { amount: P('n', 0.5, 0, 1, 'مقدار') }),
  // اعوجاج
  fx('pixelate', 'پیکسلی', 'distort', 'canvas', { size: P('n', 12, 2, 64, 'اندازه') }),
  fx('bulge', 'برآمدگی', 'distort', 'canvas', { amount: P('n', 0.5, -1, 1, 'مقدار') }),
  fx('twirl', 'چرخش', 'distort', 'canvas', { amount: P('n', 0.6, -3, 3, 'مقدار') }),
  fx('pinch', 'نیشگون', 'distort', 'canvas', { amount: P('n', 0.5, -1, 1, 'مقدار') }),
  fx('ripple', 'موج', 'distort', 'canvas', { amount: P('n', 8, 0, 30, 'دامنه'), freq: P('n', 6, 1, 20, 'فرکانس') }),
  fx('wave', 'موج‌دار', 'distort', 'canvas', { amount: P('n', 6, 0, 30, 'دامنه'), freq: P('n', 4, 1, 20, 'فرکانس') }),
  fx('vortex', 'گرداب', 'distort', 'canvas', { amount: P('n', 0.5, -1, 1, 'مقدار') }),
  // شفافیت و درخشش
  fx('fade', 'محو شدن', 'opacity', 'anim', { amount: P('n', 1, 0, 1, 'مقدار') }),
  fx('blink', 'چشمک', 'opacity', 'anim', { speed: P('n', 4, 0.5, 20, 'سرعت') }),
  fx('glow', 'درخشش', 'stylize', 'canvas', { color: P('c', '#FFFFFF', 0, 0, 'رنگ'), amount: P('n', 16, 0, 60, 'شعاع') }),
  fx('outline', 'حاشیه', 'stylize', 'canvas', { color: P('c', '#000000', 0, 0, 'رنگ'), width: P('n', 3, 0, 20, 'ضخامت') }),
  fx('dropShadow', 'سایه', 'stylize', 'canvas', { dx: P('n', 4, -30, 30, 'X'), dy: P('n', 4, -30, 30, 'Y'), blur: P('n', 8, 0, 40, 'محو'), color: P('c', '#000000', 0, 0, 'رنگ') }),
  fx('vignette', 'وینیت', 'stylize', 'canvas', { amount: P('n', 0.5, 0, 1, 'مقدار') }),
  fx('noise', 'نویز', 'procedural', 'canvas', { amount: P('n', 0.15, 0, 1, 'مقدار') }),
  fx('scanlines', 'خطوط اسکن', 'procedural', 'canvas', { gap: P('n', 4, 2, 12, 'فاصله'), amount: P('n', 0.3, 0, 1, 'مقدار') }),
  // ترنسفورم
  fx('shake', 'لرزش', 'transform', 'anim', { amount: P('n', 6, 0, 40, 'دامنه'), speed: P('n', 8, 1, 30, 'سرعت') }),
  fx('mirror', 'آینه', 'transform', 'anim', { axis: P('n', 0, 0, 1, 'محور') }),
  fx('pulse', 'تپش', 'transform', 'anim', { amount: P('n', 0.1, 0, 0.6, 'دامنه'), speed: P('n', 2, 0.5, 10, 'سرعت') }),
  fx('spin', 'چرخش', 'transform', 'anim', { speed: P('n', 90, -360, 360, 'درجه/ثانیه') }),
  fx('float', 'شناور', 'transform', 'anim', { amount: P('n', 10, 0, 60, 'دامنه'), speed: P('n', 1, 0.2, 5, 'سرعت') }),
  fx('bounce', 'جهش', 'transform', 'anim', { amount: P('n', 20, 0, 80, 'دامنه'), speed: P('n', 2, 0.5, 8, 'سرعت') }),
  // متن
  fx('typewriter', 'تایپ', 'text', 'anim', { speed: P('n', 12, 1, 60, 'حرف/ثانیه') }),
  fx('tracking', 'فاصلهٔ حروف', 'text', 'anim', { amount: P('n', 0, -10, 40, 'پیکسل') }),
  fx('textGlow', 'درخشش متن', 'text', 'canvas', { color: P('c', '#F16586', 0, 0, 'رنگ'), amount: P('n', 12, 0, 50, 'شعاع') }),
  // سه‌بعدی/تکرار (تقریب دوبعدی)
  fx('perspective', 'پرسپکتیو', '3d', 'canvas', { amount: P('n', 0.3, -0.8, 0.8, 'مقدار') }),
  fx('tile', 'کاشی', 'repeat', 'canvas', { cols: P('n', 2, 1, 6, 'ستون'), rows: P('n', 2, 1, 6, 'ردیف') }),
  fx('kaleidoscope', 'کالیدوسکوپ', 'repeat', 'canvas', { segments: P('n', 6, 2, 12, 'بخش') }),
  fx('chroma', 'کروما', 'matte', 'canvas', { color: P('c', '#00FF00', 0, 0, 'رنگ'), amount: P('n', 0.4, 0, 1, 'آستانه') }),
  fx('chromaShift', 'جابه‌جایی رنگ', 'stylize', 'canvas', { amount: P('n', 6, 0, 30, 'پیکسل') }),
  fx('flash', 'فلش', 'opacity', 'anim', { speed: P('n', 2, 0.5, 10, 'سرعت') }),
  fx('kenburns', 'کن برنز', 'transform', 'anim', { amount: P('n', 0.15, 0, 0.6, 'مقدار') }),
];

export const EFFECT_CATS = [...new Set(EFFECTS.map(e => e.cat))];
export const effectById = id => EFFECTS.find(e => e.id === id);

/** پیش‌تنظیم‌های ترکیبی افکت (روی لایهٔ انتخاب‌شده اعمال می‌شوند). */
export const EFFECT_PRESETS = [
  { id: 'cinema', name: 'سینمایی', effects: [
    { id: 'contrast', params: { amount: 0.2 } },
    { id: 'saturation', params: { amount: -0.25 } },
    { id: 'vignette', params: { amount: 0.55 } },
  ] },
  { id: 'neon', name: 'نئون', effects: [
    { id: 'saturation', params: { amount: 0.5 } },
    { id: 'glow', params: { color: '#F16586', amount: 22 } },
    { id: 'contrast', params: { amount: 0.15 } },
  ] },
  { id: 'vintage', name: 'قدیمی', effects: [
    { id: 'sepia', params: { amount: 0.7 } },
    { id: 'vignette', params: { amount: 0.5 } },
    { id: 'noise', params: { amount: 0.12 } },
  ] },
  { id: 'dream', name: 'رویایی', effects: [
    { id: 'blur', params: { amount: 6 } },
    { id: 'brightness', params: { amount: 0.15 } },
    { id: 'glow', params: { color: '#FFFFFF', amount: 18 } },
  ] },
  { id: 'pop', name: 'پاپ', effects: [
    { id: 'saturation', params: { amount: 0.6 } },
    { id: 'contrast', params: { amount: 0.25 } },
    { id: 'sharpen', params: { amount: 0.6 } },
  ] },
  { id: 'bw', name: 'سیاه‌سفید دراماتیک', effects: [
    { id: 'grayscale', params: { amount: 1 } },
    { id: 'contrast', params: { amount: 0.35 } },
    { id: 'vignette', params: { amount: 0.6 } },
  ] },
];

export function defaultTransform() {
  return { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, opacity: 1, anchorX: 0.5, anchorY: 0.5 };
}

export function newLayer(type, extra = {}) {
  const base = {
    id: uid(), type, name: layerName(type), start: 0, end: 5, clip: 'none',
    transform: defaultTransform(), keyframes: {}, effects: [], ...extra,
  };
  if (type === 'text') base.text = { content: 'متن', font: 'IRANSansX', weight: 700, size: 64, color: '#FAFAFA', align: 'center', lineHeight: 1.4 };
  if (type === 'shape') base.shape = { kind: 'ellipse', fill: '#F16586', stroke: null, strokeWidth: 0, w: 200, h: 200 };
  if (type === 'draw') base.strokes = [];
  if (type === 'group') base.children = [];
  if (type === 'camera') base.camera = { zoom: 1 };
  return base;
}

function layerName(type) {
  return { text: 'متن', shape: 'شکل', image: 'تصویر', video: 'ویدیو', audio: 'صدا', draw: 'خط آزاد', camera: 'دوربین', group: 'گروه', null: 'خالی' }[type] || 'لایه';
}

export function newProject(name = 'پروژهٔ تازه', width = 720, height = 1280) {
  return { id: uid('p'), name, width, height, fps: 30, duration: 10, bg: '#0C0D13', layers: [], createdAt: Date.now() };
}

/** پروژهٔ نمایشی برای شروع تازه. */
export function demoProject() {
  const p = newProject('نمایش', 720, 1280);
  p.duration = 10;
  const bg = newLayer('shape', { name: 'پس‌زمینه', start: 0, end: 10 });
  bg.shape = { kind: 'rect', fill: '#141620', stroke: null, strokeWidth: 0, w: 720, h: 1280 };
  bg.transform = { ...defaultTransform(), x: 360, y: 640 };
  const ring = newLayer('shape', { name: 'حلقه', start: 0, end: 10 });
  ring.shape = { kind: 'ring', fill: '#F16586', stroke: null, strokeWidth: 0, w: 420, h: 420 };
  ring.transform = { ...defaultTransform(), x: 360, y: 560 };
  ring.effects = [{ id: 'pulse', params: { amount: 0.12, speed: 1.5 } }];
  const title = newLayer('text', { name: 'عنوان', start: 0.3, end: 9 });
  title.text = { content: 'لیریک استودیو', font: 'IRANSansX', weight: 900, size: 72, color: '#FAFAFA', align: 'center', lineHeight: 1.3 };
  title.transform = { ...defaultTransform(), x: 360, y: 640 };
  const sub = newLayer('text', { name: 'زیرنویس', start: 1, end: 9 });
  sub.text = { content: 'مثل آلایت موشن', font: 'IRANSansX', weight: 500, size: 34, color: '#C4C5CB', align: 'center', lineHeight: 1.4 };
  sub.transform = { ...defaultTransform(), x: 360, y: 730 };
  p.layers = [bg, ring, title, sub];
  return p;
}
