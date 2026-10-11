/**
 * «افزودنی‌های برنامه» برای کد وارد‌شده
 * ─────────────────────────────────────────────────────────────
 * هنگام ساختن ویدیو از کد، کاربر انتخاب می‌کند:
 *   • «فقط خود کد»: فقط المان‌ها، اجزا و نوشته‌های خود کد (قابل‌تغییر) — بی هیچ اضافه‌ای
 *   • «کد + برنامه»: همان، به‌علاوهٔ چیزهایی از خود برنامه (گذار، عنوان، کانال، ضرب، …)
 * افزودنی‌ها به‌صورت چند خط موشن‌اسکریپت به آخر اسکریپت اضافه می‌شوند؛
 * پس بعداً هم در اسکریپت و زبانهٔ لایه‌ها قابل‌ویرایش یا حذف‌اند.
 */
export const EXTRAS = [
  { id: 'look', label: 'ظاهر برنامه: دانه، درخشش و انحراف رنگ', on: true, project: true },
  { id: 'trans', label: 'گذار برنامه بین صحنه‌ها', on: true, pick: [['auto', 'به‌نوبت'], ['wipe', 'نوارهای رنگی'], ['flash', 'فلاش'], ['glitch', 'گلیچ'], ['iris', 'دریچهٔ دایره‌ای']] },
  { id: 'title', label: 'عنوان و نام هنرمند در شروع ویدیو', on: true },
  { id: 'tg', label: 'نام کانال / تلگرام گوشهٔ تصویر', on: true },
  { id: 'beat', label: 'موج ضربه روی ضرب‌های آهنگ', on: false },
  { id: 'finish', label: 'ویگنت و دانهٔ فیلم روی کل ویدیو', on: false },
  { id: 'progress', label: 'نوار پیشرفت و تایم‌کد', on: false },
  { id: 'song', label: 'بعد از ساخت، پنجرهٔ افزودن آهنگ باز شود', on: false, project: true },
];

export const defaultExtras = (project = false) => ({
  mode: 'pure',                                   // 'pure' | 'app'
  ...Object.fromEntries(EXTRAS.filter(x => project || !x.project).map(x => [x.id, x.on])),
  transKind: 'auto',
});

const q = v => `'${String(v).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n')}'`;
const r3 = v => +(+v).toFixed(3);

/**
 * @param {string} script  موشن‌اسکریپت تبدیل‌شده
 * @param {object} sel     انتخاب‌ها (defaultExtras)
 * @param {object} ctx     { scenes:[{t0,t1}], duration, title, artist, tg, accent }
 */
export function applyExtras(script, sel, ctx = {}) {
  if (!script || !sel || sel.mode !== 'app') return script;
  const acc = ctx.accent || '#E4142A';
  const L = ['', '// ───── افزودنی‌های برنامه (هر خط را می‌شود حذف یا عوض کرد) ─────', 'const APP_K = Math.min(W, H) / 1080'];
  const bounds = [...new Set((ctx.scenes || []).map(s => r3(s.t0)).filter(t => t > 0.05 && t < (ctx.duration || 1e9) - 0.05))].sort((a, b) => a - b);
  if (sel.trans && bounds.length) {
    const kinds = ['wipe', 'flash', 'glitch', 'iris'];
    bounds.forEach((t, i) => {
      const k = sel.transKind && sel.transKind !== 'auto' ? sel.transKind : kinds[i % kinds.length];
      L.push(`transition(${q(k)}, { at: ${t}, dur: ${k === 'iris' ? 0.6 : 0.4}${k === 'wipe' ? `, c1: ${q(acc)}` : ''} })`);
    });
  }
  const over = [];
  if (sel.beat) over.push(`  shock({ c: '#FFFFFF', opacity: 0.35, name: 'موج ضربه (برنامه)' })`);
  if (sel.finish) over.push(`  adjust({ name: 'ویگنت و دانه (برنامه)', fx: [['vignette', { amt: 40 }], ['grain', { amt: 10 }]] })`);
  if (sel.tg && ctx.tg) over.push(`  text(${q(ctx.tg)}, { size: 26 * APP_K, color: '#F6F3EC', opacity: 0.75, font: 'sans', x: W * 0.5 - 40 * APP_K - ${q(ctx.tg)}.length * 6.5 * APP_K, y: H * 0.5 - 44 * APP_K, name: 'کانال (برنامه)' })`);
  if (sel.progress) over.push(`  code(function (ctx, e) {
    const s = e.min(e.w, e.h) / 1080, f = Math.floor(e.time * 30);
    ctx.fillStyle = e.c1; ctx.fillRect(-e.w / 2, e.h / 2 - 4 * s, e.w * e.p, 4 * s);
    ctx.globalAlpha = 0.55; ctx.fillStyle = '#FFFFFF';
    ctx.font = (16 * s) + 'px ui-monospace, Menlo, monospace'; ctx.direction = 'ltr'; ctx.textAlign = 'left';
    ctx.fillText(String(Math.floor(e.time)).padStart(2, '0') + ':' + String(f % 30).padStart(2, '0'), -e.w / 2 + e.w * 0.035, -e.h / 2 + e.h * 0.05);
  }, { name: 'نوار پیشرفت (برنامه)', c1: ${q(acc)} })`);
  if (over.length) L.push('overlay(', over.join(',\n'), ')');
  if (sel.title && (ctx.title || ctx.artist)) {
    const parts = [];
    if (ctx.title) parts.push(`  text(${q(ctx.title)}, { size: 120 * APP_K, color: '#F6F3EC', y: ${ctx.artist ? -40 : 0} * APP_K, enter: ['riseBlur', 0.5], exit: ['fade', 0.4], name: 'عنوان (برنامه)' })`);
    if (ctx.artist) parts.push(`  text(${q(ctx.artist)}, { size: 52 * APP_K, color: ${q(acc)}, y: 70 * APP_K, from: 0.3, enter: ['fade', 0.4], exit: ['fade', 0.4], name: 'هنرمند (برنامه)' })`);
    L.push(`scene({ name: 'عنوان (برنامه)', at: 0, dur: ${r3(Math.min(2.6, Math.max(1, (ctx.duration || 3) * 0.4)))} },`, parts.join(',\n') + ')');
  }
  return L.length > 3 ? script.replace(/\s*$/, '\n') + L.join('\n') + '\n' : script;
}
