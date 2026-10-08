import { chromium } from 'playwright';
const b = await chromium.launch({ args: ['--no-sandbox'] });
const pg = await b.newPage({ viewport: { width: 1400, height: 950 } });
const errs=[]; pg.on('pageerror',e=>errs.push('PAGEERROR: '+e.message));
pg.on('console',m=>{if(m.type()==='error'&&!/WebSocket|ERR_CONNECTION/.test(m.text()))errs.push('ERR: '+m.text());});
await pg.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
await pg.waitForFunction(() => document.querySelector('#loading')?.classList.contains('gone'), { timeout: 25000 });

await pg.click('#songBtn');
await pg.waitForTimeout(300);
// همان mp3 را به‌عنوان «آهنگ جدید» وارد می‌کنیم، با شعر ساده (بدون تایم)
const mp3 = await (await fetch('http://localhost:5173/data/Neghab.mp3')).arrayBuffer();
await pg.setInputFiles('#inAudio', { name:'MyTrack.mp3', mimeType:'audio/mpeg', buffer: Buffer.from(mp3) });
await pg.setInputFiles('#inLrc', { name:'words.txt', mimeType:'text/plain',
  buffer: Buffer.from('خط اول شعر من\nخط دوم کمی بلندتر است\nخط سوم\nخط چهارم پایانی','utf8') });
await pg.click('#songGo');

for (let i=0;i<40;i++){
  await pg.waitForTimeout(1500);
  const m=(await pg.textContent('#songMsg')).trim();
  if (/آماده شد|خطا/.test(m)) { console.log('نتیجه:', m); break; }
  if (i%4===0) console.log(`  [${i*1.5}s]`, m);
}
const st = await pg.evaluate(() => {
  const S=window.__studio;
  return { lines:S.song.lines.length, beats:S.song.beats.length, tempo:+S.song.A.tempo.toFixed(1),
           sections:(S.renderer.sections||[]).length,
           styles:(S.renderer.sections||[]).map(s=>s[2]).join(',') };
});
console.log('وضعیت:', JSON.stringify(st,null,1));
await pg.evaluate(()=>window.__studio.seek(30));
await pg.waitForTimeout(400);
await pg.screenshot({ path:'tests/imported.png' });
// بررسی ماندگاری
await pg.reload({waitUntil:'networkidle'});
await pg.waitForFunction(() => document.querySelector('#loading')?.classList.contains('gone'), { timeout: 25000 });
await pg.click('#songBtn'); await pg.waitForTimeout(500);
const opts = await pg.evaluate(()=>[...document.querySelectorAll('#songList option')].map(o=>o.textContent));
console.log('کتابخانه پس از بارگذاری دوباره:', JSON.stringify(opts));
if(errs.length) console.log('خطاها:', [...new Set(errs)].slice(0,4));
await b.close();
