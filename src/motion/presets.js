import { newLayer, newEffect, LAYER_TYPES } from './schema.js';
import { CODE_SNIPPETS } from './codeapi.js';

/**
 * قالب‌های آماده — یک ضربه، یک ظاهر کامل
 * ─────────────────────────────────────────────────────────────
 * هر قالب فقط چند مقدار را روی یک لایهٔ معمولی می‌گذارد: رنگ و
 * اندازه، چند افکت، و انیمیشن ورود/خروج/تکرار. پس بعد از زدن قالب،
 * همه‌چیز مثل قبل قابل ویرایش است — قالب «جادو» نیست، فقط میان‌بر است.
 *
 * برای ساختن قالب تازه کافی است یک سطر به این جدول‌ها اضافه کنید:
 *   { id, label, ic, props: {...}, data: {...}, fx: [['glow', {r: 20}]], anim: {...} }
 */

/** افکت با مقدارهای دلخواه */
export function fxWith(type, vals = {}) {
  const fx = newEffect(type);
  for (const [k, v] of Object.entries(vals)) if (fx.p[k]) fx.p[k] = { v };
  return fx;
}

const A = (inId = 'none', inD = 0.5, outId = 'none', outD = 0.4, loopId = 'none', s = 1, a = 100) =>
  ({ in: { id: inId, d: inD }, out: { id: outId, d: outD }, loop: { id: loopId, s, a } });

