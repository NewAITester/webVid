import { chromium } from 'playwright';
const b = await chromium.launch({ args:['--no-sandbox'] });
const ctx = await b.newContext({ viewport:{width:412,height:915}, isMobile:true, hasTouch:true, deviceScaleFactor:2 });
const pg = await ctx.newPage();
const errs=[]; pg.on('pageerror',e=>errs.push(e.message));
await pg.goto('http://localhost:5173/',{waitUntil:'networkidle'});
await pg.waitForFunction(()=>document.querySelector('#loading')?.classList.contains('gone'),{timeout:30000});
await pg.click('.pcard'); await pg.waitForTimeout(1000);
await pg.evaluate(()=>window.__studio.seek(35)); await pg.waitForTimeout(300);
const info = await pg.evaluate(()=>{const S=window.__studio,t=S.time;
  const i=S.renderer.sections.findIndex(s=>t>=s[0]&&t<s[1]); S.tl.select(i);
  return {i,s:S.renderer.sections[i].slice(0,2)};});
await pg.waitForTimeout(300);

// «پایان اینجا»
await pg.evaluate(()=>window.__studio.seek(45));
await pg.click('#clipBar [data-act="setB"]'); await pg.waitForTimeout(400);
const a1 = await pg.evaluate(i=>window.__studio.renderer.sections[i].slice(0,2), info.i);
console.log(`پایان اینجا: ${info.s.map(x=>x.toFixed(0))} → ${a1.map(x=>x.toFixed(0))}`,
  Math.abs(a1[1]-45)<0.1?'✅':'❌');

// جا دادن + کشیدن لبه
await pg.click('#zFit'); await pg.waitForTimeout(500);
const box = await pg.locator('#tl').boundingBox();
const ex = await pg.evaluate(i=>{const S=window.__studio,b=document.querySelector('#tl').getBoundingClientRect();
  return b.left + S.tl.xOf(S.renderer.sections[i][1]);}, info.i);
console.log(`بعد از «جا دادن» لبه در x=${ex.toFixed(0)} از ${box.width.toFixed(0)}`,
  ex>0&&ex<box.width?'✅ در دسترس':'❌');
await pg.mouse.move(ex, box.y+36); await pg.mouse.down();
await pg.mouse.move(ex-55, box.y+36, {steps:8}); await pg.mouse.up();
await pg.waitForTimeout(400);
const a2 = await pg.evaluate(i=>window.__studio.renderer.sections[i].slice(0,2), info.i);
console.log('کشیدن لبه:', a2.map(x=>+x.toFixed(1)), a2[1]<a1[1]-0.3?'✅ کوتاه شد':'❌');
await pg.screenshot({path:'tests/t_fit.png'});
if(errs.length)console.log('خطا:',[...new Set(errs)].slice(0,3)); else console.log('✅ بدون خطا');
await b.close();
