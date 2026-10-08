import { chromium } from 'playwright';
import fs from 'node:fs';
const ref = JSON.parse(fs.readFileSync('public/data/analysis.json','utf8'));
const b = await chromium.launch({ args: ['--no-sandbox'] });
const pg = await b.newPage();
await pg.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
await pg.waitForFunction(() => document.querySelector('#loading')?.classList.contains('gone'), { timeout: 25000 });
const mine = await pg.evaluate(async () => {
  const { analyzeBuffer, decodeAudioFile } = await import('/src/engine/analyze.js');
  const ab = await (await fetch('/data/Neghab.mp3')).arrayBuffer();
  return (await analyzeBuffer(await decodeAudioFile(ab), ()=>{})).beats;
});
await b.close();
const offs = mine.map(t => {
  let best = 1e9;
  for (const r of ref.beats) { const d = t - r; if (Math.abs(d) < Math.abs(best)) best = d; }
  return best;
}).filter(d => Math.abs(d) < 0.25);
offs.sort((a,b)=>a-b);
const med = offs[Math.floor(offs.length/2)];
const mae = offs.reduce((a,b)=>a+Math.abs(b),0)/offs.length;
console.log(`ضرب‌های من: ${mine.length}   مرجع librosa: ${ref.beats.length}`);
console.log(`ضرب‌هایی که تا ۰٫۲۵ ثانیه مطابقت دارند: ${offs.length} (${(offs.length/mine.length*100).toFixed(1)}٪)`);
console.log(`اختلاف میانه: ${(med*1000).toFixed(1)} میلی‌ثانیه`);
console.log(`میانگین قدرمطلق اختلاف: ${(mae*1000).toFixed(1)} میلی‌ثانیه`);
const beatDur = 60/ref.tempo*1000;
console.log(`طول یک ضرب: ${beatDur.toFixed(0)} میلی‌ثانیه → خطا ${(mae/ (beatDur/1000) *100).toFixed(1)}٪ یک ضرب`);
