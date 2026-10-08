import { chromium } from 'playwright';
import fs from 'node:fs';
const b = await chromium.launch({ args: ['--no-sandbox'] });
const pg = await b.newPage({ viewport: { width: 1280, height: 950 } });
const errs=[]; pg.on('pageerror',e=>errs.push(e.message));
await pg.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
await pg.waitForFunction(() => document.querySelector('#loading')?.classList.contains('gone'), { timeout: 25000 });
for (const [res, w, h, fps, br] of [['720',1280,720,30,6],['1080',1920,1080,60,12]]) {
  const t0=Date.now();
  const b64 = await pg.evaluate(async ({w,h,fps,br}) => {
    const S=window.__studio;
    const blob = await S.exportVideo({ song:S.song, from:66, to:68, width:w, height:h, fps,
      bitrate: br*1e6, audioUrl:new URL('data/Neghab.mp3',location.href).href });
    const buf=await blob.arrayBuffer(); let s=''; const u=new Uint8Array(buf);
    for(let i=0;i<u.length;i+=0x8000) s+=String.fromCharCode.apply(null,u.subarray(i,i+0x8000));
    return btoa(s);
  }, {w,h,fps,br});
  const f=`/tmp/r${res}.mp4`;
  fs.writeFileSync(f, Buffer.from(b64,'base64'));
  console.log(`✅ ${res}p @${fps}fps ${br}Mb → ${(fs.statSync(f).size/1048576).toFixed(2)} MB در ${((Date.now()-t0)/1000).toFixed(1)}s`);
}
if(errs.length) console.log('خطا:',[...new Set(errs)].slice(0,3));
await b.close();
