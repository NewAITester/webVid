import { chromium } from 'playwright';
const b = await chromium.launch({ args:['--no-sandbox'] });
const ctx = await b.newContext({ viewport:{width:412,height:915}, isMobile:true, hasTouch:true, deviceScaleFactor:2 });
const pg = await ctx.newPage();
const errs=[]; pg.on('pageerror',e=>errs.push('PAGEERROR: '+e.message));
pg.on('console',m=>{if(m.type()==='error'&&!/WebSocket|ERR_CONNECTION/.test(m.text()))errs.push(m.text());});
await pg.goto('http://localhost:5173/',{waitUntil:'networkidle'});
await pg.waitForFunction(()=>document.querySelector('#loading')?.classList.contains('gone'),{timeout:30000});
await pg.click('.pcard'); await pg.waitForTimeout(1000);
await pg.evaluate(()=>window.__studio.seek(33.5)); await pg.waitForTimeout(400);

const box = await pg.locator('#tl').boundingBox();
const rows = await pg.evaluate(()=>window.__studio.tl.rows());
const cx = box.x + box.width/2;

// ── ۱) انتخاب خط شعر
await pg.mouse.click(cx, box.y + (rows.lyr[0]+rows.lyr[1])/2);
await pg.waitForTimeout(400);
console.log('انتخاب خط:', await pg.evaluate(()=>JSON.stringify(window.__studio.tl.pick)),
  '| نوار:', (await pg.textContent('#cbName')).trim());
await pg.screenshot({path:'tests/p_line.png'});

// تنظیمات خط
await pg.click('#clipBar [data-act="opts"]'); await pg.waitForTimeout(500);
const nCtl = await pg.evaluate(()=>document.querySelectorAll('#clBody .ctl').length);
console.log('کنترل‌های خط:', nCtl, '| کارت افکت:', await pg.evaluate(()=>document.querySelectorAll('#clBody .fxcard').length));
await pg.screenshot({path:'tests/p_lineopts.png'});

// افکت فقط روی این خط
await pg.evaluate(()=>{const c=[...document.querySelectorAll('#clBody .fxcard')].find(x=>x.textContent.trim()==='نئون');c.click();});
await pg.waitForTimeout(500);
const lf = await pg.evaluate(()=>JSON.parse(JSON.stringify(window.__studio.lineFx)));
console.log('lineFx:', JSON.stringify(lf), Object.values(lf)[0]?.style==='neon'?'✅':'❌');
// آیا خط دیگر دست‌نخورده است؟
console.log('فقط یک خط تنظیم شده:', Object.keys(lf).length===1?'✅':'❌');

// ── ۲) اعمال روی همه
await pg.click('#clAll'); await pg.waitForTimeout(500);
console.log('بعد از «روی همه»:', await pg.evaluate(()=>Object.keys(window.__studio.lineFx).length), 'خط');

// ── ۳) متن آزاد
await pg.click('#txtAdd'); await pg.waitForTimeout(600);
console.log('متن تازه:', await pg.evaluate(()=>window.__studio.texts.length), '| پنل:',
  (await pg.textContent('#clHead')).trim().split('اعمال')[0].trim());
await pg.evaluate(()=>{const i=[...document.querySelectorAll('#clBody .ctl input')][0];
  i.value='سلام دنیا'; i.dispatchEvent(new Event('input'));});
await pg.waitForTimeout(400);
await pg.screenshot({path:'tests/p_text.png'});
console.log('متن:', await pg.evaluate(()=>window.__studio.texts[0].text));

// کشیدن متن روی بوم
const cv = await pg.locator('#stage').boundingBox();
const p0 = await pg.evaluate(()=>({x:window.__studio.texts[0].x,y:window.__studio.texts[0].y}));
await pg.mouse.move(cv.x+cv.width/2, cv.y+cv.height/2); await pg.mouse.down();
await pg.mouse.move(cv.x+cv.width/2+50, cv.y+cv.height/2-40,{steps:8}); await pg.mouse.up();
await pg.waitForTimeout(400);
const p1 = await pg.evaluate(()=>({x:window.__studio.texts[0].x,y:window.__studio.texts[0].y}));
console.log('کشیدن متن:', JSON.stringify(p0.x.toFixed(2)), '→', JSON.stringify(p1.x.toFixed(2)),
  (p1.x!==p0.x||p1.y!==p0.y)?'✅ جابه‌جا شد':'❌');
await pg.screenshot({path:'tests/p_drag.png'});
if(errs.length)console.log('خطاها:',[...new Set(errs)].slice(0,4)); else console.log('✅ بدون خطا');
await b.close();
