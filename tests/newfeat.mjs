import { chromium } from 'playwright';
const b = await chromium.launch({ args:['--no-sandbox'] });
const ctx = await b.newContext({ viewport:{width:412,height:915}, isMobile:true, hasTouch:true, deviceScaleFactor:2 });
const pg = await ctx.newPage();
const errs=[]; pg.on('pageerror',e=>errs.push('PAGEERROR: '+e.message));
pg.on('console',m=>{if(m.type()==='error'&&!/WebSocket|ERR_CONNECTION/.test(m.text()))errs.push(m.text());});
await pg.goto('http://localhost:5173/',{waitUntil:'networkidle'});
await pg.waitForFunction(()=>document.querySelector('#loading')?.classList.contains('gone'),{timeout:30000});

// پروژهٔ تازه با آهنگ
const mp3 = await (await fetch('http://localhost:5173/data/Neghab.mp3')).arrayBuffer();
await pg.click('#newProj'); await pg.waitForTimeout(300);
await pg.fill('#nwName','تست'); await pg.click('#nwGo'); await pg.waitForTimeout(800);
await pg.setInputFiles('#inAudio',{name:'a.mp3',mimeType:'audio/mpeg',buffer:Buffer.from(mp3)});
for(let i=0;i<40;i++){await pg.waitForTimeout(1500);
  const m=(await pg.textContent('#songMsg')).trim(); if(/آماده|خطا/.test(m)){console.log('آهنگ:',m);break;}}
await pg.click('#pjX').catch(()=>{}); await pg.waitForTimeout(300);

// ── ۱) نوشتن شعر دستی
await pg.click('#nav button[data-go="lyrics"]'); await pg.waitForTimeout(400);
await pg.fill('#lyText','شب از پنجره می‌افتد\nو من هنوز بیدارم\nصدای تو می‌آید\nاز جایی که نیست');
await pg.click('#lyApply'); await pg.waitForTimeout(1200);
console.log('بعد از اعمال شعر:', (await pg.textContent('#lyMsg')).trim(),
  '| خطوط:', await pg.evaluate(()=>window.__studio.song.lines.length));
await pg.screenshot({path:'tests/f_lyrics.png'});

// ── ۲) هم‌زمان‌سازی ضربه‌ای
await pg.click('#lySync'); await pg.waitForTimeout(400);
for (const t of [12, 18, 25, 33]) {
  await pg.evaluate(x=>window.__studio.seek(x), t);
  await pg.click('#syncTap'); await pg.waitForTimeout(200);
}
await pg.screenshot({path:'tests/f_sync.png'});
console.log('دکمه بعد از ۴ ضربه:', (await pg.textContent('#syncTap')).trim());
await pg.click('#syncTap'); await pg.waitForTimeout(1200);
const t0 = await pg.evaluate(()=>window.__studio.song.lines.map(l=>+l.words[0].t.toFixed(1)));
console.log('زمان خطوط بعد از هم‌زمان‌سازی:', JSON.stringify(t0),
  JSON.stringify(t0)==='[12,18,25,33]' ? '✅' : '⚠');

// ── ۳) گالری افکت
await pg.click('#nav button[data-go="fx"]'); await pg.waitForTimeout(900);
const nFx = await pg.evaluate(()=>document.querySelectorAll('.fxcard').length);
console.log('کارت افکت در دستهٔ حرکتی:', nFx);
await pg.screenshot({path:'tests/f_gallery.png'});
await pg.click('#fxCats .chip:nth-child(3)'); await pg.waitForTimeout(900);
console.log('دستهٔ نمایشی:', await pg.evaluate(()=>document.querySelectorAll('.fxcard').length));
await pg.screenshot({path:'tests/f_gallery2.png'});
await pg.click('.fxcard:nth-child(2)'); await pg.waitForTimeout(600);
console.log('سبک بخش فعال:', await pg.evaluate(()=>{
  const S=window.__studio; const t=S.time;
  return (S.renderer.sections||[]).find(x=>t>=x[0]&&t<x[1])?.[2];}));

// ── ۴) افکت سفارشی تازه از کد
await pg.click('#cfAdd'); await pg.waitForTimeout(700);
console.log('تعداد افکت سفارشی:', await pg.evaluate(()=>window.__studio.renderer.customSet.count));
await pg.fill('#cdName','افکت واردشده');
await pg.fill('#cdText', 'const {rect}=e.fx;\nfor(let i=0;i<8;i++) rect(ctx, i*e.W/8+8, e.H*0.4, e.W/8-16, e.H*0.2*(0.3+e.kick), e.acc, 0.7);');
await pg.waitForTimeout(900);
console.log('پیام کد:', (await pg.textContent('#cdMsg')).trim());
await pg.screenshot({path:'tests/f_code.png'});
if(errs.length)console.log('خطاها:',[...new Set(errs)].slice(0,4)); else console.log('✅ بدون خطا');
await b.close();