/* ── سبک‌های متن ─────────────────────────────────────────── */
export const TEXT_STYLES = [
  { id: 'clean', label: 'ساده', ic: 'Aa', props: { fill: '#F6F3EC' }, anim: A('rise', 0.5, 'fade') },
  { id: 'neonRed', label: 'نئون قرمز', ic: '✺', props: { fill: '#FFF4F4' },
    fx: [['glow', { r: 22, amt: 200, color: '#FF1E3C' }]], anim: A('fade', 0.4, 'fade', 0.4, 'flicker', 0.4, 25) },
  { id: 'neonBlue', label: 'نئون آبی', ic: '✺', props: { fill: '#EFFFFF' },
    fx: [['glow', { r: 24, amt: 200, color: '#18C8FF' }]], anim: A('blurIn', 0.6, 'fade', 0.4, 'breathe') },
  { id: 'label', label: 'برچسب قرمز', ic: '▭', props: { fill: '#FFFFFF', bg: '#E4142AFF', bgPad: 30, bgR: 18 },
    anim: A('pop', 0.45, 'zoomOut', 0.35) },
  { id: 'labelW', label: 'برچسب سفید', ic: '▭', props: { fill: '#111111', bg: '#F6F3ECFF', bgPad: 28, bgR: 40 },
    anim: A('slideR', 0.45, 'slideL', 0.35) },
  { id: 'outline', label: 'توخالی', ic: '◌', props: { fill: '#F6F3EC00', stroke: '#F6F3EC', strokeW: 3 },
    anim: A('wordsFade', 0.8, 'fade') },
  { id: 'shadow', label: 'سایه‌دار', ic: '◗', props: { fill: '#FFFFFF' },
    fx: [['shadow', { dx: 8, dy: 12, r: 18, op: 80 }]], anim: A('rise', 0.5, 'fade') },
  { id: 'threeD', label: 'سه‌بعدی', ic: '◢', props: { fill: '#FFFFFF' },
    fx: [['extrude', { len: 20, ang: 50, color: '#B30E22' }]], anim: A('pop', 0.5, 'zoomOut', 0.35) },
  { id: 'gold', label: 'طلایی', ic: '★', props: { fill: '#FFD86B' },
    fx: [['gradText', { c1: '#FFF3B0', c2: '#E59A1A', ang: 90 }], ['shadow', { dx: 0, dy: 8, r: 14, op: 70 }], ['shine', { every: 2.5 }]],
    anim: A('zoomBlur', 0.7, 'fade') },
  { id: 'sunset', label: 'گرادیان غروب', ic: '▤', props: { fill: '#FF7A59' },
    fx: [['gradText', { c1: '#FFC371', c2: '#FF3D7F', ang: 0 }]], anim: A('wordsUp', 0.8, 'fade') },
  { id: 'rainbow', label: 'رنگین‌کمان', ic: '🌈', props: { fill: '#FFFFFF' },
    fx: [['rainbow', {}], ['wordWave', { amp: 14 }]], anim: A('wordsPop', 0.8, 'fade') },
  { id: 'glitch', label: 'گلیچ', ic: '▚', props: { fill: '#FFFFFF' }, data: { font: 'mono' },
    fx: [['rgb', { amt: 6 }], ['glitch', { amt: 45 }]], anim: A('glitchIn', 0.5, 'fade', 0.3, 'glitchJump', 0.8, 70) },
  { id: 'type', label: 'ماشین‌تحریر', ic: '⌨', props: { fill: '#F6F3EC' }, data: { font: 'mono' },
    anim: A('typewriter', 1.4, 'fade') },
  { id: 'karaoke', label: 'کارائوکه', ic: '🎤', props: { fill: '#F6F3EC', stroke: '#000000', strokeW: 2 },
    fx: [['karaoke', { color: '#E4142A' }]], anim: A('fade', 0.3, 'fade', 0.3) },
  { id: 'wave', label: 'موج‌دار', ic: '〰', props: { fill: '#F6F3EC' }, fx: [['wordWave', { amp: 22, speed: 4 }]],
    anim: A('wordsDrop', 0.9, 'fade') },
  { id: 'scary', label: 'لرزان (ترسناک)', ic: '≈', props: { fill: '#E9E9E9' }, data: { font: 'serif' },
    fx: [['jitter', { amt: 5, speed: 18 }], ['shadow', { dx: 0, dy: 0, r: 20, color: '#8B0000', op: 90 }]], anim: A('fade', 0.6, 'fade') },
  { id: 'cinema', label: 'عنوان سینمایی', ic: '🎬', props: { fill: '#F2EDE4', size: 92, spacing: 14 }, data: { font: 'serif' },
    fx: [['shadow', { dx: 0, dy: 0, r: 30, op: 60 }]], anim: A('blurIn', 1.2, 'fade', 0.8) },
  { id: 'comic', label: 'کمیک', ic: '💥', props: { fill: '#FFE600', stroke: '#111111', strokeW: 8, rot: -4 },
    fx: [['extrude', { len: 12, ang: 45, color: '#111111' }]], anim: A('elastic', 0.6, 'zoomOut', 0.3, 'tada', 1, 80) },
  { id: 'beat', label: 'تپش با ضرب', ic: '♥', props: { fill: '#FFFFFF' },
    fx: [['glow', { r: 16, amt: 90, color: '#E4142A' }], ['beatFlash', { amt: 60, color: '#FF4D6D' }]],
    anim: A('pop', 0.4, 'fade', 0.3, 'beat', 1, 120) },
  { id: 'subtitle', label: 'زیرنویس', ic: '⎁', props: { fill: '#FFFFFF', size: 64, bg: '#000000A6', bgPad: 18, bgR: 10 },
    place: (L, W, H) => { L.props.y = { v: Math.round(H * 0.36) }; }, anim: A('fade', 0.2, 'fade', 0.2) },
  { id: 'slam', label: '✦ کوبنده (شوریل)', ic: '💢', props: { fill: '#F6F3EC' },
    fx: [['extrude', { len: 18, ang: 45, color: '#E4142A' }], ['rgb', { amt: 4 }]], anim: A('zoomBlur', 0.3, 'zoomOut', 0.25, 'beat', 1, 140) },
  { id: 'retro', label: 'رترو VHS', ic: '📼', props: { fill: '#FFDEE9' },
    fx: [['vhs', { amt: 70 }], ['glow', { r: 12, amt: 60, color: '#FF4FD8' }]], anim: A('tvOn', 0.5, 'tvOn', 0.35) },
];

