import { chromium } from 'playwright';
const b = await chromium.launch({ args:['--no-sandbox'] });
const ctx = await b.newContext({ viewport:{width:412,height:915}, isMobile:true, hasTouch:true, deviceScaleFactor:2 });
const pg = await ctx.newPage();
const errs=[]; pg.on('pageerror',e=>errs.push('PAGEERROR: '+e.message));
await pg.goto('http://localhost:5173/',{waitUntil:'networkidle'});
await pg.waitForFunction(()=>document.querySelector('#loading')?.classList.contains('gone'),{timeout:30000});
await pg.click('.pcard'); await pg.waitForTimeout(1200);

const snap = async () => pg.evaluate(()=>{
  const g = s => { const e=document.querySelector(s); if(!e) return null;
    const r=e.getBoundingClientRect(); return {t:Math.round(r.top),b:Math.round(r.bottom),h:Math.round(r.height)}; };
  const cv = document.querySelector('#stage');
  const wrap = document.querySelector('#stagewrap').getBoundingClientRect();
  const cr = cv.getBoundingClientRect();
  return { stage:g('#stagewrap'), transport:g('.transport'), tl:g('.tlwrap'), nav:g('.nav'),
    canvasCss:[Math.round(cr.width),Math.round(cr.height)],
    overflow: Math.round(cr.bottom - wrap.bottom) };
});

const base = await snap();
console.log('بدون پنل:', JSON.stringify(base));
let bad = 0;
for (const t of ['lyrics','fx','words','look','export']) {
  await pg.click(`#nav button[data-go="${t}"]`);
  await pg.waitForTimeout(600);
  const s = await snap();
  const moved = s.transport.t !== base.transport.t || s.stage.h !== base.stage.h;
  const ov = s.overflow > 1;
  console.log(`  ${t.padEnd(8)} نوار پخش y=${s.transport.t} ${moved?'❌ جابه‌جا شد':'✅ ثابت'}` +
              ` | سرریز بوم ${s.overflow}px ${ov?'❌':'✅'}`);
  if (moved||ov) bad++;
  if (t==='fx') await pg.screenshot({path:'tests/l_fx.png'});
}
// بستن پنل با زدن دوبارهٔ همان تب
await pg.click('#nav button[data-go="export"]'); await pg.waitForTimeout(500);
console.log('پنل بعد از زدن دوباره:', await pg.evaluate(()=>document.querySelector('#panes').classList.contains('open'))?'باز ❌':'بسته ✅');
await pg.screenshot({path:'tests/l_closed.png'});
console.log(bad?`\n❌ ${bad} تب مشکل داشت`:'\n✅ چیدمان در همهٔ تب‌ها ثابت ماند');
if(errs.length)console.log('خطاها:',[...new Set(errs)].slice(0,3));
await b.close();
