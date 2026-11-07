/**
 * تست هستهٔ رندر WebGL — فاز ۴۰. بدون مرورگر و بدون WebGL واقعی:
 * در Node پشتیبانی false است و همهٔ مسیرها باید امن برگردند.
 *   node tests/webgl.test.mjs
 */
import { WebGLRenderer, hueRotateMatrix, VERT_SRC, FRAG_SRC } from '../src/motion/webgl.js';

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

console.log(fail ? `❌ ${fail} تست ناموفق` : '✅ همهٔ تست‌ها موفق');
process.exit(fail ? 1 : 0);
