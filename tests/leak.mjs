import { chromium } from 'playwright';
const b = await chromium.launch({ args:['--no-sandbox'] });
const ctx = await b.newContext({ viewport:{width:412,height:915}, isMobile:true, hasTouch:true });
const pg = await ctx.newPage();
const errs=[]; pg.on('pageerror',e=>errs.push(e.message));
await pg.goto('http://localhost:5173/',{waitUntil:'networkidle'});
await pg.waitForFunction(()=>document.querySelector('#loading')?.classList.contains('gone'),{timeout:30000});

const mp3 = await (await fetch('http://localhost:5173/data/Neghab.mp3')).arrayBuffer();
const lrc = await (await fetch('http://localhost:5173/data/lyrics.lrc')).text();

async function makeProject(name){
  await pg.click('#nav button[data-go="home"]'); await pg.waitForTimeout(250);
  await pg.click('#newProj'); await pg.waitForTimeout(300);
  await pg.fill('#nwName', name);
  await pg.click('#nwGo'); await pg.waitForTimeout(700);
  await pg.setInputFiles('#inLrc',{name:'l.lrc',mimeType:'text/plain',buffer:Buffer.from(lrc,'utf8')});
  await pg.waitForTimeout(600);
  await pg.setInputFiles('#inAudio',{name:'a.mp3',mimeType:'audio/mpeg',buffer:Buffer.from(mp3)});
  for(let i=0;i<40;i++){ await pg.waitForTimeout(1500);
    const m=(await pg.textContent('#songMsg')).trim(); if(/آماده|خطا/.test(m)) return m; }
}
console.log('پروژهٔ ۱:', await makeProject('پروژه یک'));

// تغییرات روی پروژهٔ ۱
await pg.click('#nav button[data-go="look"]'); await pg.waitForTimeout(300);
await pg.evaluate(()=>{const e=document.querySelector('#lkAccent');e.value='#00BFFF';e.dispatchEvent(new Event('input'));
  const g=document.querySelector('#lkGrain');g.value=0;g.dispatchEvent(new Event('input'));});
await pg.click('#nav button[data-go="words"]'); await pg.waitForTimeout(300);
await pg.evaluate(()=>window.__studio.seek(33.2)); await pg.waitForTimeout(300);
await pg.evaluate(()=>{const S=window.__studio;const w=S.renderer.wordsAt(33.2);
  if(w[1]){S.overrides.nudge(w[1].id,99,-44);S.overrides.save();}});
await pg.waitForTimeout(600);
const s1 = await pg.evaluate(()=>({grain:window.__studio.look.grain,
  acc:JSON.stringify(window.__studio.look.accents), ov:Object.keys(window.__studio.overrides.map).length}));
console.log('حالت پروژهٔ ۱:', JSON.stringify(s1));

// پروژهٔ ۲ — باید کاملاً تمیز باشد
console.log('پروژهٔ ۲:', await makeProject('پروژه دو'));
const s2 = await pg.evaluate(()=>({grain:window.__studio.look.grain,
  acc:JSON.stringify(window.__studio.look.accents), ov:Object.keys(window.__studio.overrides.map).length}));
console.log('حالت پروژهٔ ۲:', JSON.stringify(s2));
const clean = s2.grain===0.024 && s2.acc==='{}' && s2.ov===0;
console.log(clean? '✅ پروژهٔ جدید کاملاً دست‌نخورده است' : '❌ هنوز نشت می‌کند');

// بازگشت به پروژهٔ ۱ — باید تغییراتش سر جایش باشد
await pg.click('#nav button[data-go="home"]'); await pg.waitForTimeout(300);
await pg.evaluate(()=>{const c=[...document.querySelectorAll('.pcard')].find(e=>e.textContent.includes('پروژه یک'));c.click();});
await pg.waitForTimeout(1200);
const s3 = await pg.evaluate(()=>({grain:window.__studio.look.grain,
  acc:JSON.stringify(window.__studio.look.accents), ov:Object.keys(window.__studio.overrides.map).length}));
console.log('بازگشت به پروژهٔ ۱:', JSON.stringify(s3));
console.log(s3.grain===0 && s3.ov===1 ? '✅ تغییرات پروژهٔ ۱ حفظ شد' : '❌ تغییرات گم شد');
if(errs.length)console.log('خطاها:',[...new Set(errs)].slice(0,3));
await b.close();
