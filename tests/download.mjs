import { chromium } from 'playwright';
import fs from 'node:fs';
const b = await chromium.launch({ args: ['--no-sandbox'] });
const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
const pg = await ctx.newPage();
const errs = [];
pg.on('pageerror', e => errs.push(e.message));
await pg.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
await pg.waitForFunction(() => document.querySelector('#loading')?.classList.contains('gone'), { timeout: 25000 });

await pg.click('#exportBtn');
await pg.waitForTimeout(600);
console.log('پیام آمادگی:', (await pg.textContent('#exMsg')).trim());

// بازهٔ کوتاه برای تست
await pg.fill('#exFrom', '66');
await pg.fill('#exTo', '69');
await pg.dispatchEvent('#exTo', 'input');
await pg.waitForTimeout(200);
console.log('برآورد حجم:', (await pg.textContent('#exEst')).trim());

const dlP = pg.waitForEvent('download', { timeout: 180000 });
await pg.click('#exGo');
const dl = await dlP;
const path = '/tmp/dl_' + dl.suggestedFilename();
await dl.saveAs(path);
const sz = fs.statSync(path).size;
console.log(`✅ دانلود شد: ${dl.suggestedFilename()}  ${sz.toLocaleString()} بایت`);
await pg.waitForTimeout(800);
console.log('پیام نهایی:', (await pg.textContent('#exMsg')).trim());
if (errs.length) console.log('خطاها:', [...new Set(errs)].slice(0,3).join(' | '));
await b.close();
