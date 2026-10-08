import { chromium } from 'playwright';
const FX = ['type','karaoke','wave','punch','split','stack'];
const b = await chromium.launch({ args:['--no-sandbox'] });
const pg = await b.newPage({ viewport:{width:1700,height:1050}, deviceScaleFactor:1 });
const errs=[]; pg.on('pageerror',e=>errs.push('PAGEERROR: '+e.message));
pg.on('console',m=>{if(m.type()==='error'&&!/WebSocket|ERR_CONNECTION/.test(m.text()))errs.push(m.text());});
await pg.goto('http://localhost:5173/',{waitUntil:'networkidle'});
await pg.waitForFunction(()=>document.querySelector('#loading')?.classList.contains('gone'),{timeout:30000});
await pg.click('#nav button[data-go="sections"]'); await pg.waitForTimeout(500);
await pg.evaluate(()=>{for(const s of ['.bar','.transport','.panes','.nav']){const e=document.querySelector(s);if(e)e.style.display='none';}
  window.dispatchEvent(new Event('resize'));});
await pg.waitForTimeout(400);
for (const fx of FX) {
  await pg.evaluate(f=>{
    const S=window.__studio;
    S.renderer.sections=[[0,228.6,f,'#E4142A']];
    S.seek(33.4);
  }, fx);
  await pg.waitForTimeout(280);
  await pg.locator('#stage').screenshot({path:`tests/fx_${fx}.png`});
  const n = await pg.evaluate(()=>window.__studio.renderer.wordsAt(33.4).length);
  console.log(`  ${fx.padEnd(9)} کلمات قابل ویرایش: ${n}`);
}
if(errs.length)console.log('خطاها:',[...new Set(errs)].slice(0,4)); else console.log('✅ بدون خطا');
await b.close();
