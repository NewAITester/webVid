import { chromium } from 'playwright';
const b = await chromium.launch({ args:['--no-sandbox'] });
const pg = await b.newPage({ viewport:{width:412,height:915}, isMobile:true, hasTouch:true, deviceScaleFactor:2 });
const errs=[]; pg.on('pageerror',e=>errs.push('PAGEERROR: '+e.message));
pg.on('console',m=>{if(m.type()==='error'&&!/WebSocket|ERR_CONNECTION/.test(m.text()))errs.push(m.text());});
await pg.goto('http://localhost:5173/',{waitUntil:'networkidle'});
await pg.waitForFunction(()=>document.querySelector('#loading')?.classList.contains('gone'),{timeout:30000});
await pg.waitForTimeout(600);

const scr = () => pg.evaluate(()=>document.getElementById('app').dataset.screen);
console.log('صفحهٔ شروع:', await scr());
await pg.screenshot({path:'tests/u_library.png'});

// ورود به ویرایشگر
await pg.click('.pcard'); await pg.waitForTimeout(900);
console.log('بعد از کلیک روی پروژه:', await scr());
await pg.screenshot({path:'tests/u_editor.png'});

// همهٔ تب‌ها
for (const t of ['sections','words','look','code','export']) {
  await pg.click(`#nav button[data-go="${t}"]`); await pg.waitForTimeout(400);
  if (t==='words') { await pg.evaluate(()=>window.__studio.seek(33.2)); await pg.waitForTimeout(300); }
  const on = await pg.evaluate(x=>document.querySelector(`.pane[data-pane="${x}"]`).classList.contains('on'), t);
  process.stdout.write(`${t}${on?'✅':'❌'}  `);
  if (t==='look'||t==='export') await pg.screenshot({path:`tests/u_${t}.png`});
}
console.log();

// شیت تنظیمات
await pg.click('#gearBtn'); await pg.waitForTimeout(400);
await pg.screenshot({path:'tests/u_settings.png'});
await pg.click('#pjX'); await pg.waitForTimeout(250);

// بازگشت و آموزش
await pg.click('#backBtn'); await pg.waitForTimeout(400);
console.log('بعد از بازگشت:', await scr());
await pg.click('#learnBtn'); await pg.waitForTimeout(500);
console.log('آموزش:', await scr(), '| درس‌ها:', await pg.evaluate(()=>document.querySelectorAll('.litem').length));
await pg.click('.litem'); await pg.waitForTimeout(400);
await pg.screenshot({path:'tests/u_lesson.png'});
await pg.click('#lnBack'); await pg.waitForTimeout(300);
await pg.click('#lnBack'); await pg.waitForTimeout(300);
console.log('بازگشت از آموزش:', await scr());

// شیت پروژهٔ جدید
await pg.click('#newProj'); await pg.waitForTimeout(400);
await pg.screenshot({path:'tests/u_new.png'});
if(errs.length)console.log('خطاها:',[...new Set(errs)].slice(0,4)); else console.log('✅ بدون خطا');
await b.close();
