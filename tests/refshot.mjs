import { chromium } from 'playwright';
const TS = [5.0, 16.2, 24.0, 33.0, 61.5, 71.0, 140.0, 182.0, 196.0, 210.5];
const b = await chromium.launch({ args: ['--no-sandbox'] });
const pg = await b.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
const bad = [];
pg.on('pageerror', e => bad.push(e.message));
await pg.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
await pg.waitForFunction(() => document.querySelector('#loading')?.classList.contains('gone'), { timeout: 25000 });

// بوم را دقیقاً ۱۹۲۰×۱۰۸۰ کن و رابط کاربری را کنار بزن — مثل خروجی واقعی
await pg.evaluate(() => {
  document.querySelector('.bar').style.display = 'none';
  document.querySelector('.transport').style.display = 'none';
  document.querySelector('#strip').style.display = 'none';
  window.dispatchEvent(new Event('resize'));
});
await pg.waitForTimeout(400);

for (const t of TS) {
  await pg.evaluate(x => window.dispatchEvent(new CustomEvent('seek-test', { detail: x })), t);
  await pg.waitForTimeout(220);
  await pg.locator('#stage').screenshot({ path: `tests/web_${t.toFixed(2).padStart(6,'0')}.png` });
}
const size = await pg.evaluate(() => { const c = document.querySelector('#stage'); return [c.width, c.height]; });
console.log('بوم:', size.join('×'), bad.length ? '❌ '+bad.join(';') : '✅');
await b.close();
