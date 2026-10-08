import { W, H, C, SONG, NAME_FA, TG } from './song.js';
import { rgba, clamp, hash2 } from './core.js';
import { line, textFa, textMono } from './draw.js';
import { font, FONTS, faTime } from './text.js';

/**
 * میدان ذرات واکنش‌گر به ضرب — ترجمهٔ وفادار particles/_p_pos
 *
 * ۱۵۰۰ ذره که هرکدام یک «خانهٔ» ثابت روی صفحه دارند. روی هر ضرب
 * از مرکز به بیرون هل داده می‌شوند و همزمان حول مرکز می‌چرخند.
 * هر ذره به‌صورت یک خط کوتاه بین جای ۳۰ میلی‌ثانیه پیش و الان
 * کشیده می‌شود — همین است که حس سرعت می‌دهد، نه نقطهٔ ساده.
 */
const PN = 1500;

// مولد تصادفی با بذر ثابت، معادل np.random.default_rng(17)
function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const R = mulberry(17);
const HOMEX = new Float32Array(PN), HOMEY = new Float32Array(PN);
const PH = new Float32Array(PN), SP = new Float32Array(PN), CL = new Float32Array(PN);
const DIRX = new Float32Array(PN), DIRY = new Float32Array(PN);
const TANX = new Float32Array(PN), TANY = new Float32Array(PN);
const SGN = new Float32Array(PN);

for (let i = 0; i < PN; i++) {
  HOMEX[i] = R() * W;
  HOMEY[i] = R() * H;
}
for (let i = 0; i < PN; i++) PH[i] = R() * 6.2832;
for (let i = 0; i < PN; i++) SP[i] = 0.45 + R() * 1.25;
for (let i = 0; i < PN; i++) CL[i] = R();
for (let i = 0; i < PN; i++) {
  const dx = HOMEX[i] - W / 2, dy = HOMEY[i] - H / 2;
  const n = Math.hypot(dx, dy) + 1e-6;
  DIRX[i] = dx / n; DIRY[i] = dy / n;
  TANX[i] = -DIRY[i]; TANY[i] = DIRX[i];
}
for (let i = 0; i < PN; i++) SGN[i] = R() > 0.5 ? 1 : -1;

const _px = new Float32Array(PN), _py = new Float32Array(PN);

function pPos(song, t, amp, swirl, n, outX, outY) {
  const push = song.beatPush(t);
  for (let i = 0; i < n; i++) {
    const dx = Math.sin(HOMEY[i] * 0.0042 + t * 0.75 + PH[i]) * 30 * SP[i] * swirl;
    const dy = Math.cos(HOMEX[i] * 0.0036 + t * 0.62 + PH[i]) * 26 * SP[i] * swirl;
    const breathe = Math.sin(t * 0.35 + PH[i] * 0.3) * 18;
    const r = push * amp * (0.35 + 0.55 * SP[i]);
    const tan = (push * amp * 0.85 + 26) * SGN[i] * (0.5 + 0.8 * SP[i]);
    const orbit = t * 0.22 * SGN[i] * SP[i];
    const ca = Math.cos(orbit), sa = Math.sin(orbit);
    const ox = DIRX[i] * ca - DIRY[i] * sa;
    const oy = DIRX[i] * sa + DIRY[i] * ca;
    outX[i] = HOMEX[i] + dx + ox * (r + breathe) + TANX[i] * tan;
    outY[i] = HOMEY[i] + dy + oy * (r + breathe) + TANY[i] * tan;
  }
}

const _qx = new Float32Array(PN), _qy = new Float32Array(PN);

export function particles(ctx, song, t, acc, kick,
                          { amp = 170, alpha = 1, n = PN, swirl = 1 } = {}) {
  n = Math.min(n | 0, PN);
  pPos(song, t - 0.030, amp, swirl, n, _px, _py);
  pPos(song, t, amp, swirl, n, _qx, _qy);

  const groups = [
    [0,    0.62, C.BONE, 2.3, 0.55],
    [0.62, 0.88, C.BONE, 3.2, 0.85],
    [0.88, 1.01, acc,    3.8, 1.00],
  ];
  for (const [lo, hi, col, lw, a] of groups) {
    const al = Math.min(1, a * alpha * (0.45 + 0.55 * kick + 0.25));
    if (al <= 0.01) continue;
    ctx.strokeStyle = rgba(col, al);
    ctx.lineWidth = lw;
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      if (CL[i] < lo || CL[i] >= hi) continue;
      ctx.moveTo(_px[i], _py[i]);
      ctx.lineTo(_qx[i], _qy[i]);
    }
    ctx.stroke();
  }
}

/* ── اثاثیهٔ ثابت قاب ─────────────────────────────────────────── */

export function furniture(ctx, song, t, acc, light = false) {
  const m = 62;
  const c = light ? C.BG : C.BONE;

  // براکت گوشه‌ها
  for (const [px, py, sx, sy] of [[m, m, 1, 1], [W - m, m, -1, 1],
                                  [m, H - m, 1, -1], [W - m, H - m, -1, -1]]) {
    line(ctx, px, py, px + 24 * sx, py, c, 2.4, 0.5);
    line(ctx, px, py, px, py + 24 * sy, c, 2.4, 0.5);
  }

  textFa(ctx, song?.artist || NAME_FA, W - m - 12, m + 52, 30, c, 0.75, FONTS.bold, 'right', 'cap');
  textMono(ctx, song?.tg ?? TG, m + 12, H - m - 30, 22, acc, 0.95, 4, 'left');
  textFa(ctx, faTime(t), m + 12, m + 54, 28, c, 0.55, FONTS.bold, 'left', 'cap');

  // نوار پیشرفت — راست‌به‌چپ
  const p = clamp(t / (song?.duration || SONG));
  line(ctx, m + 12, H - m, W - m - 12, H - m, c, 3, 0.16);
  line(ctx, W - m - 12, H - m, W - m - 12 - (W - 2 * m - 24) * p, H - m, acc, 5, 1.0);
}

/* ── پس‌زمینه‌های متحرک ───────────────────────────────────────── */

/** سطرهای متن شعر که آرام در پس‌زمینه می‌لغزند */
export function bgText(ctx, song, t, acc, kick, rows = 9, alpha = 0.05) {
  const li = song.activeLine(t);
  if (li < 0) return;
  const txt = song.lines[li].words.map(w => w.text).join(' ') + '  ·  ';
  ctx.save();
  ctx.direction = 'rtl';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.font = font(30, FONTS.bold);
  const wdt = ctx.measureText(txt).width;
  if (wdt < 10) { ctx.restore(); return; }
  ctx.fillStyle = rgba(C.BONE, alpha + 0.025 * kick);
  for (let r = 0; r < rows; r++) {
    const y = 70 + (r * (H - 140)) / (rows - 1);
    const d = r % 2 === 0 ? 1 : -1;
    const off = ((t * 44 * d) % wdt + wdt) % wdt;
    for (let c = -1; c < W / wdt + 2; c++) ctx.fillText(txt, c * wdt + off, y);
  }
  ctx.restore();
}

/** ستون‌های عمودی که یکی‌یکی با ضرب روشن می‌شوند */
export function beatGrid(ctx, song, t, kick, n = 10) {
  const bi = song.beatI(t);
  for (let i = 0; i <= n; i++) {
    const x = 100 + ((W - 200) * i) / n;
    const on = bi % n === i;
    line(ctx, x, H * 0.115, x, H * 0.885, C.BONE, 1.2,
         0.05 + (on ? 0.28 : 0) * (0.3 + 0.7 * kick));
  }
}
