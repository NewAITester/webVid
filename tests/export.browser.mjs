/**
 * تست خروجی واقعی در مرورگر — فاز R5.
 * اپ واقعی را بیلد و سرو می‌کند، پروژهٔ نمایشی را باز می‌کند، ۱ ثانیه
 * را با WebCodecs خروجی می‌گیرد و فایل MP4 را بررسی می‌کند.
 *   npm run test:export-browser
 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, readFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const root = new URL('../', import.meta.url).pathname;
const PORT = 4173;

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { cwd: root, stdio: 'inherit', shell: false, ...opts });
    p.on('error', reject);
    p.on('close', code => (code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}`))));
  });
}

async function waitForServer(url, tries = 40) {
  for (let i = 0; i < tries; i++) {
    try { const r = await fetch(url); if (r.ok) return; } catch { /* هنوز بالا نیامده */ }
    await new Promise(r => setTimeout(r, 500));
  }
  throw new Error('سرور پیش‌نمایش بالا نیامد');
}

await mkdir('artifacts/export-tests', { recursive: true });
console.log('── بیلد وب ──');
await run('npx', ['vite', 'build']);

console.log('── سرو پیش‌نمایش ──');
const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { cwd: root, stdio: 'inherit' });
let browser;
try {
  await waitForServer(`http://127.0.0.1:${PORT}/`);
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ acceptDownloads: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));

  console.log('── باز کردن پروژهٔ نمایشی ──');
  await page.goto(`http://127.0.0.1:${PORT}/`);
  await page.locator('#projGrid .pcard:not(.add)').first().click();
  await page.waitForFunction(() => document.querySelector('#app').dataset.screen === 'editor');

  console.log('── پنل خروجی ──');
  await page.locator('#paneTabs button[data-pane="export"]').click();
  await page.fill('#exFrom', '0');
  await page.fill('#exTo', '1');
  await page.selectOption('#exFps', '24');
  await page.selectOption('#exRes', '480');

  console.log('── شروع خروجی (۱ ثانیه، ۲۴ فریم) ──');
  const downloadPromise = page.waitForEvent('download', { timeout: 120000 });
  await page.click('#exGo');
  const result = await page.waitForFunction(
    () => window.__exportResult || window.__exportError,
    null, { timeout: 120000 },
  ).then(h => h.jsonValue());
  assert.ok(!result || typeof result === 'object', 'نتیجهٔ خروجی خوانده شد');
  if (result && result.size) {
    console.log(`  خروجی: ${result.frames} فریم، ${(result.size / 1024).toFixed(1)} KB، ${result.codec}`);
    assert.equal(result.frames, 24, '۱ ثانیه با ۲۴ فریم = ۲۴ فریم');
    assert.ok(result.size > 1000, 'فایل خروجی حجم دارد');
    assert.ok(['H.264', 'H.264 baseline', 'VP9', 'AV1'].includes(result.codec), 'کدک معتبر است');
  } else {
    assert.fail('خروجی ناموفق: ' + JSON.stringify(result));
  }

  console.log('── دانلود و بررسی MP4 ──');
  await page.click('#exDownload');
  const download = await downloadPromise;
  const path = 'artifacts/export-tests/r5.mp4';
  await download.saveAs(path);
  const head = await readFile(path);
  assert.equal(head.subarray(4, 8).toString('ascii'), 'ftyp', 'فایل با باکس ftyp شروع می‌شود');
  console.log(`  ${path}: ${head.length} بایت، ftyp OK`);

  assert.deepEqual(errors, [], 'بدون خطای صفحه');
  console.log('\n✅ تست خروجی مرورگر گذشت');
} finally {
  await browser?.close();
  server.kill('SIGTERM');
}
