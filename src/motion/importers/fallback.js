/**
 * «برداشت ساده» برای کدهایی که مستقیم قابل اجرا نیستند
 * ─────────────────────────────────────────────────────────────
 * پایتون فریم‌به‌فریم (PIL، OpenCV، ffmpeg، …)، اسکریپت‌های سازنده یا کد ناشناخته:
 * متن‌ها، رنگ‌ها، اندازهٔ قاب، مدت و فایل‌های تصویر را از خود کد برمی‌دارد و
 * یک مدل ساده (صحنه به ازای هر متن) می‌سازد تا بشود از آن پروژه ساخت.
 * متن‌های پیدا‌شده به فهرست «مقدارهای قابل‌تغییر» هم اضافه می‌شوند.
 */
const SKIP = /^(utf-?8|ascii|latin-?1|rgba?|bgra?|hsv|l|p|1|cmyk|yuv\d*|center|left|right|top|bottom|middle|w|wb|r|rb|a|x|y|png|jpe?g|mp4|webm|libx264|aac|yuv420p|true|false|none|null|auto|main|__main__|fast|slow|medium|ultrafast|black|white|red|green|blue|arial|sans|serif|bold|normal|ignore|strict|replace|nearest|bilinear|bicubic|lanczos|-y|-i|-r|-c:v|-pix_fmt|-vf|-crf|-preset)$/i;
const FILE_RE = /\.(png|jpe?g|gif|webp|svg|mp4|webm|mov|mp3|wav|ogg|ttf|otf|json|txt|html?|js|css|py)$/i;
const IMG_RE = /\.(png|jpe?g|gif|webp|svg)$/i;
const lum = hex => { const h = hex.replace('#', ''); const [r, g, b] = [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) / 255); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const hx = n => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0').toUpperCase();

