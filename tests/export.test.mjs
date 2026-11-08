/**
 * تست خروجی — فاز R5. فقط بخش‌های خالص (بدون WebCodecs):
 * نقشهٔ خروجی، زمان‌بندی صدا، برآورد حجم و تشخیص پشتیبانی.
 *   node tests/export.test.mjs
 */
import { exportPlan, audioSchedule, estimateSize, exportSupport } from '../src/export/exporter.js';
import { newLayer, newProject } from '../src/core/schema.js';

let fail = 0;
const ok = (c, m) => { console.log((c ? '  ✅' : '  ❌') + ' ' + m); if (!c) fail++; };

console.log('── نقشهٔ خروجی ──');
{
  const p = newProject('تست', 720, 1280);
  p.duration = 10;
  const plan = exportPlan(p, { from: 0, to: 2, fps: 30 });
  ok(plan.frames === 60, '۲ ثانیه با ۳۰ فریم = ۶۰ فریم');
  ok(plan.seconds === 2 && plan.fps === 30, 'ثانیه و فریم‌ریت درست‌اند');
  ok(plan.estMB === 3, 'برآورد حجم ۲ ثانیه با ۱۲ مگابیت = ۳ مگابایت');
  const plan2 = exportPlan(p, { from: 9, to: 20, fps: 60 });
  ok(plan2.to === 10 && plan2.frames === 60, 'پایان به طول پروژه محدود می‌شود');
  const plan3 = exportPlan(p, { from: -5, to: 1, fps: 100 });
  ok(plan3.from === 0 && plan3.fps === 60, 'شروع منفی صفر می‌شود و فریم‌ریت سقف ۶۰ دارد');
  let threw = false;
  try { exportPlan(p, { from: 5, to: 5 }); } catch { threw = true; }
  ok(threw, 'بازهٔ خالی خطا می‌دهد');
  threw = false;
  try { exportPlan(p, { from: 8, to: 3 }); } catch { threw = true; }
  ok(threw, 'بازهٔ وارونه خطا می‌دهد');
}

console.log('── زمان‌بندی صدا ──');
{
  const p = newProject('تست', 720, 1280);
  p.duration = 10;
  const a = newLayer('audio', { name: 'آهنگ', start: 1, end: 9, src: 'data/Neghab.mp3' });
  const b = newLayer('audio', { name: 'بیرون', start: 20, end: 30, src: 'x.mp3' });
  const t = newLayer('text', { start: 0, end: 5 });
  p.layers = [a, b, t];
  const s = audioSchedule(p, 0, 10);
  ok(s.length === 1 && s[0].src === 'data/Neghab.mp3', 'فقط لایهٔ صوتی داخل بازه می‌آید');
  ok(s[0].start === 1 && s[0].offset === 0 && s[0].duration === 8, 'شروع/آفست/مدت درست‌اند');
  const s2 = audioSchedule(p, 3, 5);
  ok(s2.length === 1 && s2[0].start === 0 && s2[0].offset === 2 && s2[0].duration === 2, 'برش وسط بازه آفست می‌خورد');
  ok(audioSchedule(p, 9.5, 10).length === 0, 'بعد از پایان لایه صدایی نیست');
}

console.log('── برآورد و پشتیبانی ──');
{
  const p = newProject('تست', 720, 1280);
  p.duration = 10;
  const est = estimateSize(p, { fps: 30, bitrateMbps: 12 });
  ok(est.estMB === 15 && est.seconds === 10, 'برآورد ۱۰ ثانیه = ۱۵ مگابایت');
  const sup = exportSupport();
  ok(typeof sup.webcodecs === 'boolean' && sup.webcodecs === false, 'در Node پشتیبانی WebCodecs false است');
}

console.log(fail === 0 ? '\n✅ همهٔ تست‌ها گذشت' : `\n❌ ${fail} تست ناموفق`);
process.exit(fail ? 1 : 0);
