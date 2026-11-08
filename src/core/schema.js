/** مدل دادهٔ پروژه و رجیستری افکت‌ها — خالص. */

let _uid = 0;
export const uid = (p = 'l') => `${p}_${Date.now().toString(36)}${(_uid++).toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;

export const LAYER_TYPES = ['text', 'shape', 'image', 'video', 'audio', 'draw', 'camera', 'group', 'null'];
export const SHAPE_KINDS = ['ellipse', 'rect', 'polygon', 'star', 'heart', 'ring', 'line', 'arrow', 'callout', 'flower', 'triangle', 'diamond', 'cross', 'pie', 'arc', 'moon', 'teardrop', 'roundrect', 'quad', 'plus', 'stamp'];

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
  fx('temperature', 'دما', 'color', 'canvas', { amt: P('n', 30, -100, 100, 'دما') }),
  fx('tint', 'ته‌رنگ', 'color', 'canvas', { color: P('c', '#E4142A', 0, 0, 'رنگ'), amt: P('n', 60, 0, 100, 'میزان') }),
  fx('threshold', 'آستانه', 'color', 'canvas', { level: P('n', 50, 0, 100, 'مرز'), c1: P('c', '#000000', 0, 0, 'تیره'), c2: P('c', '#FFFFFF', 0, 0, 'روشن') }),
  fx('posterize', 'پوستریز', 'color', 'canvas', { levels: P('n', 4, 2, 16, 'سطح') }),
  // محو
  fx('blur', 'محو', 'blur', 'filter', { amount: P('n', 8, 0, 40, 'شعاع') }),
  fx('motionBlur', 'محو حرکتی', 'blur', 'canvas', { amount: P('n', 10, 0, 40, 'مقدار'), angle: P('n', 0, -180, 180, 'زاویه') }),
  fx('radialBlur', 'محو شعاعی', 'blur', 'canvas', { amount: P('n', 0.4, 0, 1, 'مقدار') }),
  fx('sharpen', 'تیز کردن', 'blur', 'canvas', { amt: P('n', 50, 0, 200, 'شدت') }),
  // اعوجاج
  fx('pixelate', 'پیکسلی', 'distort', 'canvas', { size: P('n', 12, 2, 64, 'اندازه') }),
  fx('bulge', 'برآمدگی', 'distort', 'canvas', { amt: P('n', 50, -100, 100, 'شدت'), r: P('n', 60, 10, 100, 'شعاع') }),
  fx('twirl', 'چرخش', 'distort', 'canvas', { amt: P('n', 50, -200, 200, 'شدت'), r: P('n', 70, 10, 100, 'شعاع') }),
  fx('pinch', 'نیشگون', 'distort', 'canvas', { amt: P('n', 50, -100, 100, 'شدت'), r: P('n', 60, 10, 100, 'شعاع') }),
  fx('ripple', 'موج', 'distort', 'canvas', { amount: P('n', 8, 0, 30, 'دامنه'), freq: P('n', 6, 1, 20, 'فرکانس') }),
  fx('wave', 'موج‌دار', 'distort', 'canvas', { amount: P('n', 6, 0, 30, 'دامنه'), freq: P('n', 4, 1, 20, 'فرکانس') }),
  fx('vortex', 'گرداب', 'distort', 'canvas', { amt: P('n', 60, 0, 200, 'شدت') }),
  // شفافیت و درخشش
  fx('fade', 'محو شدن', 'opacity', 'anim', { amount: P('n', 1, 0, 1, 'مقدار') }),
  fx('blink', 'چشمک', 'opacity', 'anim', { speed: P('n', 4, 0.5, 20, 'سرعت') }),
  fx('glow', 'درخشش', 'stylize', 'canvas', { color: P('c', '#FFFFFF', 0, 0, 'رنگ'), amount: P('n', 16, 0, 60, 'شعاع') }),
  fx('outline', 'حاشیه', 'stylize', 'canvas', { w: P('n', 6, 0, 60, 'ضخامت'), color: P('c', '#FFFFFF', 0, 0, 'رنگ') }),
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
  fx('perspective', 'پرسپکتیو', '3d', 'canvas', { amt: P('n', 40, -90, 90, 'شدت') }),
  fx('tile', 'کاشی', 'repeat', 'canvas', { cols: P('n', 2, 1, 6, 'ستون'), rows: P('n', 2, 1, 6, 'ردیف') }),
  fx('kaleidoscope', 'کالیدوسکوپ', 'repeat', 'canvas', { segments: P('n', 6, 2, 12, 'بخش') }),
  fx('chroma', 'کروما', 'matte', 'canvas', { color: P('c', '#00FF00', 0, 0, 'رنگ حذفی'), tol: P('n', 32, 0, 100, 'دامنه'), soft: P('n', 12, 0, 100, 'نرمی لبه') }),
  fx('chromaShift', 'جابه‌جایی رنگ', 'stylize', 'canvas', { amount: P('n', 6, 0, 30, 'پیکسل') }),
  fx('flash', 'فلش', 'opacity', 'anim', { speed: P('n', 2, 0.5, 10, 'سرعت') }),
  fx('kenburns', 'کن برنز', 'transform', 'anim', { amount: P('n', 0.15, 0, 0.6, 'مقدار') }),

  // ── فاز R6: افکت‌های برنامهٔ قبلی (۲۷۲ رجیستری) ──
  // سبک
  fx('shadow', 'سایه', 'stylize', 'canvas', { dx: P('n', 10, -200, 200, 'افقی'), dy: P('n', 12, -200, 200, 'عمودی'), r: P('n', 16, 0, 100, 'نرمی'), color: P('c', '#000000', 0, 0, 'رنگ'), op: P('n', 75, 0, 100, 'شفافیت') }),
  fx('extrude', 'سه‌بعدی (عمق)', 'stylize', 'canvas', { len: P('n', 18, 0, 120, 'عمق'), ang: P('n', 45, -180, 180, 'زاویه'), color: P('c', '#8A0A18', 0, 0, 'رنگ عمق') }),
  fx('longShadow', 'سایهٔ بلند', 'stylize', 'canvas', { len: P('n', 80, 0, 400, 'طول'), ang: P('n', 45, -180, 180, 'زاویه'), color: P('c', '#00000066', 0, 0, 'رنگ') }),
  fx('shine', 'برق زدن', 'stylize', 'canvas', { color: P('c', '#FFFFFF', 0, 0, 'رنگ نور'), width: P('n', 18, 2, 80, 'پهنا'), ang: P('n', 20, -90, 90, 'زاویه'), every: P('n', 2, 0.3, 10, 'هر چند ثانیه'), op: P('n', 80, 0, 100, 'شدت') }),
  fx('leak', 'نشت نور', 'stylize', 'canvas', { color: P('c', '#FF6A2A', 0, 0, 'رنگ ۱'), color2: P('c', '#FFD36B', 0, 0, 'رنگ ۲'), amt: P('n', 60, 0, 100, 'شدت'), speed: P('n', 30, 0, 200, 'سرعت') }),
  fx('beatFlash', 'فلاش با ضرب', 'stylize', 'canvas', { amt: P('n', 80, 0, 300, 'شدت'), color: P('c', '#FFFFFF', 0, 0, 'رنگ فلاش') }),
  fx('rgb', 'تفکیک رنگ', 'stylize', 'canvas', { amt: P('n', 8, 0, 80, 'فاصله'), ang: P('n', 0, -360, 360, 'زاویه') }),
  fx('glitch', 'گلیچ', 'stylize', 'canvas', { amt: P('n', 40, 0, 100, 'شدت'), speed: P('n', 12, 1, 60, 'سرعت'), beat: P('n', 60, 0, 100, 'وابستگی به ضرب') }),
  fx('vhs', 'نوار VHS', 'stylize', 'canvas', { amt: P('n', 60, 0, 100, 'شدت'), lines: P('n', 50, 0, 100, 'خطوط') }),
  fx('scan', 'خطوط تلویزیون', 'stylize', 'canvas', { gap: P('n', 4, 2, 30, 'فاصله'), op: P('n', 35, 0, 100, 'تیرگی'), speed: P('n', 20, 0, 200, 'حرکت') }),
  fx('grain', 'دانهٔ فیلم', 'stylize', 'canvas', { amt: P('n', 30, 0, 100, 'شدت'), size: P('n', 1.5, 1, 6, 'درشتی') }),
  fx('halftone', 'نقطه‌ای (چاپی)', 'stylize', 'canvas', { size: P('n', 10, 3, 60, 'اندازهٔ نقطه'), color: P('c', '#00000000', 0, 0, 'رنگ نقطه (شفاف = رنگ خود تصویر)') }),
  fx('pixel', 'پیکسلی', 'stylize', 'canvas', { size: P('n', 14, 1, 120, 'اندازهٔ خانه') }),
  fx('lumaKey', 'کلید روشنایی', 'stylize', 'canvas', { level: P('n', 50, 0, 100, 'مرز'), soft: P('n', 20, 0, 100, 'نرمی'), mode: P('n', 0, 0, 1, 'حالت: ۰ حذف تیره، ۱ حذف روشن') }),
  fx('wipe', 'پاک‌کن شعاعی', 'stylize', 'canvas', { prog: P('n', 50, 0, 100, 'پیشرفت'), ang: P('n', 0, -180, 180, 'زاویهٔ شروع') }),
  fx('checker', 'شطرنجی', 'stylize', 'canvas', { size: P('n', 40, 5, 200, 'اندازهٔ خانه'), op: P('n', 40, 0, 100, 'شفافیت') }),
  fx('flipH', 'وارونهٔ افقی', 'stylize', 'canvas', {  }),
  fx('flipV', 'وارونهٔ عمودی', 'stylize', 'canvas', {  }),
  fx('grid', 'شبکه', 'stylize', 'canvas', { size: P('n', 60, 5, 300, 'فاصلهٔ خطوط'), op: P('n', 35, 0, 100, 'شفافیت'), color: P('c', '#FFFFFF', 0, 0, 'رنگ خط') }),
  fx('matte', 'مات تیره/روشن', 'stylize', 'canvas', { level: P('n', 50, 0, 100, 'مرز'), soft: P('n', 20, 0, 100, 'نرمی'), mode: P('n', 0, 0, 1, 'حالت: ۰ نگه داشتن روشن، ۱ نگه داشتن تیره') }),
  fx('edgeGlow', 'درخشش لبه', 'stylize', 'canvas', { color: P('c', '#E4142A', 0, 0, 'رنگ'), amt: P('n', 80, 0, 200, 'شدت') }),
  fx('feather', 'لبهٔ نرم', 'stylize', 'canvas', { r: P('n', 20, 0, 100, 'شعاع') }),
  fx('neon', 'نئون', 'stylize', 'canvas', { color: P('c', '#FF2D78', 0, 0, 'رنگ'), amt: P('n', 80, 0, 200, 'شدت') }),
  fx('lensFlare', 'درخشش لنز', 'stylize', 'canvas', { color: P('c', '#FFD36B', 0, 0, 'رنگ'), amt: P('n', 70, 0, 200, 'شدت') }),
  fx('rain', 'بارش', 'stylize', 'canvas', { amt: P('n', 40, 0, 100, 'تراکم'), speed: P('n', 60, 0, 200, 'سرعت بارش'), ang: P('n', 15, -45, 45, 'زاویه') }),
  fx('innerShadow', 'سایهٔ داخلی', 'stylize', 'canvas', { r: P('n', 16, 0, 100, 'نرمی'), op: P('n', 60, 0, 100, 'شفافیت'), color: P('c', '#000000', 0, 0, 'رنگ') }),
  fx('bevel', 'لبهٔ برجسته', 'stylize', 'canvas', { amt: P('n', 60, 0, 200, 'شدت'), ang: P('n', 45, -180, 180, 'زاویهٔ نور') }),
  fx('comic', 'کمیک', 'stylize', 'canvas', { level: P('n', 50, 0, 100, 'مرز') }),
  fx('echo', 'پژواک', 'stylize', 'canvas', { amt: P('n', 20, 0, 100, 'فاصله'), n: P('n', 4, 1, 8, 'تعداد کپی') }),
  fx('dither', 'دیتر', 'stylize', 'canvas', {  }),
  fx('haze', 'مه', 'stylize', 'canvas', { amt: P('n', 40, 0, 100, 'شدت') }),
  fx('bloom', 'شکوفایی نور', 'stylize', 'canvas', { amt: P('n', 50, 0, 200, 'شدت') }),
  fx('starburst', 'ستارهٔ نور', 'stylize', 'canvas', { n: P('n', 12, 4, 24, 'تعداد پرتو'), amt: P('n', 60, 0, 200, 'شدت') }),
  fx('snow', 'برف', 'stylize', 'canvas', { amt: P('n', 40, 0, 100, 'تراکم'), speed: P('n', 50, 0, 200, 'سرعت') }),
  fx('confetti', 'کاغذ رنگی', 'stylize', 'canvas', { amt: P('n', 40, 0, 100, 'تراکم'), speed: P('n', 60, 0, 200, 'سرعت') }),
  fx('fireflies', 'کرم شب‌تاب', 'stylize', 'canvas', { amt: P('n', 30, 0, 100, 'تعداد') }),
  fx('bokeh', 'بوکه', 'stylize', 'canvas', { amt: P('n', 50, 0, 200, 'شدت') }),
  fx('halo', 'هاله', 'stylize', 'canvas', { amt: P('n', 60, 0, 200, 'شدت') }),
  fx('dataMosh', 'دیتاموش', 'stylize', 'canvas', { amt: P('n', 50, 0, 100, 'شدت') }),
  fx('inkBleed', 'پخش جوهر', 'stylize', 'canvas', { amt: P('n', 50, 0, 100, 'شدت') }),
  fx('paperGrain', 'کاغذ', 'stylize', 'canvas', { amt: P('n', 50, 0, 100, 'شدت') }),
  fx('lightSweep', 'جاروی نور', 'stylize', 'canvas', { speed: P('n', 1, 0.1, 5, 'سرعت'), amt: P('n', 60, 0, 200, 'شدت') }),
  fx('dream', 'رویا', 'stylize', 'canvas', { amt: P('n', 50, 0, 100, 'شدت') }),
  fx('noir', 'نوآر', 'stylize', 'canvas', { amt: P('n', 70, 0, 100, 'شدت') }),
  fx('solarFlare', 'شعلهٔ خورشیدی', 'stylize', 'canvas', { amt: P('n', 70, 0, 200, 'شدت') }),
  fx('glowPulse', 'درخشش تپنده', 'stylize', 'canvas', { amt: P('n', 60, 0, 200, 'شدت') }),
  fx('softFocus', 'فوکوس نرم', 'stylize', 'canvas', { amt: P('n', 50, 0, 100, 'شدت') }),
  fx('anaglyph', 'آنالیف سه‌بعدی', 'stylize', 'canvas', { amt: P('n', 10, 0, 40, 'فاصله') }),
  fx('scanSweep', 'خط اسکن', 'stylize', 'canvas', { speed: P('n', 1, 0.1, 5, 'سرعت') }),
  fx('flicker', 'سوسو', 'stylize', 'canvas', { amt: P('n', 30, 0, 100, 'شدت') }),
  fx('chromaticPulse', 'تپش رنگی', 'stylize', 'canvas', { amt: P('n', 20, 0, 100, 'شدت') }),
  fx('shatter', 'خرد شدن', 'stylize', 'canvas', { amt: P('n', 50, 0, 100, 'شدت'), speed: P('n', 1, 0.1, 5, 'سرعت') }),
  fx('rowShift', 'جابه‌جایی ردیف', 'stylize', 'canvas', { amt: P('n', 30, 0, 100, 'شدت') }),
  fx('lightRays', 'پرتوهای چرخان', 'stylize', 'canvas', { n: P('n', 12, 4, 24, 'تعداد پرتو'), speed: P('n', 0.5, 0, 3, 'سرعت') }),
  fx('electric', 'برق', 'stylize', 'canvas', { amt: P('n', 70, 0, 200, 'شدت') }),
  fx('smoke', 'دود', 'stylize', 'canvas', { amt: P('n', 40, 0, 100, 'شدت') }),
  fx('dust', 'غبار', 'stylize', 'canvas', { amt: P('n', 40, 0, 100, 'تعداد') }),
  fx('vhsTracking', 'ردیابی نوار', 'stylize', 'canvas', { amt: P('n', 50, 0, 100, 'شدت') }),
  fx('oldFilm', 'فیلم قدیمی', 'stylize', 'canvas', { amt: P('n', 70, 0, 100, 'شدت') }),
  fx('neonSign', 'تابلوی نئون', 'stylize', 'canvas', { color: P('c', '#FF2D78', 0, 0, 'رنگ'), amt: P('n', 80, 0, 200, 'شدت') }),
  fx('scanNoise', 'نویز اسکن', 'stylize', 'canvas', { amt: P('n', 30, 0, 100, 'شدت') }),
  fx('burst', 'انفجار نور', 'stylize', 'canvas', { amt: P('n', 50, 0, 100, 'شدت') }),
  fx('sparkle', 'جرقه', 'stylize', 'canvas', { amt: P('n', 40, 0, 100, 'تعداد') }),
  fx('vignettePulse', 'تاریکی لبهٔ تپنده', 'stylize', 'canvas', { amt: P('n', 50, 0, 100, 'شدت') }),
  fx('grainPulse', 'دانهٔ تپنده', 'stylize', 'canvas', { amt: P('n', 30, 0, 100, 'شدت') }),
  fx('shadowPulse', 'سایهٔ تپنده', 'stylize', 'canvas', { amt: P('n', 50, 0, 100, 'شدت'), dx: P('n', 10, -200, 200, 'افقی'), dy: P('n', 12, -200, 200, 'عمودی') }),
  fx('strobeFlash', 'چشمک‌زن', 'stylize', 'canvas', { amt: P('n', 80, 0, 100, 'شدت') }),
  fx('lightLeak', 'نشت نور', 'stylize', 'canvas', { amt: P('n', 50, 0, 100, 'شدت') }),
  fx('neonPulse', 'نئون تپنده', 'stylize', 'canvas', { color: P('c', '#00E5FF', 0, 0, 'رنگ'), amt: P('n', 80, 0, 200, 'شدت') }),
  fx('haloPulse', 'هالهٔ تپنده', 'stylize', 'canvas', { amt: P('n', 50, 0, 100, 'شدت') }),
  fx('fireGlow', 'درخشش آتش', 'stylize', 'canvas', { amt: P('n', 50, 0, 100, 'شدت') }),
  fx('iceGlow', 'درخشش یخ', 'stylize', 'canvas', { amt: P('n', 50, 0, 100, 'شدت') }),
  fx('starPulse', 'ستارهٔ تپنده', 'stylize', 'canvas', { amt: P('n', 30, 0, 100, 'تعداد') }),
  fx('sunsetGlow', 'درخشش غروب', 'stylize', 'canvas', { amt: P('n', 50, 0, 100, 'شدت') }),
  fx('moonGlow', 'درخشش ماه', 'stylize', 'canvas', { amt: P('n', 50, 0, 100, 'شدت') }),
  fx('cometTrail', 'دنبالهٔ شهاب', 'stylize', 'canvas', { amt: P('n', 20, 0, 100, 'تعداد') }),
  fx('emberGlow', 'جرقه‌های آتش', 'stylize', 'canvas', { amt: P('n', 30, 0, 100, 'تعداد') }),
  fx('frostGlow', 'سرمای یخ', 'stylize', 'canvas', { amt: P('n', 50, 0, 100, 'شدت') }),
  fx('pulseRing', 'حلقهٔ تپنده', 'stylize', 'canvas', { amt: P('n', 50, 0, 100, 'شدت') }),
  fx('auroraWave', 'موج شفق', 'stylize', 'canvas', { amt: P('n', 40, 0, 100, 'شدت') }),
  fx('galaxyGlow', 'درخشش کهکشان', 'stylize', 'canvas', { amt: P('n', 50, 0, 100, 'شدت') }),
  fx('cometPulse', 'شهاب تپنده', 'stylize', 'canvas', { amt: P('n', 15, 0, 100, 'تعداد') }),
  fx('mistGlow', 'درخشش مه', 'stylize', 'canvas', { amt: P('n', 40, 0, 100, 'شدت') }),
  fx('solarGlow', 'درخشش خورشید', 'stylize', 'canvas', { amt: P('n', 50, 0, 100, 'شدت') }),
  fx('lunarGlow', 'درخشش ماهتاب', 'stylize', 'canvas', { amt: P('n', 50, 0, 100, 'شدت') }),
  fx('stormCloud', 'ابر طوفان', 'stylize', 'canvas', { amt: P('n', 40, 0, 100, 'شدت') }),
  fx('crystalGlow', 'درخشش کریستال', 'stylize', 'canvas', { amt: P('n', 50, 0, 100, 'شدت') }),
  fx('coralGlow', 'درخشش مرجانی', 'stylize', 'canvas', { amt: P('n', 50, 0, 100, 'شدت') }),
  fx('mintGlow', 'درخشش نعنایی', 'stylize', 'canvas', { amt: P('n', 50, 0, 100, 'شدت') }),
  fx('amberGlow', 'درخشش کهربایی', 'stylize', 'canvas', { amt: P('n', 50, 0, 100, 'شدت') }),
  fx('tealGlow', 'درخشش فیروزه‌ای', 'stylize', 'canvas', { amt: P('n', 50, 0, 100, 'شدت') }),
  fx('violetGlow', 'درخشش بنفش', 'stylize', 'canvas', { amt: P('n', 50, 0, 100, 'شدت') }),
  fx('glowWave', 'درخشش موجی', 'stylize', 'canvas', { amt: P('n', 50, 0, 100, 'شدت') }),
  fx('glowRing', 'حلقهٔ درخشان', 'stylize', 'canvas', { amt: P('n', 50, 0, 100, 'شدت') }),
  fx('neonWave', 'نئون موجی', 'stylize', 'canvas', { color: P('c', '#FF2D78', 0, 0, 'رنگ'), amt: P('n', 80, 0, 200, 'شدت') }),
  fx('auroraGlow', 'درخشش شفق', 'stylize', 'canvas', { amt: P('n', 40, 0, 100, 'شدت') }),
  fx('sunsetWave', 'غروب موجی', 'stylize', 'canvas', { amt: P('n', 40, 0, 100, 'شدت') }),
  fx('oceanGlow', 'درخشش اقیانوس', 'stylize', 'canvas', { amt: P('n', 40, 0, 100, 'شدت') }),
  fx('mistWave', 'مهٔ موجی', 'stylize', 'canvas', { amt: P('n', 40, 0, 100, 'شدت') }),
  fx('stormGlow', 'درخشش طوفان', 'stylize', 'canvas', { amt: P('n', 40, 0, 100, 'شدت') }),
  fx('emberWave', 'جرقهٔ موجی', 'stylize', 'canvas', { amt: P('n', 30, 0, 100, 'تعداد') }),
  fx('frostWave', 'سرمای موجی', 'stylize', 'canvas', { amt: P('n', 50, 0, 100, 'شدت') }),
  fx('pulseGlow', 'درخشش تپنده', 'stylize', 'canvas', { amt: P('n', 50, 0, 100, 'شدت') }),
  fx('ringGlow', 'حلقهٔ درخشان موجی', 'stylize', 'canvas', { amt: P('n', 50, 0, 100, 'شدت') }),
  fx('starGlow', 'درخشش ستاره', 'stylize', 'canvas', { amt: P('n', 30, 0, 100, 'تعداد') }),
  fx('cometGlow', 'درخشش شهاب', 'stylize', 'canvas', { amt: P('n', 15, 0, 100, 'تعداد') }),
  fx('moonWave', 'ماه موجی', 'stylize', 'canvas', { amt: P('n', 50, 0, 100, 'شدت') }),
  fx('sunWave', 'خورشید موجی', 'stylize', 'canvas', { amt: P('n', 50, 0, 100, 'شدت') }),
  fx('nebulaGlow', 'درخشش سحابی', 'stylize', 'canvas', { amt: P('n', 50, 0, 100, 'شدت') }),
  fx('quasarGlow', 'درخشش اختروش', 'stylize', 'canvas', { amt: P('n', 50, 0, 100, 'شدت') }),
  fx('eclipseGlow', 'درخشش خورشیدگرفتگی', 'stylize', 'canvas', { amt: P('n', 50, 0, 100, 'شدت') }),
  fx('supernova', 'ابرنواختر', 'stylize', 'canvas', { amt: P('n', 50, 0, 100, 'شدت') }),
  fx('stardust', 'غبار ستاره‌ای', 'stylize', 'canvas', { amt: P('n', 40, 0, 100, 'تعداد') }),
  fx('lunarEclipse', 'ماه‌گرفتگی', 'stylize', 'canvas', { amt: P('n', 50, 0, 100, 'شدت') }),
  fx('auroraPulse', 'شفق تپنده', 'stylize', 'canvas', { amt: P('n', 40, 0, 100, 'شدت') }),
  fx('galaxyWave', 'کهکشان موجی', 'stylize', 'canvas', { amt: P('n', 50, 0, 100, 'شدت') }),
  fx('nebulaWave', 'سحابی موجی', 'stylize', 'canvas', { amt: P('n', 50, 0, 100, 'شدت') }),
  fx('quasarWave', 'اختروش موجی', 'stylize', 'canvas', { amt: P('n', 50, 0, 100, 'شدت') }),
  fx('supernovaWave', 'ابرنواختر موجی', 'stylize', 'canvas', { amt: P('n', 50, 0, 100, 'شدت') }),
  fx('cosmosGlow', 'درخشش کیهانی', 'stylize', 'canvas', { amt: P('n', 40, 0, 100, 'شدت') }),
  fx('eclipseWave', 'خورشیدگرفتگی موجی', 'stylize', 'canvas', { amt: P('n', 50, 0, 100, 'شدت') }),
  fx('solarEclipse', 'خورشیدگرفتگی', 'stylize', 'canvas', { amt: P('n', 50, 0, 100, 'شدت') }),
  fx('auroraWavePulse', 'شفق موجی تپنده', 'stylize', 'canvas', { amt: P('n', 40, 0, 100, 'شدت') }),
  fx('galaxyPulse', 'کهکشان تپنده', 'stylize', 'canvas', { amt: P('n', 50, 0, 100, 'شدت') }),
  fx('nebulaPulse', 'سحابی تپنده', 'stylize', 'canvas', { amt: P('n', 50, 0, 100, 'شدت') }),
  fx('quasarPulse', 'اختروش تپنده', 'stylize', 'canvas', { amt: P('n', 50, 0, 100, 'شدت') }),
  fx('supernovaPulse', 'ابرنواختر تپنده', 'stylize', 'canvas', { amt: P('n', 50, 0, 100, 'شدت') }),
  fx('cosmosPulse', 'کیهان تپنده', 'stylize', 'canvas', { amt: P('n', 40, 0, 100, 'شدت') }),
  fx('eclipsePulse', 'گرفتگی تپنده', 'stylize', 'canvas', { amt: P('n', 50, 0, 100, 'شدت') }),
  fx('repeat', 'تکرارکننده', 'stylize', 'filter', { count: P('n', 5, 1, 40, 'تعداد'), dx: P('n', 90, -800, 800, 'فاصلهٔ افقی'), dy: P('n', 0, -800, 800, 'فاصلهٔ عمودی'), rot: P('n', 0, -180, 180, 'چرخش هر نسخه'), scale: P('n', 100, 30, 160, 'اندازهٔ هر نسخه'), fade: P('n', 50, 0, 100, 'محو تدریجی') }),
  fx('crop', 'برش لبه‌ها', 'stylize', 'filter', { l: P('n', 0, 0, 100, 'از راست'), r: P('n', 0, 0, 100, 'از چپ'), t: P('n', 0, 0, 100, 'از بالا'), b: P('n', 0, 0, 100, 'از پایین') }),
  // رنگ
  fx('color', 'تنظیم رنگ', 'color', 'canvas', { bright: P('n', 100, 0, 300, 'روشنایی'), contrast: P('n', 100, 0, 300, 'کنتراست'), sat: P('n', 100, 0, 300, 'اشباع'), hue: P('n', 0, -180, 180, 'چرخش فام'), gray: P('n', 0, 0, 100, 'سیاه‌وسفید'), sepia: P('n', 0, 0, 100, 'قدیمی'), invert: P('n', 0, 0, 100, 'نگاتیو') }),
  fx('duotone', 'دوتُن', 'color', 'canvas', { c1: P('c', '#1B0B3A', 0, 0, 'رنگ تیره‌ها'), c2: P('c', '#FF4D6D', 0, 0, 'رنگ روشن‌ها'), amt: P('n', 100, 0, 100, 'میزان') }),
  fx('gradOver', 'گرادیان رنگی', 'color', 'canvas', { c1: P('c', '#FFD86B', 0, 0, 'رنگ ۱'), c2: P('c', '#FF3D7F', 0, 0, 'رنگ ۲'), ang: P('n', 90, -360, 360, 'زاویه'), amt: P('n', 100, 0, 100, 'میزان') }),
  fx('hueCycle', 'چرخش رنگ‌ها', 'color', 'canvas', { speed: P('n', 0.5, 0, 5, 'دور در ثانیه'), sat: P('n', 130, 0, 300, 'اشباع') }),
  fx('vibrance', 'سرزندگی رنگ', 'color', 'canvas', { amt: P('n', 50, 0, 200, 'شدت') }),
  fx('channelShift', 'جابه‌جایی کانال', 'color', 'canvas', { dx: P('n', 8, -80, 80, 'جابه‌جایی افقی'), dy: P('n', 0, -80, 80, 'جابه‌جایی عمودی') }),
  fx('solarize', 'سولاریزه', 'color', 'canvas', { level: P('n', 50, 0, 100, 'مرز') }),
  fx('invertFx', 'نگاتیو', 'color', 'canvas', {  }),
  fx('exposure', 'نوردهی', 'color', 'canvas', { amt: P('n', 20, -100, 100, 'مقدار') }),
  fx('clarity', 'وضوح', 'color', 'canvas', { amt: P('n', 50, 0, 200, 'شدت') }),
  fx('levels', 'سطوح رنگ', 'color', 'canvas', { black: P('n', 0, 0, 100, 'سیاه'), white: P('n', 100, 0, 100, 'سفید'), gamma: P('n', 100, 10, 300, 'گاما') }),
  fx('sepiaFx', 'سپیا', 'color', 'canvas', { amt: P('n', 80, 0, 100, 'شدت') }),
  fx('vintage', 'قدیمی (وینتیج)', 'color', 'canvas', { amt: P('n', 70, 0, 100, 'شدت') }),
  fx('crossProcess', 'کراس‌پروسس', 'color', 'canvas', { amt: P('n', 70, 0, 100, 'شدت') }),
  fx('watercolor', 'آبرنگ', 'color', 'canvas', { amt: P('n', 50, 0, 100, 'شدت') }),
  fx('infrared', 'مادون قرمز', 'color', 'canvas', {  }),
  fx('nightVision', 'دید در شب', 'color', 'canvas', { amt: P('n', 70, 0, 100, 'شدت') }),
  fx('thermal', 'حرارتی', 'color', 'canvas', {  }),
  fx('tritone', 'سه‌تُن', 'color', 'canvas', { c1: P('c', '#0B1026', 0, 0, 'رنگ سایه‌ها'), c2: P('c', '#E4142A', 0, 0, 'رنگ میانه‌ها'), c3: P('c', '#FFD86B', 0, 0, 'رنگ روشن‌ها') }),
  fx('silhouette', 'سیلوئت', 'color', 'canvas', { color: P('c', '#111111', 0, 0, 'رنگ') }),
  fx('xray', 'اشعهٔ ایکس', 'color', 'canvas', {  }),
  fx('prism', 'منشور', 'color', 'canvas', { amt: P('n', 50, 0, 100, 'شدت') }),
  fx('aurora', 'شفق', 'color', 'canvas', { amt: P('n', 50, 0, 100, 'شدت') }),
  fx('colorPop', 'رنگ گزینشی', 'color', 'canvas', { color: P('c', '#E4142A', 0, 0, 'رنگ'), tol: P('n', 40, 0, 100, 'دامنه') }),
  fx('rainbowShift', 'چرخش رنگ', 'color', 'canvas', { speed: P('n', 1, 0.1, 5, 'سرعت') }),
  fx('colorBands', 'نوارهای رنگی', 'color', 'canvas', { amt: P('n', 30, 0, 100, 'شدت') }),
  fx('prismShift', 'منشور جابه‌جا', 'color', 'canvas', { amt: P('n', 30, 0, 100, 'شدت') }),
  fx('invertPulse', 'معکوس تپنده', 'color', 'canvas', { amt: P('n', 70, 0, 100, 'شدت') }),
  fx('huePulse', 'فام تپنده', 'color', 'canvas', { amt: P('n', 60, 0, 180, 'دامنه') }),
  fx('colorSplit', 'شکاف رنگ', 'color', 'canvas', { amt: P('n', 20, 0, 100, 'شدت') }),
  fx('tintPulse', 'رنگ تپنده', 'color', 'canvas', { color: P('c', '#FF2D78', 0, 0, 'رنگ'), amt: P('n', 40, 0, 100, 'شدت') }),
  fx('prismWave', 'منشور موجی', 'color', 'canvas', { amt: P('n', 30, 0, 100, 'شدت') }),
  fx('colorWave', 'موج رنگ', 'color', 'canvas', { amt: P('n', 60, 0, 180, 'شدت') }),
  fx('rainbowWave', 'موج رنگین‌کمان', 'color', 'canvas', { amt: P('n', 40, 0, 100, 'شدت') }),
  fx('oceanWave', 'موج اقیانوس', 'color', 'canvas', { amt: P('n', 40, 0, 100, 'شدت') }),
  fx('hologram', 'هولوگرام', 'color', 'canvas', { amt: P('n', 40, 0, 100, 'شدت') }),
  fx('prismGlow', 'درخشش منشور', 'color', 'canvas', { amt: P('n', 40, 0, 100, 'شدت') }),
  fx('cosmosWave', 'موج کیهانی', 'color', 'canvas', { amt: P('n', 40, 0, 100, 'شدت') }),
  // متن
  fx('gradText', 'متن گرادیان', 'text', 'filter', { c1: P('c', '#FFD86B', 0, 0, 'رنگ ۱'), c2: P('c', '#FF7A00', 0, 0, 'رنگ ۲'), ang: P('n', 90, -360, 360, 'زاویه') }),
  fx('rainbow', 'کلمه‌های رنگین‌کمانی', 'text', 'filter', { speed: P('n', 0.4, 0, 4, 'سرعت چرخش'), sat: P('n', 90, 0, 100, 'اشباع'), light: P('n', 62, 20, 90, 'روشنی') }),
  fx('wordWave', 'موج کلمه‌ها', 'text', 'filter', { amp: P('n', 18, 0, 120, 'ارتفاع'), speed: P('n', 3, 0, 15, 'سرعت'), gap: P('n', 0.7, 0, 3, 'فاصلهٔ موج') }),
  fx('jitter', 'لرزش کلمه‌ها', 'text', 'filter', { amt: P('n', 6, 0, 60, 'شدت'), speed: P('n', 12, 1, 40, 'تندی'), rot: P('n', 4, 0, 30, 'چرخش') }),
  fx('karaoke', 'کارائوکه', 'text', 'filter', { color: P('c', '#E4142A', 0, 0, 'رنگ خوانده‌شده'), start: P('n', 0, 0, 100, 'شروع'), end: P('n', 90, 0, 100, 'پایان'), pop: P('n', 12, 0, 60, 'بزرگ شدن کلمهٔ فعلی') }),
  fx('wordFlicker', 'چشمک کلمه‌ها', 'text', 'filter', { amt: P('n', 35, 0, 100, 'مقدار'), speed: P('n', 10, 1, 40, 'تندی') }),
  fx('wordPop', 'پرش کلمه‌ها', 'text', 'filter', { amp: P('n', 30, 0, 100, 'شدت بزرگ شدن'), speed: P('n', 3, 0, 15, 'سرعت موج') }),
  fx('letterBounce', 'پرش حروف', 'text', 'filter', { amp: P('n', 30, 0, 120, 'ارتفاع پرش'), speed: P('n', 3, 0, 15, 'سرعت موج') }),
  // اعوجاج
  fx('zoomBlur', 'تاری زوم', 'distort', 'canvas', { amt: P('n', 25, 0, 100, 'شدت') }),
  fx('dirBlur', 'تاری جهت‌دار', 'distort', 'canvas', { len: P('n', 30, 0, 200, 'طول'), ang: P('n', 0, -180, 180, 'زاویه') }),
  fx('kaleido', 'کالیدوسکوپ', 'distort', 'canvas', { mode: P('n', 0, 0, 1, 'حالت: ۰ چهارتایی، ۱ دوتایی') }),
  fx('spinBlur', 'تاری چرخشی', 'distort', 'canvas', { amt: P('n', 30, 0, 100, 'شدت') }),
  fx('findEdges', 'یافتن لبه', 'distort', 'canvas', { amt: P('n', 100, 0, 200, 'شدت') }),
  fx('fisheye', 'چشم ماهی', 'distort', 'canvas', { amt: P('n', 50, 0, 100, 'شدت') }),
  fx('emboss', 'برجسته‌سازی', 'distort', 'canvas', { amt: P('n', 60, 0, 200, 'شدت') }),
  fx('squeeze', 'فشردگی', 'distort', 'canvas', { amt: P('n', 40, -90, 90, 'شدت') }),
  fx('clouds', 'ابر', 'distort', 'canvas', { amt: P('n', 50, 0, 100, 'شدت'), scale: P('n', 50, 10, 200, 'درشتی') }),
  fx('tiltShift', 'تاری بالا و پایین', 'distort', 'canvas', { r: P('n', 12, 0, 60, 'شعاع تاری'), band: P('n', 40, 5, 100, 'پهنای نوار واضح') }),
  fx('bend', 'خم کردن', 'distort', 'canvas', { amt: P('n', 40, -100, 100, 'شدت') }),
  fx('fractal', 'نویز فرکتالی', 'distort', 'canvas', { amt: P('n', 50, 0, 100, 'شدت'), scale: P('n', 50, 10, 200, 'درشتی') }),
  fx('tilt3d', 'کج سه‌بعدی', 'distort', 'canvas', { ang: P('n', 25, -75, 75, 'زاویه'), axis: P('n', 0, 0, 1, 'محور: ۰ افقی، ۱ عمودی') }),
  fx('flip3d', 'چرخش سه‌بعدی', 'distort', 'canvas', { speed: P('n', 0.5, 0, 3, 'دور در ثانیه') }),
  fx('sphere', 'کره', 'distort', 'canvas', { amt: P('n', 60, 0, 100, 'شدت') }),
  fx('mosaic', 'موزاییک', 'distort', 'canvas', { size: P('n', 24, 4, 120, 'اندازهٔ خانه') }),
  fx('slitScan', 'اسکن نواری', 'distort', 'canvas', { amt: P('n', 50, 0, 100, 'کشیدگی'), dir: P('n', 0, 0, 1, 'جهت: ۰ افقی، ۱ عمودی') }),
  fx('oilPaint', 'رنگ روغن', 'distort', 'canvas', { amt: P('n', 50, 0, 100, 'شدت') }),
  fx('pencil', 'مداد', 'distort', 'canvas', { amt: P('n', 100, 0, 200, 'شدت') }),
  fx('surfaceBlur', 'تاری سطحی', 'distort', 'canvas', { r: P('n', 12, 0, 100, 'شعاع') }),
  fx('smear', 'کشیدگی جهتی', 'distort', 'canvas', { amt: P('n', 50, 0, 100, 'شدت'), ang: P('n', 0, -180, 180, 'زاویه') }),
  fx('pageCurl', 'تا خوردن صفحه', 'distort', 'canvas', { amt: P('n', 50, 0, 100, 'شدت تا') }),
  fx('cubeRotate', 'مکعب', 'distort', 'canvas', { speed: P('n', 0.5, 0, 3, 'دور در ثانیه') }),
  fx('mandala', 'مندالا', 'distort', 'canvas', { n: P('n', 6, 2, 12, 'تعداد تکرار') }),
  fx('pixelSort', 'مرتب‌سازی پیکسل', 'distort', 'canvas', { size: P('n', 32, 8, 128, 'اندازهٔ بلوک') }),
  fx('tunnel', 'تونل', 'distort', 'canvas', { n: P('n', 5, 1, 10, 'تعداد') }),
  fx('infiniteZoom', 'زوم بی‌نهایت', 'distort', 'canvas', { speed: P('n', 1, 0.1, 5, 'سرعت') }),
  fx('spinZoom', 'چرخش و زوم', 'distort', 'canvas', { speed: P('n', 0.5, 0, 3, 'سرعت چرخش'), amt: P('n', 20, 0, 100, 'تپش زوم') }),
  fx('rippleRing', 'حلقه‌های موج', 'distort', 'canvas', { speed: P('n', 1, 0.1, 5, 'سرعت'), amt: P('n', 60, 0, 200, 'شدت') }),
  fx('gridWarp', 'شبکهٔ تاب‌دار', 'distort', 'canvas', { amt: P('n', 20, 0, 100, 'شدت') }),
  fx('heatHaze', 'گرمای هوا', 'distort', 'canvas', { amt: P('n', 20, 0, 100, 'شدت') }),
  fx('liquid', 'مایع', 'distort', 'canvas', { amt: P('n', 20, 0, 100, 'شدت') }),
  fx('shear', 'کجی', 'distort', 'canvas', { amt: P('n', 20, -80, 80, 'شدت') }),
  fx('cylinder', 'استوانه', 'distort', 'canvas', { amt: P('n', 60, 0, 100, 'شدت') }),
  fx('marble', 'مرمر', 'distort', 'canvas', { amt: P('n', 50, 0, 100, 'شدت') }),
  fx('pixelWave', 'موج پیکسلی', 'distort', 'canvas', { amt: P('n', 20, 0, 100, 'شدت') }),
  fx('edgePulse', 'لبهٔ تپنده', 'distort', 'canvas', { amt: P('n', 80, 0, 200, 'شدت') }),
  fx('warpWave', 'موج تاب', 'distort', 'canvas', { amt: P('n', 20, 0, 100, 'شدت') }),
  fx('swirl', 'چرخش مرکزی', 'distort', 'canvas', { amt: P('n', 80, 0, 200, 'شدت') }),
  fx('gridPulse', 'شبکهٔ تپنده', 'distort', 'canvas', { amt: P('n', 40, 0, 100, 'شدت') }),
  fx('echoZoom', 'پژواک زوم', 'distort', 'canvas', { n: P('n', 4, 1, 8, 'تعداد') }),
  fx('focusPull', 'تغییر فوکوس', 'distort', 'canvas', { amt: P('n', 20, 0, 100, 'شدت') }),
  fx('depthField', 'عمق میدان', 'distort', 'canvas', { amt: P('n', 50, 0, 100, 'شدت') }),
  fx('waveShift', 'جابه‌جایی موجی', 'distort', 'canvas', { amt: P('n', 20, 0, 100, 'شدت') }),
  fx('zoomSpin', 'زوم چرخان', 'distort', 'canvas', { amt: P('n', 30, 0, 100, 'شدت') }),
  fx('slideEcho', 'پژواک لغزش', 'distort', 'canvas', { n: P('n', 4, 1, 8, 'تعداد') }),
  fx('blurPulse', 'تاری تپنده', 'distort', 'canvas', { amt: P('n', 20, 0, 100, 'شدت') }),
  fx('mosaicPulse', 'موزاییک تپنده', 'distort', 'canvas', { amt: P('n', 30, 0, 100, 'شدت') }),
  fx('ripplePulse', 'موج تپنده', 'distort', 'canvas', { amt: P('n', 30, 0, 100, 'شدت') }),
  fx('vortexPulse', 'گرداب تپنده', 'distort', 'canvas', { amt: P('n', 80, 0, 200, 'شدت') }),
  fx('shearPulse', 'برش تپنده', 'distort', 'canvas', { amt: P('n', 30, 0, 100, 'شدت') }),
  fx('skewWave', 'کجی موجی', 'distort', 'canvas', { amt: P('n', 20, 0, 100, 'شدت') }),
  fx('tunnelSpin', 'تونل چرخان', 'distort', 'canvas', { amt: P('n', 50, 0, 100, 'شدت') }),
  fx('fadeZoom', 'محو زوم', 'distort', 'canvas', { amt: P('n', 50, 0, 100, 'شدت') }),
  fx('spinFade', 'چرخش محو', 'distort', 'canvas', { amt: P('n', 50, 0, 100, 'شدت') }),
  fx('vignetteWave', 'لبهٔ موجی', 'distort', 'canvas', { amt: P('n', 50, 0, 100, 'شدت') }),
  fx('waveRipple', 'موج و ripple', 'distort', 'canvas', { amt: P('n', 20, 0, 100, 'شدت') }),
  fx('blackhole', 'سیاه‌چاله', 'distort', 'canvas', { amt: P('n', 50, 0, 100, 'شدت') }),
  fx('wormhole', 'کرم‌چاله', 'distort', 'canvas', { amt: P('n', 50, 0, 100, 'شدت') }),
  // حرکت
  fx('drift', 'رانش آرام', 'motion', 'filter', { speed: P('n', 30, -400, 400, 'سرعت (پیکسل/ثانیه)'), rot: P('n', 5, -90, 90, 'چرخش (درجه/ثانیه)') }),
  fx('wobble', 'تکان موجی', 'motion', 'filter', { amt: P('n', 20, 0, 200, 'دامنه'), freq: P('n', 2, 0.1, 10, 'تندی') }),
  fx('floaty', 'شناور', 'motion', 'filter', { amt: P('n', 20, 0, 200, 'دامنه'), freq: P('n', 1, 0.1, 5, 'تندی') }),
  fx('fadePulse', 'تپش شفافیت', 'motion', 'filter', { amt: P('n', 50, 0, 100, 'عمق'), freq: P('n', 2, 0.1, 10, 'تندی') }),
  fx('wiggle', 'شناوری نرم', 'motion', 'filter', { amt: P('n', 30, 0, 400, 'دامنه'), freq: P('n', 1.5, 0.1, 12, 'تندی'), rot: P('n', 0, 0, 90, 'چرخش') }),
  fx('swing', 'تاب خوردن', 'motion', 'filter', { ang: P('n', 12, 0, 90, 'زاویه'), freq: P('n', 0.8, 0.05, 6, 'تندی') }),
  fx('orbit', 'گردش دایره‌ای', 'motion', 'filter', { r: P('n', 30, 0, 600, 'شعاع'), freq: P('n', 0.5, -4, 4, 'دور در ثانیه') }),
  fx('zoomPulse', 'بزرگ‌کوچک منظم', 'motion', 'filter', { amt: P('n', 8, 0, 100, 'شدت'), freq: P('n', 1, 0.1, 8, 'تندی') }),
  fx('strobe', 'چشمک', 'motion', 'filter', { rate: P('n', 4, 0.5, 30, 'بار در ثانیه'), depth: P('n', 100, 0, 100, 'عمق'), beat: P('n', 0, 0, 100, 'روی ضرب') }),
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
  if (type === 'audio') base.audio = { volume: 1, fadeIn: 0, fadeOut: 0 };
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
