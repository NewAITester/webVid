import { chromium } from 'playwright';
const b = await chromium.launch({ args: ['--no-sandbox'] });
const pg = await b.newPage({ viewport: { width: 1400, height: 980 } });
const errs=[]; pg.on('pageerror',e=>errs.push(e.message));
await pg.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
await pg.waitForFunction(() => document.querySelector('#loading')?.classList.contains('gone'), { timeout: 25000 });
await pg.click('#songBtn'); await pg.waitForTimeout(400);
// پروژهٔ قبلی را باز کن
const opts = await pg.evaluate(()=>[...document.querySelectorAll('#songList option')].map(o=>o.value));
if (opts.length<2){ console.log('پروژه‌ای در کتابخانه نیست'); await b.close(); process.exit(0); }
await pg.selectOption('#songList', opts[1]);
await pg.click('#songLoad'); await pg.waitForTimeout(800);
await pg.fill('#inTitle','سایه'); await pg.fill('#inArtist','هنرمند تست');
await pg.fill('#inTg','Telegram: @TestChan');
await pg.click('#metaApply'); await pg.waitForTimeout(500);
const v = await pg.evaluate(()=>({t:window.__studio.song.title,a:window.__studio.song.artist,g:window.__studio.song.tg}));
console.log('متادیتا:', JSON.stringify(v));
await pg.evaluate(()=>window.__studio.seek(2.0)); await pg.waitForTimeout(400);
await pg.locator('#stage').screenshot({path:'tests/meta.png'});
if(errs.length) console.log('خطا:',[...new Set(errs)].slice(0,3));
await b.close();
