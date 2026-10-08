import { chromium } from 'playwright';
const b = await chromium.launch({ args: ['--no-sandbox'] });
const pg = await b.newPage({ viewport: { width: 1280, height: 900 } });
const errs = [];
pg.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
pg.on('console', m => { if (m.type()==='error') errs.push('CONSOLE: ' + m.text()); });
await pg.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
await pg.waitForFunction(() => document.querySelector('#loading')?.classList.contains('gone'), { timeout: 25000 });
await pg.click('#exportBtn');
await pg.fill('#exFrom','66'); await pg.fill('#exTo','68');
await pg.click('#exGo');
for (let i=0;i<40;i++){
  await pg.waitForTimeout(2000);
  const m=(await pg.textContent('#exMsg')).trim();
  console.log(`[${i*2}s]`, m);
  if (/ذخیره|آماده شد|خطا/.test(m)) break;
}
console.log('—— خطاها ——');
console.log([...new Set(errs)].filter(e=>!/WebSocket|ERR_CONNECTION/.test(e)).slice(0,8).join('\n') || '(هیچ)');
await b.close();
