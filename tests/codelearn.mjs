import { chromium } from 'playwright';
const b = await chromium.launch({ args:['--no-sandbox'] });
const pg = await b.newPage({ viewport:{width:412,height:915}, isMobile:true, hasTouch:true });
const errs=[]; pg.on('pageerror',e=>errs.push('PAGEERROR: '+e.message));
pg.on('console',m=>{if(m.type()==='error'&&!/WebSocket|ERR_CONNECTION/.test(m.text()))errs.push(m.text());});
await pg.goto('http://localhost:5173/',{waitUntil:'networkidle'});
await pg.waitForFunction(()=>document.querySelector('#loading')?.classList.contains('gone'),{timeout:30000});

// شیت بیشتر
await pg.click('#moreBtn'); await pg.waitForTimeout(400);
await pg.screenshot({path:'tests/c_more.png'});

// ── آموزش
await pg.click('[data-more="learn"]'); await pg.waitForTimeout(500);
const nLes = await pg.evaluate(()=>document.querySelectorAll('.litem').length);
console.log('تعداد درس:', nLes);
await pg.screenshot({path:'tests/c_learnlist.png'});
await pg.click('.litem:nth-of-type(2)'); await pg.waitForTimeout(400);
const hasLv = await pg.evaluate(()=>document.querySelectorAll('#lnBody .lvl').length);
console.log('لایه‌های درس باز شده:', hasLv);
await pg.screenshot({path:'tests/c_lesson.png'});
await pg.click('#lnBack'); await pg.waitForTimeout(300);

// ── کد سفارشی
await pg.click('#moreBtn'); await pg.waitForTimeout(300);
await pg.click('[data-more="code"]'); await pg.waitForTimeout(500);
console.log('پیام اولیه:', (await pg.textContent('#cdMsg')).trim());

// یک بخش را سفارشی کن
await pg.evaluate(()=>{ const S=window.__studio; S.renderer.sections=[[0,228.6,'custom','#E4142A']]; S.seek(33.4); });
await pg.waitForTimeout(400);
await pg.locator('#stage').screenshot({path:'tests/c_fx_default.png'});

// کد غلط → باید خطا بدهد و نسوزد
await pg.fill('#cdText','this is not ( valid javascript');
await pg.waitForTimeout(800);
console.log('با کد غلط:', (await pg.textContent('#cdMsg')).trim().slice(0,60));

// کد درست و متفاوت
await pg.fill('#cdText', `const { rect, clamp } = e.fx;
for (let i = 0; i < 12; i++) {
  const x = (i / 12) * e.W;
  const h = (0.1 + 0.6 * clamp(e.kick + Math.sin(e.t * 2 + i) * 0.4)) * e.H;
  rect(ctx, x + 6, (e.H - h) / 2, e.W / 12 - 12, h, e.acc, 0.5);
}
e.fx.textFa(ctx, e.line ? e.line.text : '', e.W/2, e.H*0.5, 90 * e.fx.SF(), '#F6F3EC', e.a);`);
await pg.waitForTimeout(900);
console.log('با کد درست:', (await pg.textContent('#cdMsg')).trim());
await pg.locator('#stage').screenshot({path:'tests/c_fx_custom.png'});

// آیا بعد از بارگذاری دوباره می‌ماند؟
await pg.reload({waitUntil:'networkidle'});
await pg.waitForFunction(()=>document.querySelector('#loading')?.classList.contains('gone'),{timeout:30000});
const kept = await pg.evaluate(()=>window.__studio.renderer.customFx.code.includes('for (let i = 0; i < 12'));
console.log(kept ? '✅ کد ذخیره شد' : '❌ کد گم شد');
if(errs.length)console.log('خطاها:',[...new Set(errs)].slice(0,4)); else console.log('✅ بدون خطای صفحه');
await b.close();
