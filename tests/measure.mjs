import { chromium } from 'playwright';
const b = await chromium.launch({ args: ['--no-sandbox'] });
const pg = await b.newPage();
await pg.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
await pg.waitForFunction(() => document.fonts.check('100px "IRANSansX Black"'), { timeout: 20000 });
const out = await pg.evaluate(() => {
  const c = document.createElement('canvas').getContext('2d');
  c.direction = 'rtl'; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.font = '100px "IRANSansX Black"';
  return ['نقاب','زروان اکو','تو آینه‌ی شکسته...','می‌کنم'].map(s => {
    const m = c.measureText(s);
    return { s, advance: +m.width.toFixed(2),
             ink: +(m.actualBoundingBoxLeft + m.actualBoundingBoxRight).toFixed(2) };
  });
});
console.log('  متن'.padEnd(26), 'پیشروی'.padStart(9), 'جوهر'.padStart(9));
for (const r of out) console.log(`  ${r.s}`.padEnd(26), String(r.advance).padStart(9), String(r.ink).padStart(9));
await b.close();
