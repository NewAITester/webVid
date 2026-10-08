import { chromium, devices } from 'playwright';
const b = await chromium.launch({ args: ['--no-sandbox'] });
const pg = await b.newPage({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const errs=[]; pg.on('pageerror',e=>errs.push('PAGEERROR: '+e.message));
pg.on('console',m=>{if(m.type()==='error'&&!/WebSocket|ERR_CONNECTION/.test(m.text()))errs.push(m.text());});
await pg.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
await pg.waitForFunction(() => document.querySelector('#loading')?.classList.contains('gone'), { timeout: 30000 });
await pg.waitForTimeout(600);

for (const tab of ['home','sections','words','look','export']) {
  await pg.click(`#nav button[data-go="${tab}"]`);
  await pg.waitForTimeout(500);
  if (tab==='words') await pg.evaluate(()=>window.__studio.seek(33.2));
  if (tab!=='home') await pg.waitForTimeout(350);
  await pg.screenshot({ path:`tests/tab_${tab}.png` });
  const vis = await pg.evaluate(t => {
    const p=document.querySelector(`.pane[data-pane="${t}"]`);
    return { pane:p?.classList.contains('on'), stage:!document.querySelector('#stagewrap').classList.contains('hide') };
  }, tab);
  console.log(`  ${tab.padEnd(9)} پنل=${vis.pane?'✅':'❌'}  صحنه=${vis.stage?'نمایش':'مخفی'}`);
}
// بررسی اینکه ویرایش بخش کار می‌کند
await pg.click('#nav button[data-go="sections"]'); await pg.waitForTimeout(400);
const n0 = await pg.evaluate(()=>document.querySelectorAll('#secList .srow').length);
await pg.click('#secAdd'); await pg.waitForTimeout(400);
const n1 = await pg.evaluate(()=>document.querySelectorAll('#secList .srow').length);
console.log(`\nبخش‌ها: ${n0} → ${n1} بعد از افزودن ${n1===n0+1?'✅':'❌'}`);
// تغییر سبک
await pg.selectOption('#secList .srow:nth-child(2) select','chorus');
await pg.waitForTimeout(400);
console.log('تغییر سبک بخش دوم:', await pg.evaluate(()=>window.__studio.renderer.sections[1][2]));
// ظاهر
await pg.click('#nav button[data-go="look"]'); await pg.waitForTimeout(300);
await pg.evaluate(()=>{const e=document.querySelector('#lkGrain');e.value=0;e.dispatchEvent(new Event('input'))});
await pg.waitForTimeout(300);
console.log('دانه بعد از صفر کردن:', await pg.evaluate(()=>window.__studio.renderer.grain));
if(errs.length) console.log('\nخطاها:', [...new Set(errs)].slice(0,5));
else console.log('\n✅ هیچ خطایی نیست');
await b.close();