/* ── ظاهرهای آماده برای تصویر، ویدیو و هر لایهٔ دیگر ─────────── */
export const LOOKS = [
  { id: 'bw', label: 'سیاه‌وسفید', ic: '◐', fx: [['color', { gray: 100, contrast: 118 }]] },
  { id: 'old', label: 'عکس قدیمی', ic: '📜', fx: [['color', { sepia: 75, contrast: 92, sat: 80 }], ['grain', { amt: 35 }], ['vignette', { amt: 60 }]] },
  { id: 'film', label: 'فیلم سینمایی', ic: '🎞', fx: [['color', { contrast: 115, sat: 85 }], ['gradOver', { c1: '#0E4D64', c2: '#F29E4C', ang: 90, amt: 18 }], ['grain', { amt: 18 }], ['vignette', { amt: 45 }]] },
  { id: 'vhs', label: 'نوار VHS', ic: '📼', fx: [['vhs', { amt: 70, lines: 60 }], ['grain', { amt: 20 }]] },
  { id: 'duo', label: 'دوتُن صورتی', ic: '◑', fx: [['duotone', { c1: '#1B0B3A', c2: '#FF4D6D' }]] },
  { id: 'duoBlue', label: 'دوتُن آبی', ic: '◑', fx: [['duotone', { c1: '#04122E', c2: '#3FD0FF' }]] },
  { id: 'comic', label: 'کمیک', ic: '💥', fx: [['posterize', { levels: 4 }], ['outline', { w: 3, color: '#000000' }]] },
  { id: 'print', label: 'چاپ روزنامه', ic: '⁘', fx: [['halftone', { size: 9 }]] },
  { id: 'ink', label: 'جوهری دو رنگ', ic: '◧', fx: [['threshold', { level: 48 }]] },
  { id: 'dream', label: 'رؤیایی', ic: '☁', fx: [['color', { bright: 108, sat: 80 }], ['glow', { r: 30, amt: 55, color: '#FFFFFF' }]] },
  { id: 'warm', label: 'گرم', ic: '☀', fx: [['tint', { color: '#FF8A3D', amt: 22 }], ['color', { contrast: 105 }]] },
  { id: 'cold', label: 'سرد', ic: '❄', fx: [['tint', { color: '#3D8BFF', amt: 22 }], ['color', { sat: 85 }]] },
  { id: 'leak', label: 'نشت نور', ic: '🌅', fx: [['leak', { amt: 65 }]] },
  { id: 'pop', label: 'رنگ‌های پاپ', ic: '🌈', fx: [['hueCycle', { speed: 0.3, sat: 160 }]] },
  { id: 'retroPix', label: 'بازی قدیمی', ic: '👾', fx: [['pixel', { size: 10 }], ['posterize', { levels: 5 }]] },
  { id: 'tv', label: 'تلویزیون قدیمی', ic: '📺', fx: [['scan', { gap: 4, op: 40 }], ['rgb', { amt: 3 }], ['vignette', { amt: 50 }]] },
  { id: 'shake', label: 'لرزش ضربی', ic: '≋', fx: [['shake', { amt: 26 }], ['rgb', { amt: 5 }]] },
  { id: 'speed', label: 'سرعت', ic: '⇶', fx: [['dirBlur', { len: 40 }]] },
  { id: 'water', label: 'زیر آب', ic: '🌊', fx: [['wave', { amp: 10, len: 160, speed: 2 }], ['tint', { color: '#1E90FF', amt: 25 }]] },
  { id: 'mirror4', label: 'کالیدوسکوپ', ic: '❖', fx: [['kaleido', {}]] },
];

