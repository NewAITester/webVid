/**
 * تست هستهٔ رندر WebGL — فاز R4. بدون مرورگر و بدون WebGL واقعی:
 * در Node پشتیبانی false است و همهٔ مسیرها باید امن برگردند.
 * مرجع CPU شیدر با مقدارهای پیکسلیِ معلوم راستی‌آزمایی می‌شود.
 *   node tests/webgl.test.mjs
 */
import { WebGLRenderer, hueRotateMatrix, applyColorAdjustPixels, webglParamsFor, VERT_SRC, FRAG_SRC } from '../src/render/webgl.js';
import { newLayer } from '../src/core/schema.js';

let fail = 0;
const ok = (c, m) => { console.log((c ? '  ✅' : '  ❌') + ' ' + m); if (!c) fail++; };
const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;

console.log('── شیدرها ──');
{
  ok(VERT_SRC.includes('a_pos') && VERT_SRC.includes('gl_Position'), 'ورتیکس شیدر موقعیت و خروجی دارد');
  ok(FRAG_SRC.includes('u_hue') && FRAG_SRC.includes('u_blur') && FRAG_SRC.includes('u_vignette'), 'فرگمنت شیدر یونیفرم‌های فام/تاری/وینیت دارد');
  ok(FRAG_SRC.includes('u_grayscale') && FRAG_SRC.includes('u_sepia') && FRAG_SRC.includes('u_invert'), 'فرگمنت شیدر یونیفرم‌های خاکستری/سپیا/معکوس دارد');
  ok(FRAG_SRC.includes('texture2D') && FRAG_SRC.includes('hueRotate'), 'فرگمنت شیدر بافت و چرخش فام دارد');
}

console.log('── ماتریس چرخش فام ──');
{
  const id = hueRotateMatrix(0);
  ok(near(id[0], 1) && near(id[4], 1) && near(id[8], 1), 'در ۰ درجه ماتریس واحد است');
  ok(near(id[1], 0) && near(id[2], 0) && near(id[3], 0), 'در ۰ درجه خارج قطر صفر است');
  const m360 = hueRotateMatrix(360);
  ok(m360.every((v, i) => near(v, id[i], 1e-9)), 'در ۳۶۰ درجه ماتریس به واحد برمی‌گردد');
}

console.log('── نبود WebGL در Node ──');
{
  const r1 = new WebGLRenderer(null);
  ok(r1.supported === false, 'با بوم null پشتیبانی false است');
  ok(r1.adjust({ width: 10, height: 10 }) === null, 'با بوم null تنظیم رنگ null برمی‌گرداند');
  const fakeCanvas = { getContext: () => null };
  const r2 = new WebGLRenderer(fakeCanvas);
  ok(r2.supported === false, 'وقتی getContext null می‌دهد پشتیبانی false است');
  const throwing = { getContext: () => { throw new Error('no gl'); } };
  const r3 = new WebGLRenderer(throwing);
  ok(r3.supported === false, 'وقتی getContext خطا می‌دهد سازنده نمی‌میرد و false است');
}

