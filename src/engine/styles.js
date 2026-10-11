import { W, H, C, TITLE_FA, NAME_FA, TG, outExpo, S } from './song.js';

const T = s => s?.title || TITLE_FA;
const N = s => s?.artist || NAME_FA;
const G = s => (s?.tg ?? TG);
import { clamp } from './core.js';
import { rect, line, ring, textFa, textMono, outlineTextFa, wordDraw } from './draw.js';
import { fitFa, place } from './layout.js';
import { particles } from './field.js';
import { FONTS } from './text.js';
import { applyOverrides } from './overrides.js';

/**
 * پنج سبک بخشِ بی‌کلام + تیتراژ و کارت پایان
 * ترجمهٔ وفادار s_intro / s_inst_a / s_inst_b / s_inst_c / s_mirror / s_end
 *
 * هر تابع آخرین ورودی‌اش «بخش» است: [شروع، پایان، سبک، رنگ].
 * قبلاً زمان‌ها عدد ثابت آهنگ نمونه بودند (مثلاً ۱۲۹ و ۲۰۷٫۴)؛ پس
 * اگر همین سبک را روی آهنگ دیگری یا جای دیگری می‌گذاشتید، انیمیشن
 * یا اصلاً شروع نمی‌شد یا از وسط شروع می‌شد. حالا همه نسبت به شروع
 * و طول خود بخش‌اند و برای آهنگ نمونه دقیقاً همان نتیجه را می‌دهند.
 */
const t0Of = (sec, t) => (sec ? sec[0] : 0);
const lenOf = (sec, fallback) => (sec ? Math.max(0.5, sec[1] - sec[0]) : fallback);

/** تیتراژ: عنوان تورفته که بزرگ می‌شود، با سه حلقهٔ نفس‌کش */
export function sIntro(ctx, song, t, acc, kick, sec) {
  t -= t0Of(sec, t);
  const k = clamp(t / 3.0);
  const sz = fitFa(ctx, T(song), (300 + 420 * outExpo(clamp(t / 6.0))) * S());
  outlineTextFa(ctx, T(song), W / 2, H * 0.46, sz, C.BONE, 0.20 + 0.45 * k, FONTS.black, 5 * S());

  if (t > 4.2) {
    const a = clamp((t - 4.2) / 1.2);
    textFa(ctx, N(song), W / 2, H * 0.72, 62 * S(), C.BONE, 0.9 * a, FONTS.bold);
    line(ctx, W / 2 - 250 * S() * a, H * 0.78, W / 2 + 250 * S() * a, H * 0.78, acc, 3 * S(), a);
  }
  for (let i = 0; i < 3; i++) {
    const r = (220 + i * 150 + kick * 26) * S();
    ring(ctx, W / 2, H * 0.46, r, C.STEEL, 1.4 * S(), (0.16 - i * 0.04) * (0.4 + 0.6 * k));
  }
}

/** ورود باند: ازدحام ذرات که با ضرب نفس می‌کشد */
export function sInstA(ctx, song, t, acc, kick, sec) {
  const k = clamp((t - (sec ? sec[0] : 19.34)) / 3.2);
  const v = song.rms(t);
  particles(ctx, song, t, acc, kick, { amp: (70 + 130 * v) * S(), alpha: 0.35 + 0.65 * k });
  const sz = fitFa(ctx, T(song), 620 * S());
  outlineTextFa(ctx, T(song), W / 2, H * 0.5, sz * (1 + 0.045 * kick),
                C.BONE, 0.55, FONTS.black, 5 * S());
}

/** شکست ۲۹ ثانیه‌ای: شبکهٔ ۵×۳ از عنوان، خانه‌ها روی ضرب وارونه می‌شوند */
export function sInstB(ctx, song, t, acc, kick, sec) {
  const cols = 5, rows = 3;
  const bi = song.beatI(t);
  const sz = 150 * S();
  const cw = W / cols, ch = H / rows;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = W * (c + 0.5) / cols;
      const y = H * (r + 0.5) / rows;
      const idx = r * cols + c;
      const on = ((bi + idx * 3) % 11) < 2;
      if (on) {
        rect(ctx, x - cw / 2, y - ch / 2, cw, ch, acc, 0.9);
        textFa(ctx, T(song), x, y, sz, C.BG, 1.0);
      } else {
        textFa(ctx, T(song), x, y, sz, C.BONE, 0.10 + 0.10 * kick);
      }
    }
  }

  const sc = 1.0 + 0.5 * clamp((t - (sec ? sec[0] : 129.0)) / lenOf(sec, 29.0));
  ctx.save();
  ctx.translate(W / 2, H / 2); ctx.scale(sc, sc); ctx.translate(-W / 2, -H / 2);
  outlineTextFa(ctx, N(song), W / 2, H / 2, 210 * S(), C.BONE, 0.5, FONTS.black, 4 * S());
  ctx.restore();
}

