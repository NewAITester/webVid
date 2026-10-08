import { chromium } from 'playwright';
const b = await chromium.launch({ args: ['--no-sandbox'] });
const pg = await b.newPage({ viewport: { width: 1400, height: 950 } });
await pg.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
await pg.waitForFunction(() => document.querySelector('#loading')?.classList.contains('gone'), { timeout: 25000 });
await pg.evaluate(() => window.dispatchEvent(new CustomEvent('seek-test', { detail: 33.2 })));
await pg.click('#editBtn');
await pg.waitForTimeout(400);
await pg.screenshot({ path: 'tests/editmode.png' });
// و بررسی اینکه روکش در خروجی نمی‌آید
const clean = await pg.evaluate(async () => {
  const S = window.__studio;
  const before = S.renderer.editMode;
  const blob = await S.exportVideo({ song:S.song, from:33, to:33.2, width:640, height:360, fps:30, bitrate:2e6 });
  return { editModeStillOn: S.renderer.editMode === before, size: blob.size };
});
console.log('خروجی حین حالت ویرایش:', JSON.stringify(clean));
await b.close();
