import { chromium } from 'playwright';
const b = await chromium.launch({ args: ['--no-sandbox'] });
const pg = await b.newPage({ viewport: { width: 1200, height: 800 } });
await pg.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
await pg.waitForFunction(() => document.querySelector('#loading')?.classList.contains('gone'), { timeout: 25000 });
const r = await pg.evaluate(async () => {
  const S = window.__studio;
  S.overrides.clearAll();
  S.seek(33.2);
  const w = S.renderer.wordsAt(33.2);
  const id = w[Math.floor(w.length/2)].id;
  const before = { cx: w.find(x=>x.id===id).cx };
  // یک افست بزرگ بگذار تا در تصویر معلوم باشد
  S.overrides.nudge(id, 250, -120); S.overrides.save();
  // رندرر خروجی را جدا بساز و ببین افست را می‌بیند یا نه
  const { Renderer } = await import('/src/engine/renderer.js');
  const { Stage } = await import('/src/engine/stage.js');
  const c = document.createElement('canvas'); c.width=1920; c.height=1080;
  const st = new Stage(c); st.resize(1920,1080);
  const R2 = new Renderer(st).setSong(S.song);
  R2.overrides = S.overrides;
  const after = R2.wordsAt(33.2).find(x=>x.id===id);
  return { id, beforeCx: Math.round(before.cx), afterCx: Math.round(after.cx), moved: !!after.moved };
});
console.log(JSON.stringify(r));
console.log(r.afterCx - r.beforeCx === 250 ? '✅ افست در رندرر خروجی اعمال می‌شود' : '❌ اعمال نمی‌شود');
await pg.evaluate(() => window.__studio.overrides.clearAll() || window.__studio.overrides.save());
await b.close();
