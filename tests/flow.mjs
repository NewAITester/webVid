import { chromium } from 'playwright';
import fs from 'node:fs';
const b = await chromium.launch({ args:['--no-sandbox'] });
const ctx = await b.newContext({ viewport:{width:412,height:915}, isMobile:true, hasTouch:true, acceptDownloads:true });
const pg = await ctx.newPage();
const errs=[]; pg.on('pageerror',e=>errs.push('PAGEERROR: '+e.message));
pg.on('console',m=>{if(m.type()==='error'&&!/WebSocket|ERR_CONNECTION/.test(m.text()))errs.push(m.text());});
await pg.goto('http://localhost:5173/',{waitUntil:'networkidle'});
await pg.waitForFunction(()=>document.querySelector('#loading')?.classList.contains('gone'),{timeout:30000});
await pg.waitForTimeout(500);
await pg.screenshot({path:'tests/n_home.png'});

// ۱) پروژهٔ جدید عمودی
await pg.click('#newProj'); await pg.waitForTimeout(400);
await pg.fill('#nwName','کلیپ عمودی'); await pg.fill('#nwArtist','زروان اکو');
await pg.fill('#nwTg','Telegram: @ZurvanEcho');
await pg.screenshot({path:'tests/n_sheet.png'});
await pg.click('#nwAspect .asp:nth-child(2)');       // ۹:۱۶
await pg.waitForTimeout(200);
await pg.click('#nwGo'); await pg.waitForTimeout(900);
console.log('ابعاد صحنه پس از ساخت:', await pg.evaluate(()=>{const c=document.querySelector('#stage');return c.width+'×'+c.height}));
await pg.screenshot({path:'tests/n_empty.png'});

// ۲) افزودن آهنگ و شعر
const mp3 = await (await fetch('http://localhost:5173/data/Neghab.mp3')).arrayBuffer();
const lrc = await (await fetch('http://localhost:5173/data/lyrics.lrc')).text();
await pg.setInputFiles('#inLrc',{name:'l.lrc',mimeType:'text/plain',buffer:Buffer.from(lrc,'utf8')});
await pg.waitForTimeout(800);
await pg.setInputFiles('#inAudio',{name:'t.mp3',mimeType:'audio/mpeg',buffer:Buffer.from(mp3)});
for(let i=0;i<40;i++){ await pg.waitForTimeout(1500);
  const m=(await pg.textContent('#songMsg')).trim();
  if(/آماده|خطا/.test(m)){console.log('→',m);break;} }

await pg.click('#nav button[data-go="sections"]'); await pg.waitForTimeout(600);
await pg.evaluate(()=>window.__studio.seek(33.2)); await pg.waitForTimeout(400);
await pg.screenshot({path:'tests/n_vertical.png'});
console.log('بخش‌ها:', await pg.evaluate(()=>(window.__studio.renderer.sections||[]).length));

// ۳) خروجی عمودی
await pg.click('#nav button[data-go="export"]'); await pg.waitForTimeout(300);
await pg.fill('#exFrom','33'); await pg.fill('#exTo','35');
await pg.selectOption('#exRes','720'); await pg.waitForTimeout(300);
console.log('برآورد:', (await pg.textContent('#exEst')).trim());
const dl=pg.waitForEvent('download',{timeout:240000});
await pg.click('#exGo');
const d=await dl; const p='/tmp/'+d.suggestedFilename(); await d.saveAs(p);
console.log(`✅ ${d.suggestedFilename()} ${(fs.statSync(p).size/1048576).toFixed(2)} MB`);
if(errs.length)console.log('خطاها:',[...new Set(errs)].slice(0,4)); else console.log('✅ بدون خطا');
await b.close();
