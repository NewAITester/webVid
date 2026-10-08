import { chromium } from 'playwright';
import fs from 'node:fs';
const ref = JSON.parse(fs.readFileSync('public/data/analysis.json','utf8'));
const b = await chromium.launch({ args: ['--no-sandbox'] });
const pg = await b.newPage();
await pg.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
await pg.waitForFunction(() => document.querySelector('#loading')?.classList.contains('gone'), { timeout: 25000 });
const a = await pg.evaluate(async () => {
  const { analyzeBuffer, decodeAudioFile } = await import('/src/engine/analyze.js');
  const ab = await (await fetch('/data/Neghab.mp3')).arrayBuffer();
  const r = await analyzeBuffer(await decodeAudioFile(ab), ()=>{});
  return { tempo:r.tempo, beats:r.beats };
});
await b.close();
console.log(`تمپو من ${a.tempo}  |  librosa ${ref.tempo.toFixed(3)}  → اختلاف ${(a.tempo-ref.tempo).toFixed(4)} BPM`);
const perMine=60/a.tempo, perRef=60/ref.tempo;
console.log(`دورهٔ ضرب: من ${(perMine*1000).toFixed(2)}ms  مرجع ${(perRef*1000).toFixed(2)}ms`);
// آفست در طول آهنگ: اول، وسط، آخر
for (const [lbl,frac] of [['اول',0.05],['وسط',0.5],['آخر',0.95]]) {
  const t = ref.duration*frac;
  const m = a.beats.reduce((p,c)=>Math.abs(c-t)<Math.abs(p-t)?c:p);
  const r = ref.beats.reduce((p,c)=>Math.abs(c-t)<Math.abs(p-t)?c:p);
  console.log(`  ${lbl.padEnd(5)} t=${t.toFixed(1)}  من ${m.toFixed(3)}  مرجع ${r.toFixed(3)}  اختلاف ${((m-r)*1000).toFixed(0)}ms`);
}
console.log(`\nآفست اول من: ${a.beats[0].toFixed(4)}  مرجع: ${ref.beats[0].toFixed(4)}`);
