import { chromium } from 'playwright';
const b = await chromium.launch({ args: ['--no-sandbox'] });
const pg = await b.newPage({ viewport: { width: 1400, height: 950 } });
const errs=[]; pg.on('pageerror',e=>errs.push(e.message));
await pg.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
await pg.waitForFunction(() => document.querySelector('#loading')?.classList.contains('gone'), { timeout: 25000 });

await pg.evaluate(() => window.__studio.overrides.clearAll());
await pg.evaluate(() => window.dispatchEvent(new CustomEvent('seek-test', { detail: 33.2 })));
await pg.click('#editBtn');
await pg.waitForTimeout(300);

// کلمات موجود در این لحظه
const words = await pg.evaluate(() => window.__studio.renderer.wordsAt(window.__studio.time)
  .map(w => ({ id:w.id, word:w.word, cx:Math.round(w.cx), cy:Math.round(w.cy), w:Math.round(w.w) })));
console.log('کلمات قابل ویرایش:', words.map(w=>w.word).join(' · '));
if (!words.length) { console.log('❌ هیچ کلمه‌ای'); await b.close(); process.exit(1); }

const target = words[Math.floor(words.length/2)];
console.log(`هدف: « ${target.word} »  در (${target.cx}, ${target.cy})`);

// تبدیل مختصات طراحی به مختصات صفحه
const scr = await pg.evaluate(({x,y}) => {
  const c=document.querySelector('#stage'); const r=c.getBoundingClientRect();
  const sc=Math.min(c.width/1920, c.height/1080);
  const ox=(c.width-1920*sc)/2, oy=(c.height-1080*sc)/2;
  return { X: r.left + (x*sc+ox)*(r.width/c.width), Y: r.top + (y*sc+oy)*(r.height/c.height) };
}, {x:target.cx,y:target.cy});

await pg.mouse.move(scr.X, scr.Y);
await pg.mouse.down();
for (let i=1;i<=8;i++) await pg.mouse.move(scr.X + i*8, scr.Y - i*5);
await pg.mouse.up();
await pg.waitForTimeout(250);

const ov = await pg.evaluate(() => JSON.parse(JSON.stringify(window.__studio.overrides.map)));
console.log('افست ذخیره‌شده:', JSON.stringify(ov));
const o = ov[target.id];
console.log(o ? `✅ کلمه جابه‌جا شد: dx=${o.dx} dy=${o.dy}` : '❌ افستی ثبت نشد');

// آیا بعد از بارگذاری دوباره باقی می‌ماند؟
await pg.reload({ waitUntil: 'networkidle' });
await pg.waitForFunction(() => document.querySelector('#loading')?.classList.contains('gone'), { timeout: 25000 });
const ov2 = await pg.evaluate(() => JSON.parse(JSON.stringify(window.__studio.overrides.map)));
console.log(ov2[target.id] ? '✅ بعد از بارگذاری دوباره باقی ماند' : '❌ ذخیره نشد');

// آیا در رندر واقعاً اعمال می‌شود؟
await pg.evaluate(() => window.dispatchEvent(new CustomEvent('seek-test', { detail: 33.2 })));
const after = await pg.evaluate(id => {
  const w = window.__studio.renderer.wordsAt(window.__studio.time).find(x=>x.id===id);
  return w ? { cx: Math.round(w.cx), cy: Math.round(w.cy), moved: !!w.moved } : null;
}, target.id);
console.log('جای جدید در رندر:', JSON.stringify(after),
  after && after.cx !== target.cx ? '✅ اعمال شد' : '❌ اعمال نشد');
if (errs.length) console.log('خطاها:', [...new Set(errs)].slice(0,3));
await b.close();
