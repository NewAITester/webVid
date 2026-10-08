import { chromium } from 'playwright';
import fs from 'node:fs';

const FROM = Number(process.argv[2] ?? 66);
const TO   = Number(process.argv[3] ?? 72);

const b = await chromium.launch({
  args: ['--no-sandbox', '--enable-features=SharedArrayBuffer',
         '--autoplay-policy=no-user-gesture-required'],
});
const pg = await b.newPage({ viewport: { width: 1280, height: 860 } });
const logs = [];
pg.on('pageerror', e => logs.push('PAGEERROR: ' + e.message));
pg.on('console', m => { if (m.type() === 'error') logs.push('ERR: ' + m.text()); });

await pg.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
await pg.waitForFunction(() => document.querySelector('#loading')?.classList.contains('gone'), { timeout: 25000 });

const cap = await pg.evaluate(() => window.__studio.canExport());
console.log('توان خروجی:', JSON.stringify(cap));
if (!cap.ok) { console.log('❌ ' + cap.why); await b.close(); process.exit(1); }

const t0 = Date.now();
const b64 = await pg.evaluate(async ({ from, to }) => {
  const S = window.__studio;
  const blob = await S.exportVideo({
    song: S.song, from, to,
    audioUrl: new URL('data/Neghab.mp3', location.href).href,
    bitrate: 12000000,
    onProgress: p => { if (p.phase === 'video' && p.done % 60 === 0) console.log('frame', p.done); },
  });
  const buf = await blob.arrayBuffer();
  let s = ''; const u = new Uint8Array(buf);
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
  return btoa(s);
}, { from: FROM, to: TO });

fs.writeFileSync('/tmp/out.mp4', Buffer.from(b64, 'base64'));
console.log(`✅ خروجی گرفته شد در ${((Date.now()-t0)/1000).toFixed(1)} ثانیه`);
if (logs.length) console.log('پیام‌ها:\n' + [...new Set(logs)].slice(0,6).join('\n'));
await b.close();
