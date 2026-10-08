import { chromium } from 'playwright';
const b = await chromium.launch({ args:['--no-sandbox'] });
const ctx = await b.newContext({ viewport:{width:412,height:915}, isMobile:true, hasTouch:true, deviceScaleFactor:2 });
const pg = await ctx.newPage();
const errs=[]; pg.on('pageerror',e=>errs.push(e.message));
await pg.goto('http://localhost:5173/',{waitUntil:'networkidle'});
await pg.waitForFunction(()=>document.querySelector('#loading')?.classList.contains('gone'),{timeout:30000});
await pg.click('.pcard'); await pg.waitForTimeout(1000);
await pg.evaluate(()=>window.__studio.seek(35)); await pg.waitForTimeout(400);

const box = await pg.locator('#tl').boundingBox();
const cy = box.y + 36;
// بخشی که نشانگر داخلش است
const info = await pg.evaluate(()=>{
  const S=window.__studio, t=S.time;
  const i=S.renderer.sections.findIndex(s=>t>=s[0]&&t<s[1]);
  S.tl.select(i);
  return {i, s:S.renderer.sections[i].slice(0,2)};
});
await pg.waitForTimeout(300);
const ex = await pg.evaluate(i=>{
  const S=window.__studio, b=document.querySelector('#tl').getBoundingClientRect();
  return b.left + S.tl.xOf(S.renderer.sections[i][1]);
}, info.i);
console.log(`بخش ${info.i}: ${info.s.map(x=>x.toFixed(1))}  لبهٔ پایان در x=${ex.toFixed(0)} (عرض صفحه ${box.width.toFixed(0)})`);

await pg.mouse.move(ex, cy); await pg.mouse.down();
await pg.mouse.move(ex - 60, cy, {steps:8}); await pg.mouse.up();
await pg.waitForTimeout(400);
const after = await pg.evaluate(i=>window.__studio.renderer.sections[i].slice(0,2), info.i);
console.log('بعد از کشیدن لبه:', after.map(x=>+x.toFixed(1)),
  after[1] < info.s[1] - 0.3 ? '✅ کوتاه شد' : '❌ تغییر نکرد');
await pg.screenshot({path:'tests/t_edge.png'});
if(errs.length)console.log('خطا:',[...new Set(errs)].slice(0,3));
await b.close();
