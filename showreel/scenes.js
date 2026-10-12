/* ═══════════════════════════════════════════════════════════════
   شوریل موشن‌گرافی ۱۵ ثانیه — صحنه‌ها و موسیقی
   ۱۲۸ ضرب در دقیقه ← هر ضرب ۰٫۴۶۹ ثانیه، هر میزان ۱٫۸۷۵ ثانیه، ۸ میزان.
   همه‌چیز تابع خالص زمان است: render(ctx, t) هر فریم را از صفر می‌سازد.
   ═══════════════════════════════════════════════════════════════ */
const BPM = 128, BEAT = 60 / BPM, BAR = BEAT * 4, DURATION = 15;
const BEATS = Array.from({ length: 33 }, (_, i) => +(i * BEAT).toFixed(5));
const PAL = { ink: '#07070C', red: '#E4142A', cream: '#F6F3EC', cyan: '#18E0FF', yellow: '#FFD447', pink: '#FF2E97', violet: '#7B2FF7' };
const FA = '"IRANSansX Black", Vazirmatn, "Noto Sans Arabic", Tahoma, sans-serif';
const EN = '"Arial Black", "Helvetica Neue", Arial, sans-serif';
const MONO = 'ui-monospace, "SF Mono", Menlo, Consolas, monospace';
const bar = t => Math.floor(t / BAR);
const inBar = (t, b) => t - b * BAR;

function bg(ctx, W, H, col) { ctx.fillStyle = col; ctx.fillRect(0, 0, W, H); }
function txt(ctx, s, x, y, size, col, font = EN, align = 'center', a = 1, ls = 0) {
  if (a <= 0) return;
  ctx.save(); ctx.globalAlpha *= clamp(a); ctx.fillStyle = col; ctx.font = `${font === MONO ? 500 : 900} ${size}px ${font}`;
  ctx.textAlign = align; ctx.textBaseline = 'middle';
  if (ls && 'letterSpacing' in ctx) ctx.letterSpacing = ls + 'px';
  ctx.fillText(s, x, y); ctx.restore();
}

