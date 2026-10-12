/**
 * نمونه‌های موشن‌اسکریپت — در پنجرهٔ «📜 موشن‌اسکریپت» باز می‌شوند.
 * (اسکریپت‌ها رشته‌اند؛ برنامه اجرایشان می‌کند و لایه می‌سازد.)
 */
export const SAMPLE_SCRIPTS = {
  'شوریل موشن ۱۵ ثانیه': `// ═══ شوریل موشن ۱۵ ثانیه — نسخهٔ موشن‌اسکریپت ═══
// ۸ صحنه × یک میزان (۱٫۸۷۵ ثانیه در ۱۲۸ ضرب). هر خط یک لایه می‌شود؛
// بعد از «اجرا»، همه را در زبانهٔ لایه‌ها دستی عوض یا «تعویض» کنید.
// بهترین نتیجه: روی پروژهٔ نمونهٔ «شوریل موشن» (آهنگ ۱۲۸ ضرب).
tempo(128)
const PAL = { ink: '#07070C', red: '#E4142A', cream: '#F6F3EC', cyan: '#18E0FF',
              yellow: '#FFD447', pink: '#FF2E97', violet: '#7B2FF7' }
const S = Math.min(W, H) / 1080          // مقیاس: همه‌چیز با اندازهٔ قاب
const wide = W >= H                      // افقی یا عمودی؟

// ۱) نقطه‌ای که با هر ضرب بزرگ می‌شود و روی ضرب چهارم منفجر می‌شود
scene('شروع', bars(1),
  bg(PAL.ink),
  shock({ c: PAL.red, to: beats(3) }),
  shape('ellipse', { w: 60 * S, h: 60 * S, fill: PAL.cream, to: beats(3), loop: ['beat', 1, 250],
    keys: { sc: [[0, 0.5, 'hold'], [beats(1), 1.3, 'hold'], [beats(2), 2.1, 'hold']] } }),
  text('NOTION AI — MOTION REEL — 2026', { font: 'mono', size: 22 * S, color: PAL.cream, opacity: 0.8,
    y: H * 0.36, spacing: 6, to: beats(3), enter: ['typewriter', beats(3)] }),
  starfield({ c: PAL.cream, n: 380, speed: 2.2, from: beats(3) }),
  burst({ c1: PAL.red, c2: PAL.yellow, n: 120, life: 1.1, ring: 1.4, from: beats(3) - 0.02 }),
  flash({ from: beats(3), dur: 0.12 }))

transition('iris', { c1: PAL.ink, dur: 0.35, align: 'after' })

// ۲) دگردیسی شکل‌ها؛ رنگ زمینه با هر ضرب عوض می‌شود
const flip = (...c) => c.map((v, i) => [beats(i), v, 'hold'])
scene('شکل‌ها', bars(1),
  bg(PAL.red, { keys: { fill: flip(PAL.red, PAL.cream, PAL.ink, PAL.yellow) } }),
  dotGrid({ c1: PAL.ink, op: 0.25, keys: { c1: flip(PAL.ink, PAL.red, PAL.cream, PAL.red) } }),
  morph({ c1: PAL.cream, c2: PAL.ink, r: 0.28,
    keys: { c1: flip(PAL.cream, PAL.ink, PAL.yellow, PAL.ink), c2: flip(PAL.ink, PAL.red, PAL.cream, PAL.red) } }),
  text('SHAPE / MORPH', { font: 'mono', size: 26 * S, color: PAL.ink, spacing: 8, x: W * 0.3, y: -H * 0.4 }))

transition('wipe')

// ۳) تایپوگرافی کوبنده — هر ضرب یک کلمه
const words = [['حرکت', 'fa', PAL.red, PAL.cream, PAL.ink], ['MOTION', 'en', PAL.ink, PAL.cream, PAL.red],
               ['ریتم', 'fa', PAL.yellow, PAL.ink, PAL.red], ['DESIGN', 'en', PAL.cream, PAL.ink, PAL.red]]
scene('تایپ', bars(1),
  bg(PAL.red, { keys: { fill: flip(...words.map(w => w[2])) } }),
  marquee({ c1: PAL.cream, op: 0.18 }),
  ...words.map(([w, font, , c, c2], i) => slamText({ text: w, font, c, c2, from: beats(i), dur: beats(1),
    size: font === 'fa' ? 0.8 : (wide ? 0.62 : 0.42) })),
  text('TYPE / 04', { font: 'mono', size: 24 * S, color: PAL.cream, spacing: 6, x: W * 0.36, y: H * 0.4, opacity: 0.8 }))

transition('glitch', { dur: 0.3, align: 'after' })

// ۴) سه‌بعدی: پرواز در ستاره‌ها + بیست‌وجهی سیمی + قاب HUD
scene('سه‌بعدی', bars(1),
  bg(['#0E1530', PAL.ink]),
  starfield({ c: PAL.cyan, n: 600, speed: 1.4 }),
  wire({ c1: PAL.cyan, c2: PAL.pink, r: 0.26, keys: { sc: [[0, 0.85], [bars(1), 1.1]] } }),
  hud({ c1: PAL.cyan, tl: 'ROT X {rx}°  Y {ry}°', br: '3D / WIREFRAME / ICOSAHEDRON' }))

transition('flash', { mode: 'peak', amt: 0.9, dur: 0.45 })

// ۵) کهکشان ذرات + اکولایزر حلقه‌ای؛ رنگ‌ها آرام عوض می‌شوند
scene('کهکشان', bars(1),
  bg('#05030D'),
  vortex({ n: 1300, spin: 1.1, tilt: 0.5,
    keys: { c1: [[0, PAL.red], [bars(1), PAL.pink]], c2: [[0, PAL.cyan], [bars(1), PAL.violet]] } }),
  eqRing({ n: 72, c1: PAL.cream, c2: PAL.red, r: 0.14, opacity: 0.9 }))

transition('wipe', { c1: PAL.pink, c2: PAL.cyan, c3: PAL.yellow, c4: '#05010F', ang: 0.4 })

// ۶) زمین نئونی سینت‌ویو + عنوان
scene('زمین نئونی', bars(1),
  grid3d({ c1: PAL.pink, c2: PAL.cyan, speed: 1.6 }),
  text('RHYTHM', { size: 180 * S, color: PAL.cream, spacing: 8, y: -H * 0.2, enter: ['wipeU', 0.4], fx: [['glow', { r: 24, amt: 90, color: PAL.pink }]] }),
  text('۱۲۸ ضرب در دقیقه', { size: 44 * S, color: PAL.yellow, y: -H * 0.37, from: 0.35, enter: ['fade', 0.3] }))

transition('glitch', { dur: 0.2, align: 'after' })

// ۷) مرور: چهار پنجره که المان‌های قبلی را زنده نشان می‌دهند
const g = 18 * S, pw = (W - g * 3) / 2, ph = (H - g * 3) / 2
const cell = k => ({ x: (k % 2 ? 1 : -1) * (pw + g) / 2, y: (k < 2 ? -1 : 1) * (ph + g) / 2, w: pw, h: ph,
                     from: beats(k * 0.5), enter: ['pop', 0.45], exit: ['zoomIn', beats(0.6)] })
scene('مرور', bars(1),
  bg(PAL.ink),
  ...[0, 1, 2, 3].map(k => shape('rect', { ...cell(k), fill: '#0B0B12', stroke: PAL.cream, strokeW: 3 * S })),
  morph({ ...cell(0), c1: PAL.red, c2: PAL.cream, r: 0.3 }),
  slamText({ ...cell(1), text: 'TYPE', font: 'en', size: 0.4, c: PAL.cream, c2: PAL.red }),
  wire({ ...cell(2), c1: PAL.cyan, c2: PAL.pink, r: 0.3 }),
  vortex({ ...cell(3), n: 500, c1: PAL.red, c2: PAL.cyan }),
  ...['SHAPES', 'TYPE', '3D', 'PARTICLES'].map((s, k) => text(s, { font: 'mono', size: 20 * S, color: PAL.cream,
    x: cell(k).x - pw / 2 + 80 * S, y: cell(k).y - ph / 2 + 30 * S, from: beats(k * 0.5 + 0.3), enter: ['fade', 0.2], exit: ['fade', 0.2] })),
  flash({ mode: 'in', from: beats(3.4), dur: beats(0.6) }))

transition('flash', { dur: 0.18, align: 'after' })

// ۸) امضا: ذره‌ها جمع می‌شوند و نام را می‌سازند
scene('امضا', bars(1),
  bg(['#1A0710', PAL.ink]),
  vortex({ n: 500, c1: PAL.red, c2: PAL.cyan, opacity: 0.35, dur: 1.2, exit: ['fade', 1] }),
  swarmText({ text: 'MOTION REEL', font: 'en', assemble: 1.2, n: 1800, c1: PAL.cream, c2: PAL.red, y: -H * 0.06 }),
  burst({ c1: PAL.red, c2: PAL.yellow, n: 90, every: 2, y: -H * 0.06 }),
  shape('rect', { w: 440 * S, h: 5 * S, fill: PAL.red, y: H * 0.1, from: 1.15, enter: ['wipeR', 0.35] }),
  text('طراحی و کد: Notion AI', { size: 46 * S, color: PAL.cream, y: H * 0.17, from: 1.15, enter: ['riseBlur', 0.35] }),
  text('CANVAS · JS · 15s · 128 BPM', { font: 'mono', size: 22 * S, color: PAL.cream, opacity: 0.7, spacing: 6,
    y: H * 0.24, from: 1.15, enter: ['fade', 0.35] }),
  flash({ c1: '#000000', mode: 'in', from: bars(1) - 0.35, dur: 0.35 }))

// پرداخت نهایی، روی همهٔ صحنه‌ها: ویگنت + دانهٔ فیلم + تایم‌کد و نوار پیشرفت
overlay(
  adjust({ name: 'ویگنت و دانه', fx: [['vignette', { amt: 45 }], ['grain', { amt: 12 }]] }),
  code(function (ctx, e) {
    const s = e.min(e.w, e.h) / 1080, f = Math.floor(e.time * 30);
    ctx.fillStyle = e.c1;                                        // نوار پیشرفت
    ctx.fillRect(-e.w / 2, e.h / 2 - 4 * s, e.w * e.p, 4 * s);
    ctx.globalAlpha = 0.55; ctx.fillStyle = '#FFFFFF';           // تایم‌کد
    ctx.font = (16 * s) + 'px ui-monospace, Menlo, monospace'; ctx.direction = 'ltr'; ctx.textAlign = 'left';
    const tc = String(Math.floor(e.time)).padStart(2, '0') + ':' + String(f % 30).padStart(2, '0');
    ctx.fillText(tc + '  ·  BEAT ' + String(e.beat + 1).padStart(2, '0'), -e.w / 2 + e.w * 0.035, -e.h / 2 + e.h * 0.05);
  }, { name: 'تایم‌کد و نوار پیشرفت', c1: PAL.red }))
`,

  'ساده: سه صحنه برای شروع': `// یک اسکریپت کوتاه برای یاد گرفتن — عددها را عوض کنید و «اجرا» بزنید
tempo(120)

scene('سلام', bars(1),
  bg(['#1B0B3A', '#05020D']),
  starfield({ c: '#FFFFFF', n: 300 }),
  text('سلام', { size: 220, color: '#FFD447', enter: ['pop', 0.5], loop: 'beat' }))

transition('wipe')

scene('ذرات', bars(2),
  bg('#05030D'),
  vortex({ c1: '#FF2E97', c2: '#18E0FF' }),
  slamText({ text: 'ریتم', from: beats(2), dur: beats(2) }))

transition('flash', { dur: 0.3 })

scene('پایان', bars(1),
  bg('#07070C'),
  swarmText({ text: 'END', c1: '#F6F3EC', c2: '#E4142A' }),
  burst({ every: 2 }))
`,
};
