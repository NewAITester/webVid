import { chromium } from 'playwright';
const b = await chromium.launch({ args: ['--no-sandbox'] });
const pg = await b.newPage({ viewport: { width: 1280, height: 860 } });
pg.on('pageerror', e => console.log('PAGEERROR:', e.message));
await pg.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
await pg.waitForFunction(() => document.querySelector('#loading')?.classList.contains('gone'), { timeout: 20000 });

const out = await pg.evaluate(async () => {
  const S = window.__studio;
  const { byId, resolve } = await import('/src/effects/index.js');
  const { lineAt } = await import('/src/engine/lyrics.js');
  const { textPoints } = await import('/src/engine/glyphs.js');
  const { sectionAt } = await import('/src/engine/project.js');
  const R = S.renderer, P = S.project;
  const t = 45.6;
  const sec = sectionAt(P, t);
  const fx = byId[sec.effect];
  const p = resolve(sec.effect, sec.params);
  const line = lineAt(R.lyrics, t, 1.2);
  const ph = fx.phase ? fx.phase(line, t, p) : null;
  const pts = line ? textPoints(line.text, p.size, 'IRANSansX Black', p.step) : [];
  return {
    section: sec.name, effect: sec.effect,
    line: line ? line.text : null,
    lineT: line?.t, lineEnd: line?.end,
    phase: ph,
    params: { size: p.size, hold: p.hold, burstDur: p.burstDur, step: p.step },
    pointCount: pts.length,
    fontsReady: document.fonts.check('140px "IRANSansX Black"'),
  };
});
console.log(JSON.stringify(out, null, 2));
await b.close();
