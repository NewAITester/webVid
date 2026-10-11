/**
 * تست‌های موتور موشن (بدون مرورگر): منحنی‌ها، کی‌فریم، عبارت،
 * ماتریس لایه‌ها، برش/تکثیر، سازندهٔ دستور FFmpeg و ارجاع افکت سفارشی.
 *   node tests/motion.test.mjs
 */
import { EASINGS, easeFn, cubicBezier } from '../src/motion/easing.js';
import { sample, setKey, toggleKey, removeKey, keyAt, hasKeys, parseColor } from '../src/motion/tracks.js';
import { evalTrack, compileExpr } from '../src/motion/expr.js';
import { newLayer, normalizeLayer, LAYER_TYPES } from '../src/motion/schema.js';
import { evalLayer } from '../src/motion/evaluate.js';
import { animMods } from '../src/motion/animate.js';
import * as M from '../src/motion/mat.js';
import { split, duplicate, trimStart, trimEnd, allKeyTimes } from '../src/motion/ops.js';
import { buildArgs, defaultOptions, atempoChain, parseCommand, parseTime } from '../src/ffmpeg/args.js';
import { remapCustomRefs } from '../src/engine/custom.js';
import { compileCode } from '../src/motion/codeapi.js';

let fail = 0;
const ok = (c, m) => { console.log((c ? '  ✅' : '  ❌') + ' ' + m); if (!c) fail++; };
const near = (a, b, e = 1e-6) => Math.abs(a - b) < e;

console.log('── منحنی‌ها ──');
let bad = 0;
for (const [k, f] of Object.entries(EASINGS)) {
  if (k === 'hold') continue;
  if (!near(f(0), 0, 1e-6) || !near(f(1), 1, 1e-6)) bad++;
}
ok(bad === 0, 'همهٔ منحنی‌ها از ۰ شروع و به ۱ ختم می‌شوند');
ok(EASINGS.hold(0.99) === 0 && EASINGS.hold(1) === 1, 'hold تا آخر ثابت می‌ماند');
const lin = cubicBezier(0, 0, 1, 1);
ok(near(lin(0.3), 0.3, 1e-3), 'بزیهٔ خطی = خط راست');
ok(easeFn([0.25, 0.1, 0.25, 1])(0.5) > 0.5, 'بزیهٔ ease از وسط جلوتر است');
ok(easeFn('nope')(0.4) === 0.4, 'نام ناشناخته = خطی');

console.log('\n── کی‌فریم ──');
const tr = { v: 0 };
setKey(tr, 0, 0, 'linear');
setKey(tr, 2, 100, 'linear');
ok(near(sample(tr, 1), 50), 'میان‌یابی خطی وسط = ۵۰');
ok(sample(tr, -1) === 0 && sample(tr, 9) === 100, 'بیرون از بازه = نزدیک‌ترین کی‌فریم');
ok(!!keyAt(tr, 2) && hasKeys(tr), 'keyAt / hasKeys');
toggleKey(tr, 2);
ok(!keyAt(tr, 2), 'toggleKey کی‌فریم را برمی‌دارد');
removeKey(tr, 0);
ok(!hasKeys(tr), 'حذف آخرین کی‌فریم ← مقدار ثابت');
const ct = { v: '#000000' };
setKey(ct, 0, '#000000', 'linear'); setKey(ct, 1, '#ffffff', 'linear');
const mid = parseColor(sample(ct, 0.5));
ok(mid[0] > 100 && mid[0] < 155, `رنگ هم میان‌یابی می‌شود (${sample(ct, 0.5)})`);

console.log('\n── عبارت ──');
ok(evalTrack({ v: 10, x: 'value * 2' }, 0, {}) === 20, 'value * 2');
ok(near(evalTrack({ v: 0, x: 't * 3' }, 2, {}), 6), 't * 3');
ok(evalTrack({ v: 7, x: 'this is ((( bad' }, 0, {}) === 7, 'عبارت خراب ← مقدار اصلی');
ok(!!compileExpr('(((').error, 'خطای نگارشی گزارش می‌شود');
ok(evalTrack({ v: 1, x: 'value + kick' }, 0, { kick: 0.5 }) === 1.5, 'متغیر صوتی kick');

console.log('\n── لایه و ماتریس ──');
for (const type of Object.keys(LAYER_TYPES)) {
  const L = newLayer(type, 0, 2);
  ok(L.type === type && L.props.x && L.props.opacity, `ساخت لایهٔ ${type}`);
}
const env = { W: 1920, H: 1080, time: 0, kick: 0, rms: 0, low: 0, beat: 0, pulse: 0 };
const A = newLayer('shape', 0, 4); A.props.x.v = 100;
const B = newLayer('shape', 0, 4); B.props.x.v = 50; B.parent = A.id;
const byId = new Map([[A.id, A], [B.id, B]]);
const sb = evalLayer(B, 1, env, byId, new Map());
const p = M.apply(sb.world, 0, 0);
ok(near(p.x, 960 + 150) && near(p.y, 540), `فرزند با والد جابه‌جا می‌شود (${p.x}, ${p.y})`);
ok(sb.active, 'لایه در بازهٔ زمانی فعال است');
ok(!evalLayer(B, 5, env, byId).active, 'بعد از پایان غیرفعال');
const inv = M.invert(sb.world);
const back = M.apply(inv, p.x, p.y);
ok(near(back.x, 0) && near(back.y, 0), 'وارون ماتریس');
const N = normalizeLayer({ type: 'text', t0: 0, t1: 1 });
ok(N.id && N.props && Array.isArray(N.effects), 'normalizeLayer داده‌ٔ ناقص را کامل می‌کند');

