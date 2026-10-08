import { chromium } from 'playwright';

const times = process.argv.slice(2).map(Number);
const b = await chromium.launch({ args: ['--no-sandbox','--allow-file-access-from-files'] });
const pg = await b.newPage({ viewport: { width: 1280, height: 860 }, deviceScaleFactor: 1 });

const errs = [];
pg.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
pg.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));

await pg.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
await pg.waitForFunction(() => document.querySelector('#loading')?.classList.contains('gone'), { timeout: 20000 });
await pg.waitForTimeout(400);

for (const t of times) {
  await pg.evaluate(async (tt) => {
    const ev = new CustomEvent('seek-test', { detail: tt });
    window.dispatchEvent(ev);
  }, t);
  await pg.waitForTimeout(250);
  await pg.locator('#stage').screenshot({ path: `/home/user/lyricstudio/tests/shot_${String(t).replace('.','_')}.png` });
}
await pg.screenshot({ path: '/home/user/lyricstudio/tests/ui.png' });

console.log(errs.length ? '❌ خطاها:\n' + errs.join('\n') : '✅ هیچ خطای کنسولی نیست');
await b.close();
