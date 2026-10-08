import { parseLRC, lineAt, activeWord, stripDiacritics } from '../src/engine/lyrics.js';
import { Analysis } from '../src/engine/analysis.js';
import { ease, env, ramp, hash, noise1, mixHex, rgba } from '../src/engine/core.js';
import fs from 'node:fs';

let fail = 0;
const ok = (c, m) => { console.log((c ? '  ✅' : '  ❌') + ' ' + m); if (!c) fail++; };

console.log('── خواندن شعر ──');
const lines = parseLRC(fs.readFileSync('public/data/lyrics.lrc', 'utf8'));
ok(lines.length === 40, `تعداد خطوط: ${lines.length} (انتظار ۴۰)`);
const w0 = lines[0].words;
ok(w0.length === 4, `خط اول ${w0.length} کلمه دارد`);
ok(w0[0].text === 'تاریکی' && Math.abs(w0[0].t - 10.08) < .01, `کلمهٔ اول: «${w0[0].text}» @ ${w0[0].t}`);
ok(w0[0].id === 'l0w0', `شناسهٔ پایدار: ${w0[0].id}`);
ok(w0.every(w => w.end > w.t), 'پایان هر کلمه بعد از شروعش است');

console.log('\n── حذف اعراب ──');
ok(stripDiacritics('شِکَنَم') === 'شکنم', 'شِکَنَم → ' + stripDiacritics('شِکَنَم'));
ok(stripDiacritics('تَوَهُّم') === 'توهم', 'تَوَهُّم → ' + stripDiacritics('تَوَهُّم'));
const dia = lines.flatMap(l => l.words).filter(w => /[\u064B-\u0652]/.test(w.text));
ok(dia.length === 0, `هیچ اعرابی در خروجی نمانده (${dia.length})`);

console.log('\n── انتخاب خط و کلمهٔ فعال ──');
const L = lineAt(lines, 16.2);
ok(L && L.i === 1, `در ثانیهٔ ۱۶٫۲ خط ${L?.i} فعال است`);
ok(activeWord(L, 16.7) === 2, `کلمهٔ فعال: ایندکس ${activeWord(L, 16.7)} = «${L.words[2].text}»`);
ok(lineAt(lines, 25.0) === null, 'در سکوت بین خطوط، هیچ خطی فعال نیست');

// باگ واقعی که پیدا شد: با حاشیهٔ بزرگ، پنجرهٔ خط قبلی روی خط بعدی می‌افتد
const L46 = lineAt(lines, 45.6, 1.2);
ok(Math.abs(L46.t - 44.4) < 0.2, `در ۴۵٫۶ با حاشیهٔ ۱٫۲ باید خط ۴۴٫۴ بیاید، نه قبلی (آمد: ${L46.t})`);
for (const tt of [11, 16, 31, 45.6, 60, 100.3, 160, 200]) {
  const L = lineAt(lines, tt, 1.2);
  if (!L) continue;
  const d = tt < L.t ? L.t - tt : tt > L.end ? tt - L.end : 0;
  const better = lines.some(o => {
    const dd = tt < o.t ? o.t - tt : tt > o.end ? tt - o.end : 0;
    return dd < d - 1e-9;
  });
  ok(!better, `در ثانیهٔ ${tt} نزدیک‌ترین خط انتخاب شد`);
}

console.log('\n── تحلیل صدا ──');
const A = new Analysis(JSON.parse(fs.readFileSync('public/data/analysis.json', 'utf8')));
ok(Math.abs(A.tempo - 129.2) < .1, `تمپو: ${A.tempo.toFixed(2)}`);
ok(A.beats.length === 487, `تعداد ضرب‌ها: ${A.beats.length}`);
const rmsVals = [0, 30, 60, 120, 200].map(x => A.rmsAt(x));
ok(rmsVals.every(v => v >= 0 && v <= 1), 'RMS نرمال‌شده بین ۰ و ۱ است: ' + rmsVals.map(v => v.toFixed(2)).join(', '));
const bi = A.beatIndex(60);
ok(A.beats[bi] <= 60 && A.beats[bi + 1] > 60, `ایندکس ضرب در ثانیهٔ ۶۰: ${bi} (@${A.beats[bi].toFixed(2)})`);
ok(A.pulse(A.beats[100]) > 0.99, 'تپش دقیقاً روی ضرب = ' + A.pulse(A.beats[100]).toFixed(3));
// فاصلهٔ ضرب‌ها ۰٫۴۶ ثانیه است، پس باید قبل از ضرب بعدی تست کنیم
ok(A.beatDur > 0.28 && A.beatDur < 0.47, `فاصلهٔ ضرب: ${A.beatDur.toFixed(3)} ثانیه`);
ok(A.pulse(A.beats[100] + 0.30) === 0, 'تپش ۰٫۳ ثانیه بعد از ضرب (بعد از decay) = ۰');
ok(A.pulse(A.beats[100] + 0.14) > 0.2, 'تپش وسط decay هنوز زنده است');

console.log('\n── توابع ریاضی ──');
ok(ease.outCubic(0) === 0 && ease.outCubic(1) === 1, 'منحنی outCubic از ۰ به ۱ می‌رود');
ok(env(5, 0, 10, 2, 2) === 1, 'پاکت وسط بازه = ۱');
ok(env(-1, 0, 10) === 0, 'پاکت بیرون بازه = ۰');
ok(hash(42) === hash(42), 'hash تکرارپذیر است');
ok(Math.abs(noise1(3.5)) <= 1, 'نویز در بازهٔ -۱..۱');
ok(rgba('#E4142A', 0.5) === 'rgba(228,20,42,0.5)', 'تبدیل رنگ: ' + rgba('#E4142A', 0.5));

console.log('\n── تکرارپذیری (قانون طلایی) ──');
const sample = t => Array.from({length:5},(_,i)=>hash(i*1.7)+A.pulse(t)+A.rmsAt(t)).join(',');
ok(sample(77.3) === sample(77.3), 'دو بار فراخوانی در یک زمان = نتیجهٔ یکسان');

console.log(fail ? `\n❌ ${fail} تست رد شد` : '\n✅ همهٔ تست‌ها قبول');
process.exit(fail ? 1 : 0);
