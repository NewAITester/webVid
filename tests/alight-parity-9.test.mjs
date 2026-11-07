/**
 * تست فازهای ۹ تا ۱۱ — UX گروه و تک‌نمایش، لایهٔ خط آزاد، افکت‌های تازه.
 *   node tests/alight-parity-9.test.mjs
 */
import { LAYER_TYPES, EFFECTS, newLayer } from '../src/motion/schema.js';
import { scribblePoints } from '../src/motion/render.js';
import { collapsedGroupIds, isHiddenByCollapse, toggleCollapse, applySolo, restoreSolo, groupLayers } from '../src/motion/ops.js';

let fail = 0;
const ok = (c, m) => { console.log((c ? '  ✅' : '  ❌') + ' ' + m); if (!c) fail++; };

console.log('── گروه: جمع‌شدن و تک‌نمایش ──');
{
  const a = newLayer('text', 0, 5), b = newLayer('shape', 0, 5);
  const g = groupLayers([a, b], 'گروه تست');
  const layers = [a, b, g];
  ok(!isHiddenByCollapse(a, layers), 'قبل از جمع‌شدن، عضو گروه دیده می‌شود');
  ok(toggleCollapse(g) === true, 'جمع‌کردن گروه true برمی‌گرداند');
  ok(isHiddenByCollapse(a, layers) && isHiddenByCollapse(b, layers), 'بعد از جمع‌شدن، اعضا پنهان‌اند');
  ok(!isHiddenByCollapse(g, layers), 'خود گروه پنهان نمی‌شود');
  ok(collapsedGroupIds(layers).has(g.id), 'شناسهٔ گروه جمع‌شده در مجموعه هست');
  const prev = applySolo(layers, a.id);
  ok(a.visible === true && b.visible === false && g.visible === false, 'تک‌نمایش: فقط لایهٔ انتخاب‌شده دیده می‌شود');
  restoreSolo(layers, prev);
  ok(a.visible === true && b.visible === true && g.visible === true, 'بازگرداندن تک‌نمایش همه را برمی‌گرداند');
}

console.log('── خط آزاد ──');
ok(!!LAYER_TYPES.draw, 'لایهٔ خط آزاد (draw) هست');
{
  const pts = scribblePoints(800, 200, { amp: 40, freq: 3 });
  ok(pts.length === 61, 'خط آزاد ۶۱ نقطه دارد');
  ok(Math.abs(pts[0][0] + 400) < 1e-9 && Math.abs(pts[60][0] - 400) < 1e-9, 'خط از چپ تا راست قاب را می‌پوشاند');
  ok(Math.abs(pts[0][1]) < 1e-9, 'نقطهٔ اول روی محور است (سینوس صفر)');
  const pts2 = scribblePoints(800, 200, { amp: 40, freq: 3 });
  ok(JSON.stringify(pts) === JSON.stringify(pts2), 'نقاط قطعی‌اند — دو بار اجرا یک نتیجه می‌دهد');
  const d = newLayer('draw', 0, 4);
  ok(d.props.strokeW && d.props.trimS && d.props.trimE, 'خط آزاد ضخامت و برش مسیر دارد');
}