/* ── صحنه‌ها: هرکدام (ctx, env, u) — u زمان داخل صحنه ─────────── */
const SCENES = {
  /* ۰) نقطه‌ای که با هر ضرب بزرگ‌تر می‌شود و روی ضرب چهارم منفجر می‌شود */
  intro(ctx, env, u) {
    const { W, H } = env, sz = Math.min(W, H) / 1080;
    bg(ctx, W, H, PAL.ink);
    const b = Math.floor(u / BEAT), sb = u - b * BEAT;
    if (b < 3) {
      const r = (22 + b * 26) * sz * (1 + 0.6 * Math.exp(-sb * 10));
      ctx.strokeStyle = rgba(PAL.cream, 0.18); ctx.lineWidth = 2 * sz;
      for (let k = 0; k <= b; k++) { ctx.beginPath(); ctx.arc(W / 2, H / 2, (120 + k * 90) * sz + E.out5(sb / 0.4) * 30 * sz, -Math.PI / 2, -Math.PI / 2 + TAU * clamp((u - k * BEAT) / BEAT)); ctx.stroke(); }
      shock(ctx, { ...env, sb }, { c: PAL.red, a: 0.8 });
      ctx.fillStyle = PAL.cream; ctx.beginPath(); ctx.arc(W / 2, H / 2, r, 0, TAU); ctx.fill();
      // متن تایپ‌شونده
      const s = 'NOTION AI — MOTION REEL — 2026', n = Math.floor(clamp(u / (BEAT * 3)) * s.length);
      txt(ctx, s.slice(0, n) + (Math.floor(u * 8) % 2 ? '▌' : ''), W / 2, H * 0.86, 22 * sz, PAL.cream, MONO, 'center', 0.8, 6 * sz);
    } else {
      starfield(ctx, env, { n: 380, speed: 2.2, a: clamp(sb * 4) });
      burst(ctx, { ...env, beats: [BEATS[3]], bi: 0 }, { cx: W / 2, cy: H / 2, n: 120, c1: PAL.red, c2: PAL.yellow, life: 1.1, ring: 1.4 });
      if (sb < 0.12) { ctx.fillStyle = rgba('#FFFFFF', 1 - sb / 0.12); ctx.fillRect(0, 0, W, H); }
    }
  },

  /* ۱) دگردیسی شکل‌ها روی پس‌زمینه‌هایی که با هر ضرب عوض می‌شوند */
  shapes(ctx, env, u) {
    const { W, H } = env, sz = Math.min(W, H) / 1080;
    const b = env.bi, combos = [[PAL.red, PAL.cream, PAL.ink], [PAL.cream, PAL.ink, PAL.red], [PAL.ink, PAL.yellow, PAL.cream], [PAL.yellow, PAL.ink, PAL.red]];
    const [B0, C1, C2] = combos[((b % 4) + 4) % 4];
    bg(ctx, W, H, B0);
    // شبکهٔ نقطه‌ای که از وسط موج برمی‌دارد
    ctx.fillStyle = rgba(C2, 0.25);
    for (let y = 0; y < 9; y++) for (let x = 0; x < 16; x++) {
      const px = (x + 0.5) * W / 16, py = (y + 0.5) * H / 9, d = Math.hypot(px - W / 2, py - H / 2) / W;
      const r = (3 + 5 * Math.max(0, Math.sin(d * 18 - u * 9))) * sz;
      ctx.beginPath(); ctx.arc(px, py, r, 0, TAU); ctx.fill();
    }
    morph(ctx, env, { c1: C1, c2: C2, r: Math.min(W, H) * 0.25 });
    txt(ctx, ['CIRCLE', 'TRIANGLE', 'SQUARE', 'PENTAGON', 'HEXAGON', 'STAR'][((b + 1) % 6 + 6) % 6], W * 0.07, H * 0.9, 26 * sz, C2, MONO, 'left', 0.9, 8 * sz);
    txt(ctx, 'SHAPE / ' + String(b + 1).padStart(2, '0'), W * 0.93, H * 0.1, 26 * sz, C2, MONO, 'right', 0.9, 8 * sz);
  },

  /* ۲) تایپوگرافی کوبنده — هر ضرب یک کلمه */
  type(ctx, env, u) {
    const { W, H } = env, sz = Math.min(W, H) / 1080;
    const words = [['حرکت', false, PAL.red, PAL.cream], ['MOTION', true, PAL.ink, PAL.red], ['ریتم', false, PAL.yellow, PAL.ink], ['DESIGN', true, PAL.cream, PAL.red]];
    const i = clamp(Math.floor(u / BEAT), 0, 3), d = u - i * BEAT;
    const [w, ltr, B0, C] = words[i];
    bg(ctx, W, H, B0);
    // مارکی توخالی پشت (دو ردیف مخالف هم)
    ctx.save(); ctx.strokeStyle = rgba(C, 0.2); ctx.lineWidth = 2 * sz; ctx.font = `900 ${190 * sz}px ${EN}`;
    ctx.textBaseline = 'middle'; ctx.textAlign = 'left'; ctx.direction = 'ltr';
    const M = 'MOTION · DESIGN · RHYTHM · ', mw = ctx.measureText(M).width;
    for (let r = 0; r < 5; r++) {
      const off = (((u + r * 0.37) * (r % 2 ? 420 : -420) * sz) % mw + mw) % mw;
      for (let x = -off; x < W; x += mw) ctx.strokeText(M, x, H * (0.1 + r * 0.2));
    }
    ctx.restore();
    const fg = B0 === PAL.cream || B0 === PAL.yellow ? PAL.ink : PAL.cream;
    slamText(ctx, env, { d, text: w, c: fg, c2: C, font: ltr ? EN : FA, ltr, size: Math.min(W, H) * (ltr ? 0.24 : 0.32), seed: i * 7 });
    txt(ctx, `0${i + 1} / 04`, W * 0.93, H * 0.9, 24 * sz, fg, MONO, 'right', 0.8, 6 * sz);
  },

  /* ۳) سه‌بعدی: پرواز در ستاره‌ها + بیست‌وجهی سیمی */
  wire(ctx, env, u) {
    const { W, H } = env, sz = Math.min(W, H) / 1080;
    const g = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.hypot(W, H) / 2);
    g.addColorStop(0, '#0E1530'); g.addColorStop(1, PAL.ink); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    starfield(ctx, env, { n: 600, speed: 1.4, c: PAL.cyan });
    wire(ctx, env, { c1: PAL.cyan, c2: PAL.pink, r: Math.min(W, H) * (0.22 + 0.04 * E.out3(u / BAR)) });
    // HUD
    ctx.save(); ctx.strokeStyle = rgba(PAL.cyan, 0.6); ctx.lineWidth = 2 * sz;
    const m = 50 * sz, L = 60 * sz;
    for (const [x, y, sx, sy] of [[m, m, 1, 1], [W - m, m, -1, 1], [m, H - m, 1, -1], [W - m, H - m, -1, -1]]) { ctx.beginPath(); ctx.moveTo(x, y + sy * L); ctx.lineTo(x, y); ctx.lineTo(x + sx * L, y); ctx.stroke(); }
    ctx.restore();
    txt(ctx, `ROT X ${(u * 40.1 % 360).toFixed(1)}°  Y ${(u * 51.6 % 360).toFixed(1)}°`, m + 20 * sz, m + 40 * sz, 20 * sz, PAL.cyan, MONO, 'left', 0.85, 3 * sz);
    txt(ctx, '3D / WIREFRAME / ICOSAHEDRON', W - m - 20 * sz, H - m - 40 * sz, 20 * sz, PAL.cyan, MONO, 'right', 0.85, 3 * sz);
  },

  /* ۴) کهکشان ذرات + اکولایزر شعاعی */
  galaxy(ctx, env, u) {
    const { W, H } = env;
    bg(ctx, W, H, '#05030D');
    const hueK = clamp(u / BAR);
    vortex(ctx, env, { n: 1300, c1: mixHex(PAL.red, PAL.pink, hueK), c2: mixHex(PAL.cyan, PAL.violet, hueK), spin: 1.1, tilt: 0.5 + 0.1 * Math.sin(u) });
    eqRing(ctx, env, { r: Math.min(W, H) * 0.14, n: 72, c1: PAL.cream, c2: PAL.red, a: 0.9 });
  },

  /* ۵) زمین شبکه‌ای سینت‌ویو + عنوان دولایه */
  grid(ctx, env, u) {
    const { W, H } = env, sz = Math.min(W, H) / 1080;
    grid3d(ctx, env, { c1: PAL.pink, c2: PAL.cyan, speed: 1.6 });
    const k = E.out5(clamp(u / 0.4));
    ctx.save(); ctx.beginPath(); ctx.rect(0, H * 0.18, W, H * 0.24); ctx.clip();
    txt(ctx, 'RHYTHM', W / 2, H * 0.3 + (1 - k) * H * 0.25, 180 * sz, PAL.cream, EN, 'center', 1, 30 * sz * (1 - k) + 8 * sz);
    ctx.restore();
    txt(ctx, '۱۲۸ ضرب در دقیقه', W / 2, H * 0.13, 44 * sz, PAL.yellow, FA, 'center', clamp((u - 0.35) / 0.3));
  },

  /* ۶) مرور: چهار پنجره که صحنه‌های قبلی را زنده نشان می‌دهند */
  recap(ctx, env, u, t) {
    const { W, H } = env, sz = Math.min(W, H) / 1080;
    bg(ctx, W, H, PAL.ink);
    const list = [['shapes', 1], ['type', 2], ['wire', 3], ['galaxy', 4]];
    const gap = 18 * sz, pw = (W - gap * 3) / 2, ph = (H - gap * 3) / 2;
    const out = clamp((u - BEAT * 3.4) / (BEAT * 0.6));
    list.forEach(([name, bIdx], j) => {
      const k = E.outBack(clamp((u - j * BEAT * 0.5) / (BEAT * 0.8)));
      if (k <= 0) return;
      const col = j % 2, row = j >> 1;
      let x = gap + col * (pw + gap), y = gap + row * (ph + gap);
      const fx = (col ? 1 : -1) * E.in3(out) * W * 0.6, fy = (row ? 1 : -1) * E.in3(out) * H * 0.6;
      const cv = panel(j, Math.round(pw / 2), Math.round(ph / 2));
      const pc = cv.getContext('2d');
      const lt = bIdx * BAR + BAR * 0.5 + ((t * 0.9) % (BAR * 0.5));
      const penv = envFromBeats(BEATS, lt, cv.width, cv.height);
      pc.save(); SCENES[name](pc, penv, lt - bIdx * BAR, lt); pc.restore();
      ctx.save();
      ctx.translate(x + pw / 2 + fx, y + ph / 2 + fy); ctx.scale(k, k); ctx.rotate((1 - k) * (j % 2 ? 0.2 : -0.2));
      ctx.drawImage(cv, -pw / 2, -ph / 2, pw, ph);
      ctx.strokeStyle = PAL.cream; ctx.lineWidth = 3 * sz; ctx.strokeRect(-pw / 2, -ph / 2, pw, ph);
      txt(ctx, ['SHAPES', 'TYPE', '3D', 'PARTICLES'][j], -pw / 2 + 20 * sz, -ph / 2 + 30 * sz, 20 * sz, PAL.cream, MONO, 'left', 0.9, 5 * sz);
      ctx.restore();
    });
    if (out > 0.6) { ctx.fillStyle = rgba('#FFFFFF', (out - 0.6) / 0.4); ctx.fillRect(0, 0, W, H); }
  },

  /* ۷) پایان: ذره‌ها جمع می‌شوند و امضا را می‌سازند */
  outro(ctx, env, u) {
    const { W, H } = env, sz = Math.min(W, H) / 1080;
    const g = ctx.createRadialGradient(W / 2, H * 0.45, 0, W / 2, H * 0.45, Math.hypot(W, H) * 0.6);
    g.addColorStop(0, '#1A0710'); g.addColorStop(1, PAL.ink); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    vortex(ctx, env, { n: 500, a: 0.35 * (1 - clamp(u / 1.2)), c1: PAL.red, c2: PAL.cyan });
    const k = E.io3(clamp((u - 0.1) / 1.1));
    swarmText(ctx, env, { text: 'MOTION REEL', font: EN, k, n: 1800, w: W * 0.78, cy: H * 0.44, c1: PAL.cream, c2: PAL.red });
    burst(ctx, { ...env }, { cx: W / 2, cy: H * 0.44, n: 90, c1: PAL.red, c2: PAL.yellow, every: 2 });
    const sa = clamp((u - 1.15) / 0.35);
    ctx.fillStyle = rgba(PAL.red, sa); ctx.fillRect(W / 2 - 220 * sz * E.out3(sa), H * 0.6, 440 * sz * E.out3(sa), 5 * sz);
    txt(ctx, 'طراحی و کد: Notion AI', W / 2, H * 0.67, 46 * sz, PAL.cream, FA, 'center', sa);
    txt(ctx, 'CANVAS · JS · ۱۵ ثانیه · ۱۲۸ BPM', W / 2, H * 0.74, 22 * sz, PAL.cream, MONO, 'center', sa * 0.7, 6 * sz);
  },
};
const _panels = [];
function panel(j, w, h) {
  let c = _panels[j];
  if (!c) { c = _panels[j] = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), { width: w, height: h }); }
  if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
  return c;
}

