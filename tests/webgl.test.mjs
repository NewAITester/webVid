/**
 * تست هستهٔ رندر WebGL — فاز ۴۰. بدون مرورگر و بدون WebGL واقعی:
 * در Node پشتیبانی false است و همهٔ مسیرها باید امن برگردند.
 *   node tests/webgl.test.mjs
 */
import { WebGLRenderer, hueRotateMatrix, applyColorAdjustPixels, VERT_SRC, FRAG_SRC } from '../src/motion/webgl.js';

let fail = 0;
const ok = (c, m) => { console.log((c ? '  ✅' : '  ❌') + ' ' + m); if (!c) fail++; };
const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;

console.log('── شیدرها ──');
{
  ok(VERT_SRC.includes('a_pos') && VERT_SRC.includes('gl_Position'), 'ورتیکس شیدر موقعیت و خروجی دارد');
  ok(FRAG_SRC.includes('u_hue') && FRAG_SRC.includes('u_blur') && FRAG_SRC.includes('u_vignette'), 'فرگمنت شیدر یونیفرم‌های فام/تاری/وینیت دارد');
  ok(FRAG_SRC.includes('texture2D'), 'فرگمنت شیدر بافت را نمونه می‌گیرد');
  ok(FRAG_SRC.includes('hueRotate'), 'فرگمنت شیدر چرخش فام دارد');
}

console.log('── ماتریس چرخش فام ──');
{
  const id = hueRotateMatrix(0);
  ok(near(id[0], 1) && near(id[4], 1) && near(id[8], 1), 'در ۰ درجه ماتریس واحد است');
  ok(near(id[1], 0) && near(id[2], 0) && near(id[3], 0), 'در ۰ درجه خارج قطر صفر است');
  const m90 = hueRotateMatrix(90);
  ok(m90.length === 9 && m90.every(v => Number.isFinite(v)), 'در ۹۰ درجه ۹ عدد متناهی می‌دهد');
  ok(!m90.every((v, i) => near(v, id[i])), 'در ۹۰ درجه ماتریس با واحد فرق می‌کند');
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
  ok(r2.adjust({ width: 10, height: 10 }) === null, 'وقتی پشتیبانی نیست adjust null است');

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

  // وینیت: گوشه تیره می‌شود، مرکز نه
  const img = new Uint8ClampedArray(100 * 100 * 4).fill(255);
  applyColorAdjustPixels(img, 100, 100, { vignette: 1 });
  const corner = img[0], center = img[(50 * 100 + 50) * 4];
  ok(corner < 100 && center > 250, `وینیت گوشه را تیره می‌کند (گوشه ${corner}، مرکز ${center})`);

  // تاری: تصویر یکدست بدون تغییر، تک‌پیکسل سفید پخش می‌شود
  const flat = new Uint8ClampedArray(5 * 5 * 4).fill(100);
  applyColorAdjustPixels(flat, 5, 5, { blur: 1 });
  ok(flat.every(v => v === 100), 'تصویر یکدست با تاری بدون تغییر می‌ماند');
  const dot = new Uint8ClampedArray(5 * 5 * 4).fill(0);
  dot[(2 * 5 + 2) * 4] = 255; dot[(2 * 5 + 2) * 4 + 1] = 255; dot[(2 * 5 + 2) * 4 + 2] = 255; dot[(2 * 5 + 2) * 4 + 3] = 255;
  applyColorAdjustPixels(dot, 5, 5, { blur: 1 });
  const c0 = dot[(2 * 5 + 2) * 4], nb = dot[(2 * 5 + 3) * 4];
  ok(c0 < 255 && nb > 0, `تک‌پیکسل سفید با تاری پخش می‌شود (مرکز ${c0}، همسایه ${nb})`);

  // آلفا حفظ می‌شود
  d = px(255, 0, 0, 128);
  applyColorAdjustPixels(d, 1, 1, { hue: 90, brightness: 0.2 });
  ok(d[3] === 128, 'آلفا با تنظیم رنگ تغییر نمی‌کند');
}

console.log(fail ? `❌ ${fail} تست ناموفق` : '✅ همهٔ تست‌ها موفق');
process.exit(fail ? 1 : 0);
