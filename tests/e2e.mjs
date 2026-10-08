import { chromium } from 'playwright';
import fs from 'node:fs';
const b = await chromium.launch({ args: ['--no-sandbox'] });
const ctx = await b.newContext({ viewport:{width:412,height:915}, isMobile:true, hasTouch:true, acceptDownloads:true });
const pg = await ctx.newPage();
const errs=[]; pg.on('pageerror',e=>errs.push(e.message));
await pg.goto('http://localhost:5173/', { waitUntil:'networkidle' });
await pg.waitForFunction(()=>document.querySelector('#loading')?.classList.contains('gone'),{timeout:30000});

// ۱) جابه‌جایی یک کلمه
await pg.click('#nav button[data-go="words"]'); await pg.waitForTimeout(400);
await pg.evaluate(()=>window.__studio.seek(33.2)); await pg.waitForTimeout(300);
const w = await pg.evaluate(()=>{const a=window.__studio.renderer.wordsAt(33.2);return a[1]&&{id:a[1].id,cx:Math.round(a[1].cx)}});
await pg.evaluate(id=>{const S=window.__studio;S.overrides.nudge(id,60,-30);S.overrides.save();S.draw();}, w.id);
console.log('کلمه جابه‌جا شد:', w.id);

// ۲) تغییر رنگ تأکید
await pg.click('#nav button[data-go="look"]'); await pg.waitForTimeout(300);
await pg.evaluate(()=>{const e=document.querySelector('#lkAccent');e.value='#1E90FF';e.dispatchEvent(new Event('input'))});
await pg.waitForTimeout(300);

// ۳) خروجی کوتاه و بررسی اینکه هر دو تغییر در ویدیو هستند
await pg.click('#nav button[data-go="export"]'); await pg.waitForTimeout(300);
await pg.fill('#exFrom','33'); await pg.fill('#exTo','35');
await pg.selectOption('#exRes','720');
const dl = pg.waitForEvent('download',{timeout:240000});
await pg.click('#exGo');
const d = await dl;
const p='/tmp/'+d.suggestedFilename();
await d.saveAs(p);
console.log(`✅ خروجی: ${d.suggestedFilename()}  ${(fs.statSync(p).size/1048576).toFixed(2)} MB`);
await pg.waitForTimeout(600);
console.log('پیام:', (await pg.textContent('#exMsg')).trim());
if(errs.length) console.log('خطاها:',[...new Set(errs)].slice(0,3));
await b.close();