const ORDER = ['intro', 'shapes', 'type', 'wire', 'galaxy', 'grid', 'recap', 'outro'];

/** یک فریم کامل */
function render(ctx, t, W = 1920, H = 1080) {
  t = clamp(t, 0, DURATION - 1e-4);
  const env = envFromBeats(BEATS, t, W, H);
  const b = Math.min(7, bar(t)), u = inBar(t, b), sz = Math.min(W, H) / 1080;
  // دوربین: لرزش و زوم ریز روی ضرب (به‌جز مرور)
  ctx.save();
  if (b !== 6) {
    const s = 1 + 0.025 * env.pulse;
    const sx = Math.sin(t * 91) * 9 * sz * env.pulse, sy = Math.cos(t * 77) * 7 * sz * env.pulse;
    ctx.translate(W / 2 + sx, H / 2 + sy); ctx.scale(s, s); ctx.translate(-W / 2, -H / 2);
  }
  SCENES[ORDER[b]](ctx, env, u, t);
  ctx.restore();

  /* گذارها — هر برش یک جور */
  const cut = t - b * BAR;                         // زمان از شروع میزان
  const left = BAR - cut;                          // تا میزان بعد
  if (b === 1 && cut < 0.35) {                     // دریچهٔ دایره‌ای از دل نقطه
    ctx.save(); ctx.globalCompositeOperation = 'destination-in';
    ctx.beginPath(); ctx.arc(W / 2, H / 2, E.out5(cut / 0.35) * Math.hypot(W, H) * 0.6 + 1, 0, TAU); ctx.fill(); ctx.restore();
    ctx.save(); ctx.globalCompositeOperation = 'destination-over'; ctx.fillStyle = PAL.ink; ctx.fillRect(0, 0, W, H); ctx.restore();
  }
  if ((b === 1 && left < 0.25) || (b === 2 && cut < 0.25)) wipe(ctx, W, H, b === 1 ? (0.25 - left) / 0.5 : 0.5 + cut / 0.5);
  if (b === 3 && cut < 0.3) glitch(ctx, W, H, 1 - cut / 0.3, Math.floor(t * 30));
  if ((b === 3 && left < 0.2) || (b === 4 && cut < 0.25)) {   // زوم به درون + فلاش
    const k = b === 3 ? 1 - left / 0.2 : 1 - cut / 0.25;
    ctx.fillStyle = rgba('#FFFFFF', k * 0.9); ctx.fillRect(0, 0, W, H);
  }
  if ((b === 4 && left < 0.25) || (b === 5 && cut < 0.25)) wipe(ctx, W, H, b === 4 ? (0.25 - left) / 0.5 : 0.5 + cut / 0.5, { cols: [PAL.pink, PAL.cyan, PAL.yellow, '#05010F'], ang: 0.4 });
  if (b === 6 && cut < 0.2) glitch(ctx, W, H, 1 - cut / 0.2, Math.floor(t * 30) + 3);
  if (b === 7 && cut < 0.18) { ctx.fillStyle = rgba('#FFFFFF', 1 - cut / 0.18); ctx.fillRect(0, 0, W, H); }

  /* پرداخت نهایی: ویگنت، دانه، نوار زمان */
  const v = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.hypot(W, H) * 0.6);
  v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.45)'); ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
  const f = Math.floor(t * 30);
  ctx.fillStyle = 'rgba(255,255,255,0.035)';
  for (let i = 0; i < 260; i++) ctx.fillRect(hash(f * 7 + i) * W, hash(f * 3 + i * 1.7) * H, 2 * sz, 2 * sz);
  const tc = `${String(Math.floor(t)).padStart(2, '0')}:${String(Math.floor((t % 1) * 30)).padStart(2, '0')}`;
  txt(ctx, tc + `  ·  BEAT ${String(Math.max(0, env.bi) + 1).padStart(2, '0')}/32`, W * 0.035, H * 0.045, 16 * sz, '#FFFFFF', MONO, 'left', 0.55, 3 * sz);
  ctx.fillStyle = rgba(PAL.red, 0.9); ctx.fillRect(0, H - 4 * sz, W * (t / DURATION), 4 * sz);
  if (t > DURATION - 0.35) { ctx.fillStyle = rgba('#000000', (t - (DURATION - 0.35)) / 0.35); ctx.fillRect(0, 0, W, H); }
}