/** فرود: هفت خط افقی که یکی‌یکی کشیده می‌شوند */
export function sInstC(ctx, song, t, acc, kick, sec) {
  const k = (t - (sec ? sec[0] : 177.0)) / lenOf(sec, 12.5);
  for (let i = 0; i < 7; i++) {
    const y = H * (0.18 + i * 0.11);
    const w = (W - 300 * S()) * clamp(k * 2.2 - i * 0.18);
    line(ctx, 150 * S(), y, 150 * S() + w, y, C.BONE, 2 * S(), 0.10 + 0.2 * kick);
  }
  particles(ctx, song, t, acc, kick,
            { amp: (30 + 60 * song.rms(t)) * S(), alpha: 0.55, n: 620, swirl: 1.6 });
  const sz = fitFa(ctx, T(song), 520 * S());
  outlineTextFa(ctx, T(song), W / 2, H * 0.5, sz, C.BONE, 0.38, FONTS.black, 4 * S());
  textFa(ctx, N(song), W / 2, H * 0.78, 54 * S(), C.BONE, 0.55, FONTS.bold);
}

/** آینه: هر خط با بازتاب وارونه‌اش زیرش */
export function sMirror(ctx, song, t, acc, kick, ov = null) {
  const cur = song.activeLine(t);
  if (cur < 0) return;
  const lineObj = song.lines[cur];
  const items = applyOverrides(place(ctx, lineObj, 'giant'), ov);
  const start = song.lineStart(cur), out = song.lineOut(cur);
  const a = clamp((t - (start - 0.2)) / 0.3) * (1 - clamp((t - out) / 0.5));
  if (a <= 0.01) return;

  let lastSize = 0;
  for (const it of items) {
    const sung = t >= it.t;
    const p = clamp((t - it.t) / 0.2);
    const heat = sung ? Math.exp(-(t - it.t) * 3.0) : 0;
    const y = H * 0.40;
    wordDraw(ctx, it.word, it.cx, y, it.size, sung, heat, 1.0 + 0.1 * (1 - p), a, false, acc);
    if (sung) {
      ctx.save();
      ctx.translate(it.cx, y + it.size * 1.25);
      ctx.scale(1, -1);
      textFa(ctx, it.word, 0, 0, it.size, acc, 0.22 * a);
      ctx.restore();
    }
    lastSize = it.size;
  }
  const hy = H * 0.40 + lastSize * 0.62;
  line(ctx, 200 * S(), hy, W - 200 * S(), hy, acc, 2 * S(), 0.35 * a);
}

/** کارت پایان: عنوان → نام → تلگرام، سه‌مرحله‌ای، بعد محو به سیاه */
export function sEnd(ctx, song, t, acc, kick, sec) {
  // زمان‌های آهنگ نمونه: شروع ۲۰۷٫۲ ← عنوان +۰٫۲، نام +۲٫۲، تلگرام +۴٫۰،
  // و محو نهایی ۶٫۶ ثانیه مانده به پایان بخش
  const s0 = sec ? sec[0] : 207.2;
  const s1 = sec ? sec[1] : 228.6;
  const k = clamp((t - (s0 + 0.2)) / 1.4);
  const sz = fitFa(ctx, T(song), (300 + 380 * outExpo(k)) * S());
  textFa(ctx, T(song), W / 2, H * 0.38, sz, C.BONE, k);

  const k2 = clamp((t - (s0 + 2.2)) / 1.2);
  if (k2 > 0) {
    textFa(ctx, N(song), W / 2, H * 0.64, 96 * S(), C.BONE, k2, FONTS.bold);
    line(ctx, W / 2 - 430 * S() * k2, H * 0.71, W / 2 + 430 * S() * k2, H * 0.71, acc, 4 * S(), k2);
  }
  const k3 = clamp((t - (s0 + 4.0)) / 1.2);
  if (k3 > 0) textMono(ctx, G(song), W / 2, H * 0.78, 42 * S(), acc, k3, 10, 'center');

  const fade = clamp((t - Math.max(s0 + 5.4, s1 - 6.6)) / 4.4);
  if (fade > 0) rect(ctx, 0, 0, W, H, C.BG, fade);
}

/** بخش خالی: فقط زمینه — برای پروژه‌هایی که شعر ندارند */
export function sNone() {}

export const STYLE_FN = {
  none: sNone,
  intro: sIntro, inst_a: sInstA, inst_b: sInstB,
  inst_c: sInstC, mirror: sMirror, end: sEnd,
};

