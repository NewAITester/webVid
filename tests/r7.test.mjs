/**
 * تست فاز R7 — شعر LRC، صدا، دوربین و رسم آزاد (همه خالص، بدون DOM).
 *   node tests/r7.test.mjs
 */
import fs from 'node:fs';
import { parseLrc, lrcToLayers } from '../src/importers/lrc.js';
import { audioVolumeAt, AudioPlayer } from '../src/render/audio.js';
import { cameraZoomAt, valueAt } from '../src/core/evaluate.js';
import { newLayer } from '../src/core/schema.js';

let fail = 0;
const ok = (c, m) => { console.log((c ? '  ✅' : '  ❌') + ' ' + m); if (!c) fail++; };

console.log('── تجزیهٔ LRC ──');
{
  const t1 = parseLrc(`[ti:نقاب]\n[ar:spidy]\n[00:10.08]تاریکی می‌خزه\n[00:15.06]آینه‌ها دروغ می‌گن\n`);
  ok(t1.meta.ti === 'نقاب' && t1.meta.ar === 'spidy', 'متا خوانده می‌شود');
  ok(t1.lines.length === 2, '۲ خط');
  ok(Math.abs(t1.lines[0].start - 10.08) < 0.01, 'شروع خط اول ۱۰٫۰۸');
  ok(t1.lines[0].text === 'تاریکی می‌خزه', 'متن خط اول');
  ok(Math.abs(t1.lines[0].end - 15.06) < 0.01, 'پایان خط اول = شروع خط بعد');
  ok(t1.lines[1].words.length === 0, 'خط ساده کلمه‌به‌کلمه ندارد');

  const t2 = parseLrc(`[00:10.08]<00:10.08>تاریکی <00:12.56>می‌خزه <00:13.48>تو\n[00:15.06]<00:15.06>آینه‌ها\n`);
  ok(t2.lines[0].words.length === 3, '۳ کلمه با زمان');
  ok(Math.abs(t2.lines[0].words[1].t - 12.56) < 0.01, 'زمان کلمهٔ دوم ۱۲٫۵۶');
  ok(t2.lines[0].text === 'تاریکی می‌خزه تو', 'متن خط از کلمه‌ها ساخته می‌شود');

  const t3 = parseLrc(`[offset:+500]\n[00:10.00]سلام\n\nبدون زمان\n[00:20.00]دنیا\n`);
  ok(Math.abs(t3.lines[0].start - 10.5) < 0.01, 'offset نیم‌ثانیه اعمال می‌شود');
  ok(t3.lines.length === 2, 'خط بدون زمان و خالی رد می‌شود');

  const real = parseLrc(fs.readFileSync(new URL('../public/data/lyrics.lrc', import.meta.url), 'utf8'));
  ok(real.lines.length >= 20, `فایل واقعی نقاب: ${real.lines.length} خط`);
  ok(Math.abs(real.lines[0].start - 10.08) < 0.01, 'اولین خط فایل واقعی ۱۰٫۰۸ است');
  ok(real.lines.every(l => l.end > l.start && l.text.length > 0), 'همهٔ خط‌ها بازه و متن دارند');
  ok(real.lines.some(l => l.words.length > 1), 'فایل واقعی برچسب کلمه دارد');

  const layers = lrcToLayers(real.lines);
  ok(layers.length === real.lines.length && layers.every(l => l.type === 'text'), 'یک لایهٔ متن برای هر خط');
  ok(Math.abs(layers[0].start - 10.08) < 0.01 && layers[0].text.content === real.lines[0].text, 'لایهٔ اول زمان و متن درست دارد');
  ok(Array.isArray(layers[0].text.words) && layers[0].text.words.length > 0, 'زمان‌بندی کلمه‌ها روی لایه می‌ماند');
}

console.log('── بلندی صدا ──');
{
  const l = newLayer('audio', { start: 2, end: 8 });
  l.audio = { volume: 0.8, fadeIn: 1, fadeOut: 2 };
  ok(audioVolumeAt(l, 1) === 0, 'بیرون بازه صفر است');
  ok(audioVolumeAt(l, 2) === 0, 'در شروع محو ورود صفر است');
  ok(Math.abs(audioVolumeAt(l, 2.5) - 0.4) < 0.01, 'وسط محو ورود ۰٫۴ است');
  ok(Math.abs(audioVolumeAt(l, 4) - 0.8) < 0.01, 'بعد از محو ورود بلندی کامل است');
  ok(Math.abs(audioVolumeAt(l, 7) - 0.4) < 0.01, 'وسط محو خروج ۰٫۴ است');
  ok(audioVolumeAt(l, 8) === 0, 'در پایان صفر است');
  const l2 = newLayer('audio', { start: 0, end: 5 });
  ok(audioVolumeAt(l2, 2) === 1, 'بدون محو بلندی ۱ است');
}

console.log('── بزرگنمایی دوربین ──');
{
  const cam = newLayer('camera', { start: 0, end: 10 });
  cam.camera.zoom = 1.5;
  ok(cameraZoomAt(cam, 3) === 1.5, 'بدون کی‌فریم مقدار ثابت برمی‌گردد');
  cam.keyframes = { zoom: [{ t: 0, v: 1 }, { t: 4, v: 2 }] };
  ok(Math.abs(cameraZoomAt(cam, 2) - 1.5) < 0.01, 'بین دو کی‌فریم میانیابی خطی می‌شود');
  ok(cameraZoomAt(cam, 0) === 1 && cameraZoomAt(cam, 5) === 2, 'قبل و بعد از کی‌فریم‌ها مقدار سرشکن می‌شود');
  ok(Math.abs(valueAt([{ t: 0, v: 0 }, { t: 2, v: 10 }], 1, 0) - 5) < 1e-9, 'valueAt میانیابی می‌کند');
}

console.log('── پخش‌کنندهٔ صدا (بدون DOM) ──');
{
  const p = new AudioPlayer();
  p.sync(null, 0, true); // نباید بمیرد
  p.tick(null, 0);
  p.stop();
  p.setMuted(true);
  ok(p.muted === true, 'بی‌صدا شدن کار می‌کند');
}

console.log('── نازک‌کردن نقاط رسم ──');
{
  // همان قانون ویرایشگر: نقطهٔ نزدیک‌تر از ۴ پیکسل رد می‌شود
  const thin = (pts, min = 4) => {
    const out = [pts[0]];
    for (const p of pts.slice(1)) {
      const last = out[out.length - 1];
      if (Math.hypot(p.x - last.x, p.y - last.y) >= min) out.push(p);
    }
    return out;
  };
  const pts = [{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 0 }, { x: 10, y: 0 }, { x: 11, y: 0 }, { x: 20, y: 0 }];
  const th = thin(pts);
  ok(th.length === 3 && th[1].x === 10 && th[2].x === 20, 'نقاط نزدیک حذف و نقاط دور نگه داشته می‌شوند');
}

console.log(fail === 0 ? '\n✅ همهٔ تست‌ها گذشت' : `\n❌ ${fail} تست ناموفق`);
process.exit(fail ? 1 : 0);