/* ═══ موسیقی: با WebAudio ساخته می‌شود (بدون فایل) ═══════════════ */
async function synthTrack(sr = 44100) {
  const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  const ac = new OAC(2, Math.ceil(sr * DURATION), sr);
  const master = ac.createDynamicsCompressor(); master.threshold.value = -14; master.ratio.value = 4; master.connect(ac.destination);
  const out = ac.createGain(); out.gain.value = 0.75; out.connect(master);
  const noiseBuf = ac.createBuffer(1, sr * 2, sr); { const d = noiseBuf.getChannelData(0); let s = 7; for (let i = 0; i < d.length; i++) { s = (s * 16807) % 2147483647; d[i] = s / 1073741823.5 - 1; } }
  const duck = ac.createGain(); duck.connect(out);           // سایدچین برای پد و بیس
  const env = (g, t, a, peak, d, end = 0.0001) => { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(end, t + a + d); };
  const kick = (t, amp = 1) => {
    const o = ac.createOscillator(), g = ac.createGain(); o.connect(g); g.connect(out);
    o.frequency.setValueAtTime(160, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    env(g, t, 0.003, 0.95 * amp, 0.38); o.start(t); o.stop(t + 0.45);
    duck.gain.setValueAtTime(0.25, t); duck.gain.linearRampToValueAtTime(1, t + 0.32);
  };
  const noise = (t, dur, type, f, q, amp, a = 0.002) => {
    const s = ac.createBufferSource(); s.buffer = noiseBuf; const fl = ac.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q;
    const g = ac.createGain(); s.connect(fl); fl.connect(g); g.connect(out); env(g, t, a, amp, dur); s.start(t, (t * 0.37) % 1); s.stop(t + a + dur + 0.05);
    return fl;
  };
  const clap = t => { noise(t, 0.16, 'bandpass', 1600, 0.9, 0.55); noise(t + 0.012, 0.12, 'bandpass', 1200, 0.9, 0.35); };
  const hat = (t, amp = 0.16) => noise(t, 0.035, 'highpass', 8000, 0.7, amp);
  const tone = (t, f, dur, type, amp, cut, dest = duck) => {
    const o = ac.createOscillator(), o2 = ac.createOscillator(), fl = ac.createBiquadFilter(), g = ac.createGain();
    o.type = o2.type = type; o.frequency.value = f; o2.frequency.value = f * 1.006; fl.type = 'lowpass'; fl.frequency.value = cut; fl.Q.value = 4;
    o.connect(fl); o2.connect(fl); fl.connect(g); g.connect(dest);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(amp, t + 0.01); g.gain.setValueAtTime(amp, t + dur * 0.7); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.start(t); o2.start(t); o.stop(t + dur + 0.02); o2.stop(t + dur + 0.02);
    return fl;
  };
  const N = n => 440 * Math.pow(2, (n - 69) / 12);
  const roots = [45, 41, 48, 43];                        // A1 F1 C2 G1
  const chords = [[57, 60, 64], [53, 57, 60], [55, 60, 64], [55, 59, 62]];
  // میزان ۰: تیک و سوئل؛ ضرب ۴ انفجار
  for (let i = 0; i < 3; i++) { noise(BEATS[i], 0.05, 'highpass', 5000, 1, 0.3); tone(BEATS[i], N(81 + i * 2), 0.18, 'sine', 0.18, 6000, out); }
  { const o = ac.createOscillator(), g = ac.createGain(); o.frequency.setValueAtTime(40, 0); o.frequency.exponentialRampToValueAtTime(90, BEATS[3]); o.connect(g); g.connect(out); g.gain.setValueAtTime(0.0001, 0); g.gain.exponentialRampToValueAtTime(0.4, BEATS[3]); g.gain.exponentialRampToValueAtTime(0.0001, BEATS[3] + 0.05); o.start(0); o.stop(BEATS[3] + 0.1); }
  const impact = (t, amp = 1) => { kick(t, 1.1 * amp); noise(t, 1.6, 'highpass', 3000, 0.5, 0.45 * amp, 0.004); noise(t, 0.5, 'lowpass', 400, 0.7, 0.6 * amp); };
  impact(BEATS[3]);
  for (let b = 4; b < 32; b++) {
    const t = BEATS[b], br = Math.floor(b / 4), pb = b % 4;
    const riser = br === 6 && pb >= 2;
    if (!riser) kick(t);
    if (br >= 1 && (pb === 1 || pb === 3) && !riser) clap(t);
    if (br >= 2) { hat(t + BEAT / 2, 0.2); if (br >= 4 && br !== 7) { hat(t + BEAT / 4, 0.09); hat(t + BEAT * 0.75, 0.09); } }
    if (br >= 1 && !riser) { const r = roots[br % 4]; for (const off of [0.5, 0.75]) { const fl = tone(t + BEAT * off, N(r + (off === 0.75 ? 12 : 0)), BEAT * 0.22, 'sawtooth', 0.22, 700); fl.frequency.setValueAtTime(1600, t + BEAT * off); fl.frequency.exponentialRampToValueAtTime(300, t + BEAT * (off + 0.2)); } }
    if (br >= 3 && pb === 0 && br !== 7) for (const n of chords[br % 4]) tone(t, N(n), BAR * 0.98, 'sawtooth', 0.045, 1400 + br * 200);
    if (br >= 2 && br < 7 && b % 2 === 0) tone(t + BEAT * 0.25, N([69, 72, 76, 79][(b >> 1) % 4] + 12), 0.12, 'square', 0.035, 3000);
  }
  // رایزر میزان ۶ → ضربهٔ پایانی
  { const t0 = 6 * BAR, t1 = 7 * BAR; const fl = noise(t0, t1 - t0, 'bandpass', 400, 2, 0.35, (t1 - t0) * 0.95); fl.frequency.setValueAtTime(400, t0); fl.frequency.exponentialRampToValueAtTime(9000, t1);
    const o = ac.createOscillator(), g = ac.createGain(); o.type = 'sawtooth'; o.frequency.setValueAtTime(110, t0); o.frequency.exponentialRampToValueAtTime(880, t1); o.connect(g); g.connect(out);
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.08, t1 - 0.02); g.gain.linearRampToValueAtTime(0, t1); o.start(t0); o.stop(t1);
    for (let i = 0; i < 8; i++) clap(t0 + BAR * 0.5 + i * BEAT / 4); }
  impact(7 * BAR, 1.2);
  for (const n of [57, 60, 64, 69]) tone(7 * BAR, N(n), 1.9, 'sawtooth', 0.05, 2200, out);
  impact(BEATS[31], 1.1);
  for (const n of [45, 57, 64, 69, 72]) tone(BEATS[31], N(n), 0.5, 'triangle', 0.08, 3000, out);
  return ac.startRendering();
}
/** AudioBuffer → فایل WAV (برای ذخیره یا خروجی) */
function wavBytes(buf) {
  const ch = buf.numberOfChannels, n = buf.length, sr = buf.sampleRate, out = new DataView(new ArrayBuffer(44 + n * ch * 2));
  const w = (o, s) => [...s].forEach((c, i) => out.setUint8(o + i, c.charCodeAt(0)));
  w(0, 'RIFF'); out.setUint32(4, 36 + n * ch * 2, true); w(8, 'WAVEfmt '); out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, ch, true);
  out.setUint32(24, sr, true); out.setUint32(28, sr * ch * 2, true); out.setUint16(32, ch * 2, true); out.setUint16(34, 16, true); w(36, 'data'); out.setUint32(40, n * ch * 2, true);
  const data = [...Array(ch)].map((_, c) => buf.getChannelData(c));
  let o = 44; for (let i = 0; i < n; i++) for (let c = 0; c < ch; c++) { out.setInt16(o, Math.max(-1, Math.min(1, data[c][i])) * 0x7fff, true); o += 2; }
  return new Uint8Array(out.buffer);
}
