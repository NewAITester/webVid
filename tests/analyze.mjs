import { chromium } from 'playwright';
const b = await chromium.launch({ args: ['--no-sandbox','--autoplay-policy=no-user-gesture-required'] });
const pg = await b.newPage({ viewport: { width: 1200, height: 800 } });
const errs=[]; pg.on('pageerror',e=>errs.push(e.message));
await pg.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
await pg.waitForFunction(() => document.querySelector('#loading')?.classList.contains('gone'), { timeout: 25000 });
const t0 = Date.now();
const r = await pg.evaluate(async () => {
  const { analyzeBuffer, decodeAudioFile } = await import('/src/engine/analyze.js');
  const ab = await (await fetch('/data/Neghab.mp3')).arrayBuffer();
  const buf = await decodeAudioFile(ab);
  const a = await analyzeBuffer(buf, () => {});
  return { dur:a.duration, tempo:a.tempo, nbeats:a.beats.length, first:a.beats.slice(0,6), step:a.t_step, rmsN:a.rms.length };
});
console.log(`زمان تحلیل: ${((Date.now()-t0)/1000).toFixed(1)} ثانیه`);
console.log(JSON.stringify(r,null,1));
if(errs.length) console.log('خطا:',[...new Set(errs)].slice(0,3));
await b.close();
