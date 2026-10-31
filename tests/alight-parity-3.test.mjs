/**
 * تست فاز ۳ هم‌ترازی با Alight Motion — گروه‌سازی و منحنی یکجا.
 *   node tests/alight-parity-3.test.mjs
 */
import { newLayer } from '../src/motion/schema.js';
import { groupLayers, ungroup, applyEaseToAll } from '../src/motion/ops.js';
import { setKey } from '../src/motion/tracks.js';

let fail = 0;
const ok = (c, m) => { console.log((c ? '  ✅' : '  ❌') + ' ' + m); if (!c) fail++; };

console.log('── گروه‌سازی ──');
{
  const a = newLayer('text', 1, 5);
  const b = newLayer('shape', 3, 4);
  const g = groupLayers([a, b]);
  ok(!!g && g.type === 'null', 'گروه از نوع والد خالی ساخته می‌شود');
  ok(g.t0 === 1 && g.t1 === 7, `بازهٔ گروه همهٔ اعضا را می‌پوشاند (got ${g.t0}–${g.t1})`);
  ok(a.parent === g.id && b.parent === g.id, 'هر دو عضو فرزند گروه می‌شوند');
  const kids = ungroup(g, [a, b, g]);
  ok(kids.length === 2 && a.parent === null && b.parent === null, 'باز کردن گروه فرزندان را آزاد می‌کند');
  ok(groupLayers([]) === null, 'گروه خالی ساخته نمی‌شود');
}

console.log('── منحنی یکجا روی همهٔ کی‌فریم‌ها ──');
{
  const L = newLayer('text', 0, 5);
  setKey(L.props.x, 0, 0, 'linear'); setKey(L.props.x, 2, 100, 'linear'); setKey(L.props.x, 4, 200, 'linear');
  applyEaseToAll(L, 'outBack');
  ok(L.props.x.k.every(q => q.e === 'outBack'), 'همهٔ کی‌فریم‌های x منحنی outBack گرفتند');
}

console.log(fail ? `❌ ${fail} خطا` : '✅ همهٔ تست‌ها گذشت');
process.exit(fail ? 1 : 0);
