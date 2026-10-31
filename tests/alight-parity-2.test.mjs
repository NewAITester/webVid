/**
 * تست فاز ۲ هم‌ترازی با Alight Motion — برش ویدیو (trimOut) و بریدن کلیپ.
 * بدون مرورگر: mediaTime و ops خالص‌اند.
 *   node tests/alight-parity-2.test.mjs
 */
import { newLayer } from '../src/motion/schema.js';
import { MediaPool } from '../src/motion/media.js';
import { split, trimStart, trimEnd } from '../src/motion/ops.js';

let fail = 0;
const ok = (c, m) => { console.log((c ? '  ✅' : '  ❌') + ' ' + m); if (!c) fail++; };
const near = (a, b) => Math.abs(a - b) < 0.01;
const it = { dur: 60 };

console.log('── پنجرهٔ منبع ویدیو (trimIn/trimOut) ──');
{
  const L = newLayer('video', 0, 10);
  L.data.trimIn = 10; L.data.trimOut = 20; L.data.loop = false; L.data.speed = 1;
  ok(near(MediaPool.mediaTime(L, 0, it), 10), 'بدون تکرار: شروع از trimIn=10');
  ok(near(MediaPool.mediaTime(L, 5, it), 15), 'بدون تکرار: lt=5 → 15');
  ok(MediaPool.mediaTime(L, 30, it) < 20, 'بدون تکرار: بعد از پنجره در trimOut می‌ایستد، نه انتهای فایل');
  L.data.loop = true;
  ok(near(MediaPool.mediaTime(L, 12, it), 12), 'با تکرار: lt=12 داخل پنجرهٔ ۱۰ثانیه‌ای می‌چرخد → 12');
  ok(near(MediaPool.mediaTime(L, 2, it), 12), 'با تکرار: lt=2 → 12 (چرخهٔ دوم)');
  const L2 = newLayer('video', 0, 10);
  L2.data.trimIn = 5; L2.data.trimOut = null; L2.data.loop = false;
  ok(near(MediaPool.mediaTime(L2, 0, it), 5), 'trimOut=null یعنی تا انتهای فایل');
}

console.log('── بریدن کلیپ (split) با پنجرهٔ منبع ──');
{
  const L = newLayer('video', 0, 20);
  L.data.trimIn = 10; L.data.trimOut = null; L.data.loop = false; L.data.speed = 1;
  const b = split(L, 8);
  ok(!!b, 'split در t=8 دو تکه می‌سازد');
  ok(near(L.t1, 8) && near(L.data.trimOut, 18), `تکهٔ اول: t1=8 و trimOut=18 (got ${L.t1}, ${L.data.trimOut})`);
  ok(near(b.t0, 8) && near(b.data.trimIn, 18), `تکهٔ دوم: t0=8 و trimIn=18 (got ${b.t0}, ${b.data.trimIn})`);
  ok(near(MediaPool.mediaTime(b, 0, it), 18), 'تکهٔ دوم از همان فریمِ برش ادامه می‌دهد');
  ok(near(MediaPool.mediaTime(L, 0, it), 10), 'تکهٔ اول هنوز از 10 شروع می‌شود');
}

console.log('── trimStart/trimEnd ──');
{
  const L = newLayer('video', 0, 20);
  L.data.trimIn = 0; L.data.loop = false;
  trimEnd(L, 12);
  ok(near(L.data.trimOut, 12), 'trimEnd بدون تکرار trimOut را می‌سازد');
  trimStart(L, 4);
  ok(near(L.data.trimIn, 4) && near(L.data.trimOut, 12), 'trimStart فقط trimIn را جلو می‌برد، trimOut سر جایش می‌ماند');
}

console.log(fail ? `❌ ${fail} خطا` : '✅ همهٔ تست‌ها گذشت');
process.exit(fail ? 1 : 0);