/** رشته‌های متنی داخل کد (نه مسیر فایل، نه کلیدواژه) با جایشان در متن */
export function literals(src) {
  const out = [];
  const lines = String(src).split('\n');
  let off = 0, inDoc = false;
  for (const line of lines) {
    const tq = (line.match(/"""|'''/g) || []).length;
    const skip = inDoc || tq || /^\s*(#|\/\/|import\b|from\s+\S+\s+import|require\(|@)/.test(line);
    if (tq % 2) inDoc = !inDoc;
    if (!skip) {
      const re = /([fFrRbBuU]{0,2})(["'`])((?:\\.|(?!\2)[^\\\n])*)\2/g;
      let m;
      while ((m = re.exec(line))) {
        const pre = m[1].toLowerCase(), s = m[3];
        if (pre.includes('b') || pre.includes('r') && /\\/.test(s)) continue;
        if (s.length < 2 || s.length > 90 || /[{}%<>\\]|\$\{/.test(s) || FILE_RE.test(s) || /[\/]/.test(s) && !/\s/.test(s)) continue;
        if (SKIP.test(s.trim()) || /^#?[0-9a-f]{3,8}$/i.test(s) || /^[\d\s.,:x×-]+$/i.test(s) || /^[a-z_][\w.-]*$/.test(s) && !/[A-Z]/.test(s) && s.length < 14) continue;
        if (/^-{1,2}\w/.test(s) || /^\w+\(/.test(s)) continue;
        const at = off + m.index + m[1].length;
        out.push({ str: s.replace(/\\n/g, '\n').replace(/\\(['"`])/g, '$1'), s: at, e: at + s.length + 2, quote: m[2], line: lines.indexOf(line) + 1 });
      }
    }
    off += line.length + 1;
  }
  return out;
}

function colors(src) {
  const out = [];
  for (const m of String(src).matchAll(/#([0-9a-f]{6}|[0-9a-f]{3})\b/gi)) out.push('#' + (m[1].length === 3 ? [...m[1]].map(c => c + c).join('') : m[1]).toUpperCase());
  for (const m of String(src).matchAll(/\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*(?:,\s*\d{1,3}\s*)?\)/g)) {
    const v = [m[1], m[2], m[3]].map(Number);
    if (v.every(x => x <= 255) && !(v[0] > 100 && v[1] > 100 && v[2] < 10)) out.push('#' + v.map(hx).join(''));
  }
  return [...new Set(out)];
}

/**
 * @param {string} src  متن کد
 * @param {object} r    نتیجهٔ فعلی (tweaks، files، …)
 * @param {object} o    { name, values }
 * @returns {object|null} مدل میانی برای emitScript
 */
export function fallbackModel(src, r, { name = 'code', values = null } = {}) {
  const tw = r.tweaks || [];
  const val = t => (values && t.id in values ? values[t.id] : t.value);
  // متن‌های کد ← مقدار قابل‌تغییر (اگر قبلاً نبوده)
  const known = new Set(tw.map(t => t.s));
  let k = 0;
  for (const L of literals(src)) {
    if (known.has(L.s)) continue;
    const id = `TXT_${++k}`;
    tw.push({ id, label: `متن «${L.str.slice(0, 30)}»`, group: 'متن‌های کد', type: 'text', value: values && id in values ? values[id] : L.str, def: L.str, quote: L.quote, s: L.s, e: L.e, line: L.line });
  }
  r.tweaks = tw;
  const num = re => { const t = tw.find(t => t.type === 'num' && re.test(t.id)); return t ? +val(t) : null; };
  // قاب
  let W0 = num(/^(W|WIDTH|VIDEO_?W(IDTH)?|IMG_?W|FRAME_?W(IDTH)?)$/i), H0 = num(/^(H|HEIGHT|VIDEO_?H(EIGHT)?|IMG_?H|FRAME_?H(EIGHT)?)$/i);
  if (!(W0 > 100 && H0 > 100)) {
    const m = /\(\s*(\d{3,4})\s*,\s*(\d{3,4})\s*\)/.exec(src) || /(\d{3,4})\s*[x×]\s*(\d{3,4})/.exec(src);
    if (m && +m[1] >= 240 && +m[2] >= 240) { W0 = +m[1]; H0 = +m[2]; } else { W0 = 1920; H0 = 1080; }
  }
  // متن‌ها (به ترتیب کد، بدون تکرار)
  const texts = [...new Set(tw.filter(t => t.type === 'text').map(val).map(s => String(s).trim())
    .filter(s => s.length >= 2 && !FILE_RE.test(s) && !SKIP.test(s) && !/^#?[0-9a-f]{6}$/i.test(s)))].slice(0, 24);
  const images = [...new Set([...(r.files || []), ...[...String(src).matchAll(/['"]([^'"\n]+\.(?:png|jpe?g|gif|webp|svg))['"]/gi)].map(m => m[1])])].filter(f => IMG_RE.test(f) && !/[%{}*]/.test(f)).slice(0, 8);
  // مدت
  const fps = num(/^(FPS|FRAME_?RATE)$/i) || 30;
  let dur = num(/^(DUR|DURATION|SECONDS|SECS|LENGTH|TOTAL(_?(DUR|TIME|SECONDS))?|VIDEO_?(DUR|LEN(GTH)?))$/i);
  const frames = num(/^(FRAMES|N_?FRAMES|TOTAL_?FRAMES|NUM_?FRAMES)$/i);
  if (!(dur > 0) && frames > 0) dur = frames / fps;
  const nScenes = Math.max(1, texts.length + images.length);
  if (!(dur > 0 && dur < 3600)) dur = Math.max(5, Math.min(60, nScenes * 2.5));
  // رنگ‌ها
  const cols = [...new Set([...tw.filter(t => t.type === 'color').map(val).map(c => String(c).slice(0, 7).toUpperCase()), ...colors(src)])].filter(c => /^#[0-9A-F]{6}$/.test(c));
  const bgT = tw.find(t => t.type === 'color' && /bg|back|background|زمینه/i.test(t.id + ' ' + t.label));
  const bg = bgT ? String(val(bgT)).slice(0, 7) : cols.slice().sort((a, b) => lum(a) - lum(b))[0] || '#0B0C10';
  const dark = lum(bg) < 0.5;
  const ink = cols.filter(c => c !== bg && Math.abs(lum(c) - lum(bg)) > 0.45)[0] || (dark ? '#F6F3EC' : '#111111');
  const acc = cols.filter(c => c !== bg && c !== ink && Math.abs(lum(c) - lum(bg)) > 0.2)[0] || '#E4142A';
  if (!texts.length && !images.length && !cols.length) return null;

  const S = Math.min(W0, H0) / 1080, items = [], scenes = [];
  const parts = [...texts.map(s => ({ kind: 'text', s })), ...images.map(f => ({ kind: 'img', f }))];
  if (!parts.length) parts.push({ kind: 'bg' });
  const step = dur / parts.length;
  parts.forEach((p, i) => {
    const t0 = +(i * step).toFixed(3), t1 = +((i + 1) * step).toFixed(3);
    scenes.push({ name: p.kind === 'text' ? p.s.split('\n')[0].slice(0, 28) : p.kind === 'img' ? '🖼 ' + p.f.split(/[\\/]/).pop() : 'صحنه', t0, t1 });
    items.push({ type: 'bg', c: bg, t0, t1, z: 0, name: 'پس‌زمینه' });
    if (p.kind === 'text') {
      const len = Math.max(...p.s.split('\n').map(l => [...l].length));
      items.push({ type: 'text', str: p.s, t0, t1, x: 0, y: 0, size: Math.round(Math.max(40, Math.min(130, (W0 * 0.8) / Math.max(1, len) / 0.6)) ), color: i % 3 === 2 ? acc : ink, z: 2, enter: ['fade', Math.min(0.5, step * 0.25)], exit: ['fade', Math.min(0.4, step * 0.2)] });
    } else if (p.kind === 'img') {
      items.push({ type: 'shape', kind: 'rect', w: W0 * 0.6, h: H0 * 0.6, fill: '#00000000', fillOn: false, stroke: acc, strokeW: 4 * S, radius: 12 * S, t0, t1, z: 1, name: '📁 ' + p.f });
      items.push({ type: 'text', str: p.f.split(/[\\/]/).pop(), t0, t1, x: 0, y: 0, size: 34 * S, color: ink, z: 2, name: 'برچسب رسانه' });
    }
  });
  return {
    W0, H0, duration: +dur.toFixed(3), title: texts[0] || '', source: name, kindLabel: 'برداشت از متن‌ها، رنگ‌ها و فایل‌های کد',
    scenes, items, media: images.map(f => ({ kind: 'تصویر', file: f })), audio: [],
    notes: ['این کد مستقیم قابل اجرا نبود؛ فقط متن‌ها، رنگ‌ها، اندازهٔ قاب و تصویرهایش برداشته شد.'],
  };
}