console.log('── افکت‌های تازه ──');
for (const k of ['clouds', 'checker', 'tiltShift', 'flipH', 'flipV', 'hueShift', 'invertFx', 'pinch', 'bend', 'fractal', 'grid', 'matte', 'edgeGlow', 'wordPop', 'drift', 'tilt3d', 'flip3d', 'sphere', 'temperature', 'exposure', 'clarity', 'perspective', 'levels', 'feather', 'sepiaFx', 'vintage', 'neon', 'innerShadow', 'bevel', 'oilPaint', 'watercolor', 'pencil', 'comic', 'infrared', 'nightVision', 'thermal', 'tritone', 'surfaceBlur', 'echo', 'smear', 'pageCurl', 'cubeRotate', 'vortex', 'mandala', 'pixelSort', 'dither', 'haze', 'silhouette', 'xray', 'wobble', 'floaty', 'bloom', 'starburst', 'snow', 'confetti', 'fireflies', 'bokeh', 'halo', 'prism', 'aurora', 'tunnel', 'infiniteZoom', 'dataMosh', 'inkBleed', 'paperGrain', 'lightSweep', 'spinZoom', 'colorPop', 'dream', 'noir', 'solarFlare', 'rainbowShift', 'glowPulse', 'softFocus', 'anaglyph', 'rippleRing', 'gridWarp', 'scanSweep', 'flicker', 'chromaticPulse', 'heatHaze', 'liquid', 'shatter', 'fadePulse', 'blink', 'shear', 'cylinder', 'marble', 'rowShift', 'lightRays', 'pixelWave', 'electric', 'smoke', 'dust', 'colorBands', 'vhsTracking', 'oldFilm', 'neonSign', 'prismShift', 'flash', 'invertPulse', 'huePulse', 'edgePulse', 'warpWave', 'swirl', 'gridPulse', 'scanNoise', 'burst', 'sparkle', 'echoZoom', 'focusPull', 'depthField', 'vignettePulse', 'grainPulse', 'shadowPulse', 'waveShift', 'colorSplit', 'zoomSpin', 'slideEcho', 'blurPulse', 'tintPulse', 'mosaicPulse', 'strobeFlash', 'ripplePulse', 'vortexPulse', 'shearPulse', 'skewWave', 'tunnelSpin', 'fadeZoom', 'spinFade', 'lightLeak', 'neonPulse', 'haloPulse', 'fireGlow', 'iceGlow', 'prismWave', 'colorWave', 'starPulse', 'vignetteWave', 'sunsetGlow', 'moonGlow', 'cometTrail', 'rainbowWave', 'emberGlow', 'frostGlow', 'pulseRing', 'waveRipple', 'auroraWave', 'galaxyGlow', 'cometPulse', 'oceanWave', 'mistGlow', 'solarGlow', 'lunarGlow', 'stormCloud', 'crystalGlow', 'coralGlow', 'mintGlow', 'amberGlow', 'tealGlow', 'violetGlow', 'glowWave', 'glowRing', 'hologram', 'neonWave', 'prismGlow', 'auroraGlow', 'sunsetWave', 'oceanGlow', 'mistWave', 'stormGlow', 'emberWave', 'frostWave', 'pulseGlow', 'ringGlow', 'starGlow', 'cometGlow', 'moonWave', 'sunWave', 'nebulaGlow', 'quasarGlow', 'eclipseGlow', 'supernova', 'blackhole', 'wormhole', 'stardust', 'cosmosWave', 'lunarEclipse', 'auroraPulse', 'galaxyWave', 'nebulaWave', 'quasarWave', 'supernovaWave', 'cosmosGlow', 'eclipseWave', 'solarEclipse', 'auroraWavePulse', 'galaxyPulse', 'nebulaPulse', 'quasarPulse', 'supernovaPulse', 'cosmosPulse', 'eclipsePulse', 'mosaic', 'slitScan', 'crossProcess', 'lensFlare', 'letterBounce', 'rain', 'innerShadow', 'bevel', 'oilPaint', 'watercolor', 'pencil', 'comic', 'infrared', 'nightVision', 'thermal', 'tritone', 'surfaceBlur', 'echo', 'smear', 'pageCurl', 'cubeRotate', 'vortex', 'mandala', 'pixelSort', 'dither', 'haze', 'silhouette', 'xray', 'wobble', 'floaty', 'bloom', 'starburst', 'snow', 'confetti', 'fireflies', 'bokeh', 'halo', 'prism', 'aurora', 'tunnel', 'infiniteZoom', 'dataMosh', 'inkBleed', 'paperGrain', 'lightSweep', 'spinZoom', 'colorPop', 'dream', 'noir', 'solarFlare', 'rainbowShift', 'glowPulse', 'softFocus', 'anaglyph', 'rippleRing', 'gridWarp', 'scanSweep', 'flicker', 'chromaticPulse', 'heatHaze', 'liquid', 'shatter', 'fadePulse', 'blink', 'shear', 'cylinder', 'marble', 'rowShift', 'lightRays', 'pixelWave', 'electric', 'smoke', 'dust', 'colorBands', 'vhsTracking', 'oldFilm', 'neonSign', 'prismShift', 'flash', 'invertPulse', 'huePulse', 'edgePulse', 'warpWave', 'swirl', 'gridPulse', 'scanNoise', 'burst', 'sparkle', 'echoZoom', 'focusPull', 'depthField', 'vignettePulse', 'grainPulse', 'shadowPulse', 'waveShift', 'colorSplit', 'zoomSpin', 'slideEcho', 'blurPulse', 'tintPulse', 'mosaicPulse', 'strobeFlash', 'ripplePulse', 'vortexPulse', 'shearPulse', 'skewWave', 'tunnelSpin', 'fadeZoom', 'spinFade', 'lightLeak', 'neonPulse', 'haloPulse', 'fireGlow', 'iceGlow', 'prismWave', 'colorWave', 'starPulse', 'vignetteWave', 'sunsetGlow', 'moonGlow', 'cometTrail', 'rainbowWave', 'emberGlow', 'frostGlow', 'pulseRing', 'waveRipple', 'auroraWave', 'galaxyGlow', 'cometPulse', 'oceanWave', 'mistGlow', 'solarGlow', 'lunarGlow', 'stormCloud', 'crystalGlow', 'coralGlow', 'mintGlow', 'amberGlow', 'tealGlow', 'violetGlow', 'glowWave', 'glowRing', 'hologram', 'neonWave', 'prismGlow', 'auroraGlow', 'sunsetWave', 'oceanGlow', 'mistWave', 'stormGlow', 'emberWave', 'frostWave', 'pulseGlow', 'ringGlow', 'starGlow', 'cometGlow', 'moonWave', 'sunWave', 'nebulaGlow', 'quasarGlow', 'eclipseGlow', 'supernova', 'blackhole', 'wormhole', 'stardust', 'cosmosWave', 'lunarEclipse', 'auroraPulse', 'galaxyWave', 'nebulaWave', 'quasarWave', 'supernovaWave', 'cosmosGlow', 'eclipseWave', 'solarEclipse', 'auroraWavePulse', 'galaxyPulse', 'nebulaPulse', 'quasarPulse', 'supernovaPulse', 'cosmosPulse', 'eclipsePulse']) {
  ok(!!EFFECTS[k], `افکت ${k} هست`);
}
ok(Object.keys(EFFECTS).length === 272, `تعداد افکت‌ها ۲۷۲ است (بود ${Object.keys(EFFECTS).length})`);
ok(Object.keys(LAYER_TYPES).length === 11, `تعداد نوع لایه ۱۱ است (بود ${Object.keys(LAYER_TYPES).length})`);



