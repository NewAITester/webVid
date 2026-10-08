import { chromium } from 'playwright';
const b = await chromium.launch({ args: ['--no-sandbox'] });
const pg = await b.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
await pg.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
await pg.waitForFunction(() => document.querySelector('#loading')?.classList.contains('gone'), { timeout: 25000 });
await pg.evaluate(() => {
  for (const s of ['.bar','.transport','#strip','#exPanel']) {
    const e = document.querySelector(s); if (e) e.style.display = 'none';
  }
  window.dispatchEvent(new Event('resize'));
});
await pg.waitForTimeout(400);
await pg.evaluate(() => window.dispatchEvent(new CustomEvent('seek-test', { detail: 7.5 })));
await pg.waitForTimeout(250);
await pg.locator('#stage').screenshot({ path: 'tests/outline_new.png' });
console.log('✅');
await b.close();