/* ── عنصرهای آماده (لایهٔ تازه با یک ضربه) ──────────────────── */
export const ELEMENTS = [
  { id: 'heart', label: 'قلب تپنده', ic: '♥', type: 'shape', data: { kind: 'heart' }, props: { w: 260, h: 240, fill: '#E4142A' },
    fx: [['glow', { r: 20, amt: 80 }]], anim: A('pop', 0.5, 'zoomOut', 0.3, 'heartbeat', 1.1, 120) },
  { id: 'star', label: 'ستارهٔ چرخان', ic: '★', type: 'shape', data: { kind: 'star' }, props: { w: 260, h: 260, fill: '#FFD34D' },
    fx: [['glow', { r: 14, amt: 70, color: '#FFB300' }]], anim: A('spin', 0.6, 'zoomOut', 0.3, 'spin', 0.4, 100) },
  { id: 'ring', label: 'حلقهٔ ضربی', ic: '◯', type: 'shape', data: { kind: 'ring' }, props: { w: 420, h: 420, fill: '#F6F3EC', strokeW: 10 },
    fx: [['glow', { r: 18, amt: 90 }]], anim: A('zoomIn', 0.4, 'fade', 0.3, 'beat', 1, 160) },
  { id: 'neonCircle', label: 'دایرهٔ نئونی', ic: '◎', type: 'shape', data: { kind: 'ellipse', fillOn: false },
    props: { w: 520, h: 520, stroke: '#18C8FF', strokeW: 8 }, fx: [['glow', { r: 26, amt: 220, color: '#18C8FF' }]],
    anim: A('fade', 0.5, 'fade', 0.4, 'breathe', 1, 100) },
  { id: 'underline', label: 'خط کشیده‌شونده', ic: '⎯', type: 'shape', data: { kind: 'line' },
    props: { w: 600, h: 90, fill: '#E4142A' }, keys: { trimE: [[0, 0, 'outCubic'], [0.8, 100]] } },
  { id: 'arrow', label: 'پیکان اشاره', ic: '➜', type: 'shape', data: { kind: 'arrow' }, props: { w: 260, h: 140, fill: '#FFFFFF', rot: 180 },
    anim: A('slideR', 0.4, 'fade', 0.3, 'zigzag', 1.2, 80) },
  { id: 'badge', label: 'نشان ستاره‌ای', ic: '✸', type: 'shape', data: { kind: 'star', grad: 'radial' },
    props: { w: 300, h: 300, fill: '#FFE66D', fill2: '#FF7A00', sides: 12, inner: 78 },
    anim: A('elastic', 0.6, 'zoomOut', 0.3, 'spin', 0.15, 100) },
  { id: 'bar', label: 'نوار پس‌زمینه', ic: '▬', type: 'shape', data: { kind: 'rect' },
    props: { w: 1400, h: 180, fill: '#000000', opacity: 60 }, anim: A('wipeR', 0.5, 'wipeL', 0.4) },
  { id: 'circleEq', label: 'موج صدای دایره‌ای', ic: '✹', type: 'spectrum', data: { mode: 'circle', bars: 64 },
    props: { w: 700, h: 300 }, place: (L) => { L.props.y = { v: 0 }; } },
  { id: 'confetti', label: 'کانفتی', ic: '🎉', type: 'code', code: 'کانفتی', props: { w: 1200, h: 1800 } },
  { id: 'snow', label: 'برف', ic: '❄', type: 'code', code: 'برف', props: { w: 1200, h: 1800 } },
  { id: 'rain', label: 'باران', ic: '☂', type: 'code', code: 'ذرات بارانی', props: { w: 1200, h: 1800 } },
  { id: 'bubbles', label: 'حباب', ic: '◦', type: 'code', code: 'حباب', props: { w: 1200, h: 1800 } },
  { id: 'stars', label: 'آسمان پرستاره', ic: '✦', type: 'code', code: 'ستاره‌های چشمک‌زن', props: { w: 1200, h: 1800 } },
  { id: 'beatRings', label: 'حلقه‌های ضربی', ic: '◎', type: 'code', code: 'حلقه‌های ضربی' },
  { id: 'progress', label: 'نوار پیشرفت', ic: '▰', type: 'code', code: 'نوار پیشرفت', props: { w: 900, h: 60 } },
  /* قطعه‌های شوریل موشن — همه با ضرب آهنگ تکان می‌خورند (کد قابل ویرایش است) */
  { id: 'reelVortex', label: '✦ کهکشان ذرات', ic: '🌀', type: 'code', code: 'شوریل: کهکشان ذرات', props: { w: 1400, h: 1000, c1: '#E4142A', c2: '#18E0FF' } },
  { id: 'reelBurst', label: '✦ انفجار ضربی', ic: '💥', type: 'code', code: 'شوریل: انفجار ضربی', props: { w: 1000, h: 1000, c1: '#E4142A', c2: '#FFD447' } },
  { id: 'reelMorph', label: '✦ دگردیسی شکل‌ها', ic: '◆', type: 'code', code: 'شوریل: دگردیسی شکل‌ها', props: { w: 800, h: 800, c1: '#E4142A', c2: '#F6F3EC' } },
  { id: 'reelWire', label: '✦ بیست‌وجهی سیمی', ic: '⬡', type: 'code', code: 'شوریل: بیست‌وجهی سیمی', props: { w: 800, h: 800, c1: '#18E0FF', c2: '#FF2E97' } },
  { id: 'reelWarp', label: '✦ پرواز در ستاره‌ها', ic: '✧', type: 'code', code: 'شوریل: پرواز در ستاره‌ها', props: { w: 1920, h: 1920, c2: '#FFFFFF' } },
  { id: 'reelGrid', label: '✦ زمین نئونی', ic: '🌅', type: 'code', code: 'شوریل: زمین نئونی', props: { w: 1920, h: 1080, c1: '#FF2E97', c2: '#18E0FF' } },
  { id: 'reelEq', label: '✦ اکولایزر حلقه‌ای', ic: '✹', type: 'code', code: 'شوریل: اکولایزر حلقه‌ای', props: { w: 800, h: 800, c1: '#E4142A', c2: '#F6F3EC' } },
  { id: 'reelSwarmText', label: '✦ نوشتهٔ ذره‌ای', ic: '⁂', type: 'code', code: 'شوریل: نوشتهٔ ذره‌ای', props: { w: 1200, h: 500, c1: '#E4142A', c2: '#F6F3EC' } },
  { id: 'reelSlam', label: '✦ کلمهٔ کوبنده', ic: '💢', type: 'code', code: 'شوریل: کلمهٔ کوبنده', props: { w: 1200, h: 500, c1: '#E4142A', c2: '#F6F3EC' } },
  { id: 'reelWipe', label: '✦ گذار نوارهای رنگی', ic: '▧', type: 'code', code: 'شوریل: گذار نوارهای رنگی', props: { w: 1920, h: 1920, c1: '#E4142A' } },
  { id: 'vignetteAll', label: 'سایهٔ لبهٔ کل تصویر', ic: '◎', type: 'adjust', fx: [['vignette', { amt: 65 }]], noDefaultFx: true },
  { id: 'filmAll', label: 'حس فیلم روی همه', ic: '🎞', type: 'adjust', fx: [['grain', { amt: 25 }], ['vignette', { amt: 40 }], ['color', { contrast: 110, sat: 90 }]], noDefaultFx: true },
];

