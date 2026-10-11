/**
 * ساخت پروژهٔ آمادهٔ «شوریل موشن» برای برنامه — همان شوریل، ولی با
 * قطعه‌های داخل برنامه: استایل‌های ویدیو، شعر، بین‌خوانی و لایه‌ها.
 *   node showreel/make_template.mjs <reel.wav> <reel.mp3>
 * خروجی: public/templates/motion-reel.lyricstudio.json
 */
import fs from 'fs';
import { ELEMENTS, TEXT_STYLES, buildElement, applyTextStyle } from '../src/motion/presets.js';
import { newLayer } from '../src/motion/schema.js';

const [wavPath, mp3Path] = process.argv.slice(2);
const BEAT = 60 / 128, BAR = BEAT * 4, DUR = 15;
const beats = Array.from({ length: 32 }, (_, i) => +(i * BEAT).toFixed(4));

/* تحلیل صدا از روی WAV: بلندی (rms) و انرژی بم (low) هر ۵۰ میلی‌ثانیه */
const wav = fs.readFileSync(wavPath), ch = wav.readUInt16LE(22), sr = wav.readUInt32LE(24);
const n = (wav.length - 44) / 2 / ch, step = 0.05, hop = Math.round(sr * step);
const rms = [], low = [];
let lp = 0;
for (let i = 0; i < n; i += hop) {
  let s = 0, sl = 0;
  for (let j = i; j < Math.min(n, i + hop); j++) {
    const v = wav.readInt16LE(44 + j * ch * 2) / 32768;
    lp += (v - lp) * 0.02; s += v * v; sl += lp * lp;
  }
  rms.push(+Math.sqrt(s / hop).toFixed(4)); low.push(+Math.sqrt(sl / hop).toFixed(4));
}
const analysis = { tempo: 128, beats, t_step: step, rms, low, voc: rms.map(() => 0), centroid: rms.map(() => 0.5), duration: DUR };

/* شعر: کلمه‌ها روی ضرب‌ها */
const fmt = t => `${String(Math.floor(t / 60)).padStart(2, '0')}:${(t % 60).toFixed(2).padStart(5, '0')}`;
const line = (...ws) => `[${fmt(ws[0][1])}]` + ws.map(([w, t]) => `<${fmt(t)}>${w}`).join(' ');
const lrc = [
  line(['حرکت', beats[8]]), line(['موشن', beats[9]]), line(['ریتم', beats[10]]), line(['طراحی', beats[11]]),
  line(['دنیای', beats[12] + 0.1], ['سه‌بعدی', beats[13]]),
  line(['هزار', beats[16] + 0.1], ['ذره', beats[17]], ['با', beats[18]], ['ضرب', beats[19]]),
  line(['همه', beats[20] + 0.1], ['با', beats[21]], ['ریتم', beats[22]]),
].join('\n');

/* بخش‌ها: هر میزان یک «استایل ویدیو» از قطعه‌های شوریل */
const S = (b0, b1, style, acc, extra = {}) => [+(b0 * BAR).toFixed(3), +(b1 * BAR).toFixed(3), style, acc, { lyric: [], screen: [], bg: style, ...extra }];
const sections = [
  S(0, 1, 'vs_reel_burst', '#E4142A', { idle: ['title'] }),
  S(1, 2, 'vs_reel_shapes', '#E4142A', { idle: [] }),
  S(2, 3, 'vs_reel_type', '#E4142A'),
  S(3, 4, 'vs_reel_wire', '#18E0FF'),
  S(4, 5, 'vs_reel_galaxy', '#FF2E97'),
  S(5, 6, 'vs_reel_grid', '#FF2E97'),
  S(6, 7, 'vs_reel_eq', '#E4142A', { idle: ['shockb', 'warp'] }),
  S(7, 8, 'vs_reel_galaxy', '#E4142A', { idle: [] }),
];
sections[sections.length - 1][1] = DUR;

/* لایه‌ها: عنصرهای آمادهٔ شوریل */
const W = 1920, H = 1080;
const el = id => ELEMENTS.find(e => e.id === id);
const layers = [];
const add = (id, t0, t1, tweak = () => {}) => { const L = buildElement(el(id), t0, t1 - t0, W, H); tweak(L); L.t0 = t0; L.t1 = t1; layers.push(L); return L; };
add('reelBurst', 0, BAR, L => { L.behind = true; });
add('reelWipe', 2 * BAR - 0.25, 2 * BAR + 0.25, L => { L.props.w = { v: 2400 }; L.props.h = { v: 2400 }; L.name = 'گذار ۱'; });
add('reelWipe', 5 * BAR - 0.25, 5 * BAR + 0.25, L => { L.props.w = { v: 2400 }; L.props.h = { v: 2400 }; L.props.c1 = { v: '#FF2E97' }; L.name = 'گذار ۲'; });
add('reelEq', 6 * BAR, 7 * BAR, L => { L.behind = true; L.props.w = { v: 900 }; L.props.h = { v: 900 }; });
add('reelSwarmText', 7 * BAR, DUR, L => {
  L.data.code = L.data.code.replace("text: 'MOTION'", "text: 'MOTION REEL'").replace('e.p * 2', 'e.p * 1.7');
  L.props.w = { v: 1700 }; L.props.h = { v: 420 }; L.props.y = { v: -70 }; L.name = 'امضا از ذره‌ها';
});
{
  const T = newLayer('text', 7 * BAR + 0.9, DUR); T.name = 'امضا';
  T.data.str = 'طراحی و کد: Notion AI';
  applyTextStyle(T, TEXT_STYLES.find(s => s.id === 'slam'), W, H);
  T.props.size = { v: 64 }; T.props.y = { v: 250 };
  layers.push(T);
}

const look = {
  grain: 0.02, bloom: 0.55, chroma: 1, furniture: false, accents: {}, fx: { lyric: [], screen: [] },
  lyricFont: null, mixes: [], noGhost: true, idle: [], idleOpt: { amt: 1, minGap: 2, color: '' },
};
const audio = 'data:audio/mpeg;base64,' + fs.readFileSync(mp3Path).toString('base64');
const out = {
  kind: 'lyricstudio-project', v: 1, savedAt: new Date().toISOString(),
  meta: { name: 'شوریل موشن ۱۵ ثانیه', title: 'MOTION REEL', artist: 'Notion AI', tg: '', aspect: '16:9', length: DUR, duration: DUR, lrc },
  state: { look, overrides: {}, sections, custom: null, code: null, lineFx: {}, texts: [], layers },
  audio, analysis,
};
const dst = new URL('../public/templates/motion-reel.lyricstudio.json', import.meta.url);
fs.writeFileSync(dst, JSON.stringify(out));
console.log('template', fs.statSync(dst).size, 'bytes,', layers.length, 'layers,', sections.length, 'sections');