console.log('── خط با دست (فاز ۱۹) ──');
import { drawPathPoints } from '../src/motion/render.js';
{
  const L = newLayer('draw', 0, 4);
  ok(L.data?.mode === 'wave', 'لایهٔ خط آزاد پیش‌فرض موجی است');
  const P = { w: 800, h: 200, trimS: 0, trimE: 100 };
  ok(drawPathPoints(P, L.data).length === 61, 'حالت موجی ۶۱ نقطه می‌دهد');
  const free = drawPathPoints(P, { mode: 'free', points: [[0, 0], [10, 5], [20, 0], [30, 5]] });
  ok(free.length === 4 && free[1][0] === 10, 'حالت آزاد دقیقاً همان نقاط ضبط‌شده را برمی‌گرداند');
  const trimmed = drawPathPoints({ ...P, trimS: 50, trimE: 100 }, { mode: 'free', points: [[0, 0], [10, 5], [20, 0], [30, 5]] });
  ok(trimmed.length === 2, 'برش مسیر روی خط ضبط‌شده هم کار می‌کند');
}

console.log('── خط با دست چندضربه‌ای (فاز ۴۲) ──');
import { drawPathStrokes } from '../src/motion/render.js';
{
  const P = { w: 800, h: 200, trimS: 0, trimE: 100 };
  const multi = { mode: 'free', strokes: [[[0, 0], [10, 5], [20, 0]], [[30, 0], [40, 5], [50, 0], [60, 5]]], points: [[0, 0], [10, 5], [20, 0], [30, 0], [40, 5], [50, 0], [60, 5]] };
  const ss = drawPathStrokes(P, multi);
  ok(ss.length === 2 && ss[0].length === 3 && ss[1].length === 4, 'دو ضربه جدا با طول درست برمی‌گردند');
  ok(drawPathPoints(P, multi).length === 7, 'drawPathPoints قدیمی با دادهٔ چندضربه‌ای مسطح برمی‌گرداند');
  const trimmed = drawPathStrokes({ ...P, trimS: 50, trimE: 100 }, multi);
  ok(trimmed[0].length === 2 && trimmed[1].length === 2, 'برش مسیر روی هر ضربه جدا اعمال می‌شود');
  const legacy = drawPathStrokes(P, { mode: 'free', points: [[0, 0], [10, 5], [20, 0]] });
  ok(legacy.length === 1 && legacy[0].length === 3, 'دادهٔ قدیمی تک‌ضربه‌ای یک ضربه می‌دهد');
  const wave = drawPathStrokes(P, { mode: 'wave' });
  ok(wave.length === 1 && wave[0].length === 61, 'حالت موجی هنوز یک ضربهٔ ۶۱ نقطه‌ای است');
  const mp = readFileSync(new URL('../src/ui/motionpanel.js', import.meta.url), 'utf8');
  ok(mp.includes('حذف آخرین ضربه') && mp.includes('strokes'), 'پنل خط آزاد دکمهٔ حذف آخرین ضربه و دادهٔ strokes دارد');
}