/* ── اعمال ──────────────────────────────────────────────────── */
function setProps(L, props = {}) {
  for (const [k, v] of Object.entries(props)) if (L.props[k]) L.props[k] = { v };
}

/** سبک متن را روی یک لایهٔ متن می‌گذارد؛ نوشته و جا دست نمی‌خورند */
export function applyTextStyle(L, style, W = 1080, H = 1920) {
  const keep = { str: L.data.str, x: L.props.x, y: L.props.y, size: L.props.size, rot: L.props.rot };
  const base = newLayer('text');
  for (const d of LAYER_TYPES.text.props) L.props[d.key] = base.props[d.key];
  L.props.rot = keep.rot; L.props.size = keep.size;
  L.data = { ...L.data, font: 'black', ...(style.data || {}), str: keep.str };
  setProps(L, style.props);
  L.effects = (style.fx || []).map(([t, v]) => fxWith(t, v));
  if (style.anim) L.anim = JSON.parse(JSON.stringify(style.anim));
  L.props.x = keep.x; L.props.y = keep.y;
  style.place?.(L, W, H);
  L.style = style.id;
  return L;
}

/** ظاهر آماده را به افکت‌های لایه اضافه می‌کند (افکت‌های قبلی می‌مانند) */
export function applyLook(L, look, replace = false) {
  if (replace) L.effects = L.effects.filter(f => !LOOKS.some(lk => lk.fx.some(([t]) => t === f.type)));
  for (const [t, v] of look.fx) L.effects.push(fxWith(t, v));
  return L;
}

/** لایهٔ تازه از روی یک عنصر آماده */
export function buildElement(el, t0, dur, W = 1080, H = 1920) {
  const L = newLayer(el.type, t0, dur);
  L.name = el.label;
  L.data = { ...L.data, ...(el.data || {}) };
  if (el.code) L.data.code = CODE_SNIPPETS[el.code] || '';
  setProps(L, el.props);
  if (el.type === 'code' && el.props?.h > H) L.props.h = { v: H };
  L.effects = (el.fx || []).map(([t, v]) => fxWith(t, v));
  if (el.anim) L.anim = JSON.parse(JSON.stringify(el.anim));
  for (const [k, ks] of Object.entries(el.keys || {})) {
    L.props[k] = { v: ks[ks.length - 1][1], k: ks.map(([t, v, e]) => ({ t: Math.min(t, dur), v, e: e || 'linear' })) };
  }
  el.place?.(L, W, H);
  return L;
}
