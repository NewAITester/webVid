import { parseLRC } from '../src/engine/lyrics.js';
import { Song, SECT, DUR, outQuint, outExpo } from '../src/engine/song.js';
import { Analysis } from '../src/engine/analysis.js';
import fs from 'node:fs';

let fail = 0;
const ok = (c, m) => { console.log((c ? '  ✅' : '  ❌') + ' ' + m); if (!c) fail++; };

const lines = parseLRC(fs.readFileSync('public/data/lyrics.lrc', 'utf8'));
const A = new Analysis(JSON.parse(fs.readFileSync('public/data/analysis.json', 'utf8')));
const song = new Song(lines, A);

console.log('── جدول بخش‌ها ──');
ok(SECT.length === 13, `۱۳ بخش (${SECT.length})`);
ok(SECT[0][0] === 0 && SECT[12][1] === DUR, 'از ۰ تا پایان پوشش کامل دارد');
let gaps = 0;
for (let i = 0; i < SECT.length - 1; i++) if (SECT[i][1] !== SECT[i + 1][0]) gaps++;
ok(gaps === 0, 'هیچ شکاف یا همپوشانی بین بخش‌ها نیست');
ok(song.section(75)[2] === 'chorus', `ثانیهٔ ۷۵ = ${song.section(75)[2]}`);
ok(song.section(140)[2] === 'inst_b', `ثانیهٔ ۱۴۰ = ${song.section(140)[2]}`);
ok(song.section(300)[2] === 'end', 'بعد از پایان، آخرین بخش برمی‌گردد');

console.log('\n── ضرب ──');
ok(Math.abs(song.beatEnv(song.beats[50]) - 1) < 1e-9, 'پاکت ضرب روی ضرب = ۱');
ok(song.beatEnv(song.beats[50] + 0.45) === 0, 'بعد از ۰٫۴ ثانیه = ۰');
ok(song.beats[song.beatI(60)] <= 60, 'ایندکس ضرب درست است');
const k = song.kick(song.beats[100]);
ok(k > 0 && k <= 1, `ضربه در بازهٔ ۰..۱ (${k.toFixed(3)})`);

console.log('\n── خط فعال ──');
ok(song.activeLine(5) === -1, 'قبل از اولین خط: هیچ');
ok(song.activeLine(10.5) === 0, 'ثانیهٔ ۱۰٫۵ = خط ۰');
for (const tt of [11, 16, 33, 61, 71, 95, 120, 161, 196]) {
  const li = song.activeLine(tt);
  ok(li >= 0, `ثانیهٔ ${tt}: خط ${li} فعال است`);
}
ok(song.lineOut(0) > song.lineStart(0), 'پایان خط بعد از شروعش است');

console.log('\n── منحنی‌ها ──');
ok(outQuint(0) === 0 && outQuint(1) === 1, 'outQuint از ۰ به ۱');
ok(outExpo(0) === 0 && outExpo(1) === 1, 'outExpo از ۰ به ۱');
ok(song.rms(0) >= 0 && song.rms(100) <= 1, 'RMS نرمال است');
ok(song.beatPush(song.beats[100]) > 0, 'فشار ضرب مثبت است');

console.log('\n── تکرارپذیری ──');
const snap = t => [song.kick(t), song.rms(t), song.beatPush(t), song.activeLine(t)].join(',');
ok(snap(88.3) === snap(88.3), 'دو فراخوانی در یک زمان = نتیجهٔ یکسان');

console.log(fail ? `\n❌ ${fail} تست رد شد` : '\n✅ همهٔ تست‌ها قبول');
process.exit(fail ? 1 : 0);
