import { chromium } from 'playwright';
const b = await chromium.launch({ args:['--no-sandbox'] });
const ctx = await b.newContext({ viewport:{width:412,height:915}, isMobile:true, hasTouch:true, deviceScaleFactor:2 });
const pg = await ctx.newPage();
const errs=[]; pg.on('pageerror',e=>errs.push('PAGEERROR: '+e.message));
pg.on('console',m=>{if(m.type()==='error'&&!/WebSocket|ERR_CONNECTION/.test(m.text()))errs.push(m.text());});
await pg.goto('http://localhost:5173/',{waitUntil:'networkidle'});
await pg.waitForFunction(()=>document.querySelector('#loading')?.classList.contains('gone'),{timeout:30000});
await pg.click('.pcard'); await pg.waitForTimeout(1000);
await pg.evaluate(()=>window.__studio.seek(35));
await pg.waitForTimeout(500);
await pg.screenshot({path:'tests/t_main.png'});

const box = await pg.locator('#tl').boundingBox();
const cx = box.x + box.width/2, cy = box.y;

// کشیدن = اسکراب
await pg.mouse.move(cx, cy+30); await pg.mouse.down();
await pg.mouse.move(cx+90, cy+30, {steps:8}); await pg.mouse.up();
await pg.waitForTimeout(300);
console.log('بعد از کشیدن:', (await pg.evaluate(()=>+window.__studio.time.toFixed(1))), 'ثانیه (از ۳۵)');

// ضربهٔ کوتاه روی لایهٔ بخش = انتخاب
await pg.mouse.click(cx, cy+36);
await pg.waitForTimeout(400);
const sel = await pg.evaluate(()=>({sel:window.__studio.tl.sel, bar:!document.querySelector('#clipBar').classList.contains('hidden'),
  name:document.querySelector('#cbName').textContent}));
console.log('انتخاب:', JSON.stringify(sel));
await pg.screenshot({path:'tests/t_sel.png'});

// تقسیم
const before = await pg.evaluate(()=>window.__studio.renderer.sections.length);
await pg.click('#clipBar [data-act="split"]'); await pg.waitForTimeout(400);
const after = await pg.evaluate(()=>window.__studio.renderer.sections.length);
console.log(`تقسیم: ${before} → ${after}`, after===before+1?'✅':'❌');

// بزرگ‌نمایی
const z0 = await pg.evaluate(()=>window.__studio.tl.pps);
await pg.click('#zIn'); await pg.click('#zIn'); await pg.waitForTimeout(300);
console.log('بزرگ‌نمایی:', z0, '→', await pg.evaluate(()=>window.__studio.tl.pps));
await pg.screenshot({path:'tests/t_zoom.png'});

// کشیدن لبه
await pg.evaluate(()=>{ const S=window.__studio; S.tl.select(1); });
await pg.waitForTimeout(300);
const e0 = await pg.evaluate(()=>window.__studio.renderer.sections[1].slice(0,2));
const ex = await pg.evaluate(()=>{const S=window.__studio;const b=document.querySelector('#tl').getBoundingClientRect();
  return b.left + S.tl.xOf(S.renderer.sections[1][1]);});
await pg.mouse.move(ex, cy+36); await pg.mouse.down();
await pg.mouse.move(ex-40, cy+36, {steps:6}); await pg.mouse.up();
await pg.waitForTimeout(400);
const e1 = await pg.evaluate(()=>window.__studio.renderer.sections[1].slice(0,2));
console.log('لبه:', JSON.stringify(e0.map(x=>+x.toFixed(1))), '→', JSON.stringify(e1.map(x=>+x.toFixed(1))),
  e1[1]<e0[1]?'✅ کوتاه شد':'⚠');
if(errs.length)console.log('خطاها:',[...new Set(errs)].slice(0,4)); else console.log('✅ بدون خطا');
await b.close();
