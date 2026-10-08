import { chromium } from 'playwright';
// یک فریم نماینده از هر سبک، با زمانی که محتوا واقعاً دیده شود
const SHOTS = [
  ['intro',  5.0], ['cold',  16.2], ['inst_a', 24.0], ['verse',  33.0],
  ['pre',    61.5], ['chorus', 71.0], ['verse2', 95.0], ['pre2', 120.5],
  ['inst_b', 140.0], ['chorus2', 161.0], ['inst_c', 182.0],
  ['mirror', 196.0], ['end',   210.5],
];
const b = await chromium.launch({ args: ['--no-sandbox'] });
const pg = await b.newPage({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: 1 });
const bad = [];
pg.on('pageerror', e => bad.push('PAGEERROR: ' + e.message));
pg.on('console', m => { if (m.type() === 'error') bad.push('CONSOLE: ' + m.text()); });
await pg.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
await pg.waitForFunction(() => document.querySelector('#loading')?.classList.contains('gone'), { timeout: 25000 });
await pg.waitForTimeout(500);

for (const [name, tt] of SHOTS) {
  await pg.evaluate(x => window.dispatchEvent(new CustomEvent('seek-test', { detail: x })), tt);
  await pg.waitForTimeout(220);
  await pg.locator('#stage').screenshot({ path: `tests/sh_${name}.png` });
}
await pg.screenshot({ path: 'tests/full.png' });
console.log(bad.length ? '❌\n' + [...new Set(bad)].join('\n') : '✅ هر ۱۳ بخش بدون خطا رندر شد');
await b.close();
