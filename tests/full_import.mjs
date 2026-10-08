import { chromium } from 'playwright';
const b = await chromium.launch({ args: ['--no-sandbox'] });
const pg = await b.newPage({ viewport: { width: 1400, height: 980 } });
const errs=[]; pg.on('pageerror',e=>errs.push('PAGEERROR: '+e.message));
pg.on('console',m=>{if(m.type()==='error'&&!/WebSocket|ERR_CONNECTION/.test(m.text()))errs.push(m.text());});
await pg.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
await pg.waitForFunction(() => document.querySelector('#loading')?.classList.contains('gone'), { timeout: 25000 });
await pg.click('#songBtn'); await pg.waitForTimeout(300);
const mp3 = await (await fetch('http://localhost:5173/data/Neghab.mp3')).arrayBuffer();
await pg.setInputFiles('#inAudio', { name:'Saye.mp3', mimeType:'audio/mpeg', buffer: Buffer.from(mp3) });
await pg.setInputFiles('#inLrc', { name:'w.txt', mimeType:'text/plain',
  buffer: Buffer.from('شب از پنجره می‌افتد\nو من هنوز بیدارم\nصدای تو می‌آید\nاز جایی که نیست','utf8') });
await pg.fill('#inTitle','سایه'); await pg.fill('#inArtist','هنرمند تست');
await pg.fill('#inTg','Telegram: @TestChan');
await pg.click('#songGo');
for (let i=0;i<40;i++){
  await pg.waitForTimeout(1500);
  const m=(await pg.textContent('#songMsg')).trim();
  if (/آماده شد|خطا/.test(m)) { console.log('→', m); break; }
}
const v = await pg.evaluate(()=>({t:window.__studio.song.title,a:window.__studio.song.artist,
  g:window.__studio.song.tg, dur:+window.__studio.song.duration.toFixed(1)}));
console.log('متادیتا:', JSON.stringify(v));
await pg.evaluate(()=>window.__studio.seek(2.2)); await pg.waitForTimeout(400);
await pg.locator('#stage').screenshot({path:'tests/meta.png'});
await pg.locator('#strip').screenshot({path:'tests/strip.png'});
console.log('تعداد بخش:', await pg.evaluate(()=>(window.__studio.renderer.sections||[]).length));
console.log('آیا متن آهنگ قبلی در تصاویر مانده؟',
  await pg.evaluate(()=>{
    const S=window.__studio;
    const bad=[];
    for (const sec of (S.renderer.sections||[])) {
      const t0=sec[0]+0.3;
      const ws=S.renderer.wordsAt(t0).map(w=>w.word).join(' ');
      if (/نقاب|زروان|آینه‌ها|تاریکی/.test(ws)) bad.push(sec[2]+':'+ws.slice(0,20));
    }
    return bad.length? bad : 'نه، همه از آهنگ جدیدند';
  }));
if(errs.length) console.log('خطاها:',[...new Set(errs)].slice(0,4));
await b.close();