console.log('── راستی‌آزمایی پیکسلی (مرجع CPU شیدر) ──');
{
  const px = (r, g, b, a = 255) => new Uint8ClampedArray([r, g, b, a]);
  const close = (got, want, tol = 3) => Math.abs(got - want) <= tol;

  let d = px(255, 0, 0);
  applyColorAdjustPixels(d, 1, 1, {});
  ok(close(d[0], 255) && close(d[1], 0) && close(d[2], 0), 'قرمز با تنظیم خنثی بدون تغییر می‌ماند');

  d = px(255, 0, 0);
  applyColorAdjustPixels(d, 1, 1, { hue: 180 });
  ok(close(d[0], 0) && close(d[1], 153, 4) && close(d[2], 153, 4), `قرمز با چرخش ۱۸۰° فیروزه‌ای می‌شود (شد ${d[0]},${d[1]},${d[2]})`);

  d = px(255, 255, 255);
  applyColorAdjustPixels(d, 1, 1, { brightness: -0.5 });
  ok(close(d[0], 128, 2) && close(d[1], 128, 2), 'سفید با روشنایی ‎-۰٫۵ خاکستری میانی می‌شود');

  d = px(255, 0, 0);
  applyColorAdjustPixels(d, 1, 1, { saturation: 0 });
  ok(close(d[0], 76, 2) && close(d[1], 76, 2) && close(d[2], 76, 2), 'قرمز با اشباع ۰ خاکستریِ روشنایی می‌شود');

  d = px(200, 200, 200);
  applyColorAdjustPixels(d, 1, 1, { contrast: 2 });
  ok(close(d[0], 255, 2), 'خاکستری روشن با کنتراست ۲ به سفید می‌رسد');
  d = px(128, 128, 128);
  applyColorAdjustPixels(d, 1, 1, { contrast: 2 });
  ok(close(d[0], 128, 2), 'خاکستری میانی با کنتراست ۲ ثابت می‌ماند');

  d = px(255, 0, 0);
  applyColorAdjustPixels(d, 1, 1, { grayscale: 1 });
  ok(close(d[0], 76, 2) && close(d[1], 76, 2) && close(d[2], 76, 2), 'قرمز با خاکستری ۱ می‌شود (۷۶،۷۶،۷۶)');

  d = px(255, 255, 255);
  applyColorAdjustPixels(d, 1, 1, { sepia: 1 });
  ok(close(d[0], 255, 2) && close(d[1], 255, 2) && close(d[2], 239, 2), `سفید با سپیا ۱ می‌شود (۲۵۵،۲۵۵،۲۳۹) — شد (${d[0]},${d[1]},${d[2]})`);

  d = px(255, 0, 0);
  applyColorAdjustPixels(d, 1, 1, { invert: 1 });
  ok(close(d[0], 0) && close(d[1], 255, 2) && close(d[2], 255, 2), 'قرمز با معکوس ۱ فیروزه‌ای می‌شود');

  d = px(255, 0, 0, 128);
  applyColorAdjustPixels(d, 1, 1, { hue: 180 });
  ok(d[3] === 128, 'آلفا حفظ می‌شود');

  // وینیت: گوشه تیره می‌شود، مرکز نه
  const img = new Uint8ClampedArray(100 * 100 * 4).fill(255);
  applyColorAdjustPixels(img, 100, 100, { vignette: 1 });
  const corner = img[0], center = img[(50 * 100 + 50) * 4];
  ok(close(corner, 66, 3) && close(center, 255, 1), `وینیت: گوشه ${corner} و مرکز ${center}`);

  // تاری: تک‌پیکسل سفید پخش می‌شود
  const img3 = new Uint8ClampedArray(3 * 3 * 4);
  img3[(1 * 3 + 1) * 4] = 255; img3[(1 * 3 + 1) * 4 + 1] = 255; img3[(1 * 3 + 1) * 4 + 2] = 255; img3[(1 * 3 + 1) * 4 + 3] = 255;
  applyColorAdjustPixels(img3, 3, 3, { blur: 1 });
  ok(close(img3[(1 * 3 + 1) * 4], 28, 1) && close(img3[0], 28, 1), 'تاری جعبه‌ای تک‌پیکسل را به ۲۸ پخش می‌کند');
}

console.log('── پارامترهای WebGL لایه ──');
{
  const l = newLayer('shape', { start: 0, end: 4 });
  ok(webglParamsFor(l, 1) === null, 'لایهٔ بدون افکت رنگی پارامتر WebGL ندارد');
  l.effects = [{ id: 'brightness', params: { amount: 0.2 }, enabled: true }];
  const p1 = webglParamsFor(l, 1);
  ok(p1 && p1.brightness === 0.2, 'روشنایی ۰٫۲ خوانده می‌شود');
  l.effects = [{ id: 'brightness', params: { amount: 0 }, enabled: true }];
  ok(webglParamsFor(l, 1) === null, 'روشنایی خنثی پارامتر ندارد');
  l.effects = [{ id: 'brightness', params: { amount: 0.2 }, enabled: false }];
  ok(webglParamsFor(l, 1) === null, 'افکت خاموش پارامتر ندارد');
  l.effects = [
    { id: 'hueShift', params: { amount: 90 }, enabled: true },
    { id: 'contrast', params: { amount: 0.3 }, enabled: true },
    { id: 'vignette', params: { amount: 0.5 }, enabled: true },
  ];
  const p2 = webglParamsFor(l, 1);
  ok(p2 && p2.hue === 90 && p2.contrast === 1.3 && p2.vignette === 0.5, 'چند افکت با هم ترکیب می‌شوند');
  // پارامتر متحرک
  l.effects = [{ id: 'brightness', params: { amount: 0 }, keyframes: { amount: [{ t: 0, v: 0 }, { t: 2, v: 0.4 }] }, enabled: true }];
  const p3 = webglParamsFor(l, 1);
  ok(p3 && Math.abs(p3.brightness - 0.2) < 1e-9, 'روشنایی متحرک در t=1 برابر ۰٫۲ است');
}

console.log(fail === 0 ? '\n✅ همهٔ تست‌ها گذشت' : `\n❌ ${fail} تست ناموفق`);
process.exit(fail ? 1 : 0);