console.log('── دوربین روی شعر (فاز ۲۲) ──');
{
  const r = readFileSync(new URL('../src/engine/renderer.js', import.meta.url), 'utf8');
  const sc = readFileSync(new URL('../src/motion/schema.js', import.meta.url), 'utf8');
  const mp = readFileSync(new URL('../src/ui/motionpanel.js', import.meta.url), 'utf8');
  ok(r.includes('evalLayer') && r.includes('L.data?.lyrics'), 'رندرر شعر دوربینِ دارای تیک را اعمال می‌کند');
  ok(sc.includes('lyrics: false'), 'لایهٔ دوربین پیش‌فرض تیک شعر را ندارد (پروژه‌های قدیمی عوض نمی‌شوند)');
  ok(mp.includes('دوربین روی شعر'), 'پنل دوربین تیک شعر را دارد');
}


console.log('── عکس فریم (فاز ۲۶) ──');
{
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  ok(html.includes('id="exSnap"'), 'دکمهٔ عکس فریم در پنل خروجی هست');
  ok(main.includes("exSnap") && main.includes("toBlob"), 'سیم‌کشی عکس فریم با toBlob و saveFile هست');
}

console.log('── نشانگرهای تایم‌لاین (فاز ۱۸) ──');
import { readFileSync } from 'node:fs';
{
  const tl = readFileSync(new URL('../src/ui/timeline.js', import.meta.url), 'utf8');
  const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  ok(tl.includes('addMarkerAtPlayhead'), 'تایم‌لاین متد افزودن نشانگر دارد');
  ok(tl.includes('_markers()') && tl.includes('getMarkers'), 'نشانگرها در اهداف چسبیدن (snap) هستند');
  ok(main.includes('getMarkers') && main.includes('markers: app.markers'), 'نشانگرها در ذخیرهٔ پروژه (payload) هستند');
  ok(html.includes('id="tlMark"'), 'دکمهٔ نشانگر در نوار تایم‌لاین هست');
}

console.log(fail ? `\n❌ ${fail} تست ناموفق` : '\n✅ همهٔ تست‌ها گذشت');
process.exit(fail ? 1 : 0);
