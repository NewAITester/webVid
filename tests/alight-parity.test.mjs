/**
 * تست فاز ۱ هم‌ترازی با Alight Motion — شکل‌های تازه.
 * بدون مرورگر و بدون بوم واقعی: shapePath را با یک ctx ساختگی که
 * فراخوانی‌ها را ضبط می‌کند صدا می‌زنیم.
 *   node tests/alight-parity.test.mjs
 */
import { SHAPE_KINDS, newLayer } from '../src/motion/schema.js';
import { shapePath } from '../src/motion/render.js';

let fail = 0;
const ok = (c, m) => { console.log((c ? '  ✅' : '  ❌') + ' ' + m); if (!c) fail++; };

function fakeCtx() {
  const calls = [];
  const ctx = {
    calls,
    beginPath: () => calls.push('beginPath'),
    moveTo: (x, y) => calls.push(['moveTo', x, y]),
    lineTo: (x, y) => calls.push(['lineTo', x, y]),
    closePath: () => calls.push('closePath'),
    ellipse: (...a) => calls.push(['ellipse', ...a]),
    bezierCurveTo: (...a) => calls.push(['bezier', ...a]),
    quadraticCurveTo: (...a) => calls.push(['quad', ...a]),
    rect: (...a) => calls.push(['rect', ...a]),
    roundRect: (...a) => calls.push(['roundRect', ...a]),
  };
  return ctx;
}

const NEW = ['pie', 'arc', 'moon', 'teardrop', 'roundrect', 'callout', 'flower', 'quad'];
console.log('── شکل‌های تازهٔ Alight ──');
for (const k of NEW) {
  ok(SHAPE_KINDS.some(([id]) => id === k), `شکل ${k} در SHAPE_KINDS هست`);
}
for (const k of NEW) {
  const ctx = fakeCtx();
  const P = { w: 320, h: 320, radius: 20, sides: 5, inner: 45, strokeW: 0, trimS: 0, trimE: 100 };
  let len;
  try { len = shapePath(ctx, k, 320, 320, P); } catch (e) { len = -1; console.log('   خطا:', k, e.message); }
  ok(len > 0 && ctx.calls.length >= 2, `مسیر ${k} ساخته شد (طول=${len?.toFixed?.(0)}, فراخوانی=${ctx.calls.length})`);
}
{
  const ctx = fakeCtx();
  shapePath(ctx, 'arc', 320, 320, { radius: 0, sides: 5, inner: 45 });
  ok(!ctx.calls.includes('closePath'), 'کمان باز است (closePath ندارد) — فقط دورخط');
}
{
  const L = newLayer('shape', 0, 4);
  L.data.kind = 'moon';
  ok(L.data.kind === 'moon' && L.props.w, 'لایهٔ شکل با kind تازه ساخته می‌شود');
}
{
  // شکل‌های قدیمی نباید خراب شده باشند
  for (const k of ['rect', 'ellipse', 'star', 'heart', 'arrow']) {
    const ctx = fakeCtx();
    const len = shapePath(ctx, k, 320, 320, { radius: 10, sides: 5, inner: 45, strokeW: 0, trimS: 0, trimE: 100 });
    ok(len > 0, `شکل قدیمی ${k} هنوز کار می‌کند`);
  }
}

console.log(fail ? `\n❌ ${fail} تست ناموفق` : '\n✅ همهٔ تست‌های فاز ۱ قبول');
process.exit(fail ? 1 : 0);
