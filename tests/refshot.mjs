import { chromium } from 'playwright';
const TS = [7.5, 24.0, 33.0, 71.0, 140.0, 182.0];
const b = await chromium.launch({ args: ['--no-sandbox'] });
const pg = await b.newPage({ viewport: { width: 1980, height: 1200 }, deviceScaleFactor: 1 });
await pg.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
await pg.waitForFunction(() => document.querySelector('#loading')?.classList.contains('gone'), { timeout: 25000 });
await pg.evaluate(() => {
  for (const s of ['.bar','.transport','#strip','#exPanel']) { const e=document.querySelector(s); if(e) e.style.display='none'; }
  window.dispatchEvent(new Event('resize'));
});
await pg.waitForTimeout(500);
for (const t of TS) {
  await pg.evaluate(x => window.dispatchEvent(new CustomEvent('seek-test', { detail: x })), t);
  await pg.waitForTimeout(240);
  await pg.locator('#stage').screenshot({ path: `tests/w_${t.toFixed(2).padStart(6,'0')}.png` });
}
console.log('بوم:', (await pg.evaluate(()=>{const c=document.querySelector('#stage');return [c.width,c.height]})).join('×'));
await b.close();