console.log('\n── انیمیشن آماده ──');
const m0 = animMods({ in: { id: 'fade', dur: 0.5 }, out: { id: 'none' }, loop: { id: 'none' } }, 0, 3, env);
const m1 = animMods({ in: { id: 'fade', dur: 0.5 }, out: { id: 'none' }, loop: { id: 'none' } }, 1, 3, env);
ok(m0.a < 0.05 && near(m1.a, 1), `محو ورود: ${m0.a.toFixed(2)} ← ${m1.a.toFixed(2)}`);

console.log('\n── برش، تکثیر، کوتاه کردن ──');
const S = newLayer('shape', 1, 4);
setKey(S.props.x, 0, 0, 'linear'); setKey(S.props.x, 3, 300, 'linear');
const S2 = split(S, 2.5);
ok(S2 && near(S.t1, 2.5) && near(S2.t0, 2.5) && near(S2.t1, 5), 'split زمان‌ها را درست تقسیم می‌کند');
ok(near(sample(S2.props.x, 0), 150), `مقدار ادامه پیدا می‌کند (${sample(S2.props.x, 0)})`);
ok(S2.id !== S.id, 'تکهٔ دوم شناسهٔ تازه دارد');
const D = duplicate(S, 2);
ok(D.id !== S.id && near(D.t0, S.t0 + 2), 'duplicate با جابه‌جایی زمان');
const T = newLayer('shape', 0, 4);
setKey(T.props.x, 1, 10, 'linear'); setKey(T.props.x, 3, 30, 'linear');
trimStart(T, 1);
ok(near(T.t0, 1) && near(allKeyTimes(T)[0], 0), 'trimStart کی‌فریم‌ها را جابه‌جا می‌کند');
trimEnd(T, 2);
ok(near(T.t1, 2) && allKeyTimes(T).every(k => k <= 1 + 1e-6), 'trimEnd کی‌فریم‌های بیرونی را حذف می‌کند');

console.log('\n── لایهٔ کد ──');
ok(typeof compileCode('e.circle(0,0,10)').fn === 'function', 'کد سالم کامپایل می‌شود');
ok(!!compileCode('for (').error, 'خطای نگارشی کد');

console.log('\n── FFmpeg ──');
const o = defaultOptions();
const r = buildArgs(o, 'in.mp4', 30);
ok(r.args.includes('-i') && r.args.includes('in.mp4') && r.outName.endsWith('.mp4'), 'دستور پایه');
ok(r.args.includes('-crf'), 'کیفیت CRF');
ok(atempoChain(4).join(',') === 'atempo=2,atempo=2', 'atempo زنجیره‌ای برای ۴×');
ok(JSON.stringify(parseCommand(`-i in.mp4 -vf "scale=640:-2,fps=12" out.gif`)) ===
   JSON.stringify(['-i', 'in.mp4', '-vf', 'scale=640:-2,fps=12', 'out.gif']), 'تجزیهٔ دستور با کوتیشن');
ok(parseTime('1:05') === 65 && parseTime('12.5') === 12.5, 'زمان mm:ss');
const g = buildArgs({ ...o, container: 'gif' }, 'in.mp4', 10);
ok(g.outName.endsWith('.gif') && !g.args.includes('-c:a'), 'گیف بدون صدا');
const a = buildArgs({ ...o, container: 'mp3' }, 'in.mp4', 10);
ok(a.args.includes('-vn'), 'MP3 بدون تصویر');

console.log('\n── ارجاع افکت سفارشی ──');
const secs = [[0, 1, 'cf:0'], [1, 2, 'cf:1'], [2, 3, 'cf:2'], [3, 4, 'verse']];
const lf = { 0: { style: 'cf:2' }, 1: { style: 'cf:1' } };
remapCustomRefs(1, secs, lf);
ok(secs[0][2] === 'cf:0' && secs[1][2] === 'verse' && secs[2][2] === 'cf:1', `بخش‌ها: ${secs.map(s => s[2]).join(' ')}`);
ok(lf[0].style === 'cf:1' && (lf[1].style === 'verse' || lf[1].style === undefined), 'تنظیم خطوط هم جابه‌جا می‌شود');

console.log(fail ? `\n❌ ${fail} تست شکست خورد` : '\n✅ همه گذشتند');
process.exit(fail ? 1 : 0);
