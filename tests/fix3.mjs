import { chromium } from 'playwright';
const b = await chromium.launch({ args:['--no-sandbox'] });
const ctx = await b.newContext({ viewport:{width:412,height:915}, isMobile:true, hasTouch:true, deviceScaleFactor:2 });
const pg = await ctx.newPage();
const errs=[]; pg.on('pageerror',e=>errs.push('PAGEERROR: '+e.message));
pg.on('console',m=>{if(m.type()==='error'&&!/WebSocket|ERR_CONNECTION/.test(m.text()))errs.push(m.text());});
await pg.goto('http://localhost:5173/',{waitUntil:'networkidle'});
await pg.waitForFunction(()=>document.querySelector('#loading')?.classList.contains('gone'),{timeout:30000});
await pg.click('.pcard'); await pg.waitForTimeout(1200);
await pg.evaluate(()=>window.__studio.seek(33.5)); await pg.waitForTimeout(400);

// ── ۱) پنل داخل قاب می‌ماند؟
const geom = async () => pg.evaluate(()=>{
  const p=document.querySelector('#panes').getBoundingClientRect();
  const n=document.querySelector('.nav').getBoundingClientRect();
  const e=document.querySelector('.ebody').getBoundingClientRect();
  const tl=document.querySelector('.tlwrap').getBoundingClientRect();
  const cv=document.querySelector('#stage').getBoundingClientRect();
  const sw=document.querySelector('#stagewrap').getBoundingClientRect();
  return { panelBottom:Math.round(p.bottom), navTop:Math.round(n.top),
           overflow:Math.round(p.bottom-e.bottom), tlTop:Math.round(tl.top),
           tlVisible: tl.bottom<=p.top+1, panelH:Math.round(p.height),
           canvasOverflow: Math.round(cv.bottom-sw.bottom) };
});
let bad=0;
for (const t of ['lyrics','fx','words','look','export']) {
  await pg.click(`#nav button[data-go="${t}"]`); await pg.waitForTimeout(600);
  const g = await geom();
  const ok = g.overflow <= 1 && g.tlVisible && g.canvasOverflow <= 1;
  console.log(`  ${t.padEnd(8)} ارتفاع پنل ${g.panelH} · تایم‌لاین دیده می‌شود ${g.tlVisible?'✅':'❌'}` +
              ` · سرریز بوم ${g.canvasOverflow} ${ok?'✅':'❌'}`);
  if(!ok) bad++;
}

// ── ۲) پیش‌نمایش گالری حرکت می‌کند؟
await pg.click('#nav button[data-go="fx"]'); await pg.waitForTimeout(900);
const moving = await pg.evaluate(async ()=>{
  const c=document.querySelector('.fxcard canvas');
  const snap=()=>{const g=c.getContext('2d');const d=g.getImageData(0,0,c.width,c.height).data;
    let h=0;for(let i=0;i<d.length;i+=37)h=(h*31+d[i])|0;return h;};
  const a=snap(); await new Promise(r=>setTimeout(r,420)); const b2=snap();
  await new Promise(r=>setTimeout(r,420)); const c2=snap();
  return {same:a===b2&&b2===c2, a,b:b2,c:c2};
});
console.log('گالری افکت متحرک:', moving.same?'❌ ثابت است':'✅ حرکت می‌کند');
await pg.screenshot({path:'tests/x_fx.png'});

// ── ۳) پیش‌نمایش در تنظیمات خط
const box = await pg.locator('#tl').boundingBox();
const rows = await pg.evaluate(()=>window.__studio.tl.rows());
await pg.mouse.click(box.x+box.width/2, box.y+(rows.lyr[0]+rows.lyr[1])/2);
await pg.waitForTimeout(400);
await pg.click('#clipBar [data-act="opts"]'); await pg.waitForTimeout(900);
const mini = await pg.evaluate(()=>document.querySelectorAll('#clBody .fxcard canvas').length);
console.log('بوم پیش‌نمایش در تنظیمات خط:', mini, mini>0?'✅':'❌');
const moving2 = await pg.evaluate(async ()=>{
  const c=document.querySelector('#clBody .fxcard canvas');
  if(!c) return {same:true};
  const snap=()=>{const g=c.getContext('2d');const d=g.getImageData(0,0,c.width,c.height).data;
    let h=0;for(let i=0;i<d.length;i+=37)h=(h*31+d[i])|0;return h;};
  const a=snap(); await new Promise(r=>setTimeout(r,450)); return {same:a===snap()};
});
console.log('پیش‌نمایش تنظیمات خط متحرک:', moving2.same?'❌ ثابت':'✅ حرکت می‌کند');
await pg.screenshot({path:'tests/x_line.png'});
console.log(bad?`\n❌ ${bad} تب مشکل چیدمان داشت`:'\n✅ چیدمان درست');
if(errs.length)console.log('خطاها:',[...new Set(errs)].slice(0,4));
await b.close();
