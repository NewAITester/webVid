/**
 * تحلیل صدا در مرورگر
 *
 * تا حالا از analysis.json استفاده می‌کردیم که از قبل با librosa ساخته
 * شده بود. این یعنی اپ فقط همان یک آهنگ را می‌شناخت. اینجا همان کار
 * را کامل در مرورگر انجام می‌دهیم تا هر آهنگی قابل استفاده باشد.
 *
 * مراحل:
 *   ۱) تبدیل فوریه روی پنجره‌های کوتاه (STFT)
 *   ۲) منحنی‌های انرژی: بلندی کل، باس، مرکز طیفی
 *   ۳) «شار طیفی» برای تشخیص ضربه‌ها (onset)
 *   ۴) تمپو از خودهمبستگی منحنی ضربه
 *   ۵) فاز ضرب: کجای آهنگ ضرب اول می‌افتد
 */

/* ── تبدیل فوریهٔ سریع، بدون وابستگی ───────────────────────── */
function fftRadix2(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const ur = re[i + k], ui = im[i + k];
        const vr = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci;
        const vi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
        re[i + k] = ur + vr; im[i + k] = ui + vi;
        re[i + k + len / 2] = ur - vr; im[i + k + len / 2] = ui - vi;
        const ncr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr; cr = ncr;
      }
    }
  }
}

const FFT_N = 2048;
const HOP = 512;

/**
 * @param {AudioBuffer} buf
 * @param {(p:number,msg:string)=>void} onProgress
 */
export async function analyzeBuffer(buf, onProgress = () => {}) {
  const sr = buf.sampleRate;
  const n = buf.length;

  // میکس مونو
  const mono = new Float32Array(n);
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const ch = buf.getChannelData(c);
    for (let i = 0; i < n; i++) mono[i] += ch[i];
  }
  const inv = 1 / buf.numberOfChannels;
  for (let i = 0; i < n; i++) mono[i] *= inv;

  const frames = Math.max(1, Math.floor((n - FFT_N) / HOP));
  const hann = new Float32Array(FFT_N);
  for (let i = 0; i < FFT_N; i++) hann[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (FFT_N - 1));

  const rms = new Float32Array(frames);
  const low = new Float32Array(frames);
  const cen = new Float32Array(frames);
  const flux = new Float32Array(frames);

  const re = new Float32Array(FFT_N), im = new Float32Array(FFT_N);
  const mag = new Float32Array(FFT_N / 2);
  let prev = new Float32Array(FFT_N / 2);

  const binHz = sr / FFT_N;
  const lowBin = Math.max(1, Math.round(200 / binHz));

  for (let f = 0; f < frames; f++) {
    const off = f * HOP;
    let e = 0;
    for (let i = 0; i < FFT_N; i++) {
      const v = mono[off + i];
      e += v * v;
      re[i] = v * hann[i];
      im[i] = 0;
    }
    rms[f] = Math.sqrt(e / FFT_N);
    fftRadix2(re, im);

    let lo = 0, num = 0, den = 0, fl = 0;
    for (let k = 1; k < FFT_N / 2; k++) {
      const m = Math.hypot(re[k], im[k]);
      mag[k] = m;
      if (k <= lowBin) lo += m;
      num += k * binHz * m;
      den += m;
      const d = m - prev[k];
      if (d > 0) fl += d;            // فقط افزایش انرژی = شروع صدا
    }
    low[f] = lo;
    cen[f] = den > 1e-9 ? num / den : 0;
    flux[f] = fl;
    prev.set(mag);

    if ((f & 1023) === 0) {
      onProgress(f / frames * 0.75, 'تحلیل طیفی…');
      await new Promise(r => setTimeout(r, 0));
    }
  }

  onProgress(0.8, 'یافتن ضرب…');
  await new Promise(r => setTimeout(r, 0));

  const frameRate = sr / HOP;                 // فریم بر ثانیه
  const { tempo, beats } = findBeats(flux, frameRate, buf.duration);

  // منحنی‌ها را به گام ۰٫۰۹۳ ثانیه کم‌نمونه می‌کنیم (همان فرمت قبلی)
  const tStep = 0.09287981859410431;
  const outN = Math.max(1, Math.floor(buf.duration / tStep));
  const pick = (src) => {
    const o = new Array(outN);
    const ratio = frameRate * tStep;
    for (let i = 0; i < outN; i++) {
      const a = Math.floor(i * ratio), b2 = Math.min(frames, Math.floor((i + 1) * ratio) + 1);
      let s = 0, c = 0;
      for (let j = a; j < b2; j++) { s += src[j]; c++; }
      o[i] = c ? s / c : 0;
    }
    return o;
  };

  onProgress(1, 'آماده');
  return {
    duration: buf.duration,
    tempo,
    beats,
    vocal_entry: 0,
    key: '',
    t_step: tStep,
    rms: pick(rms),
    low: pick(low),
    centroid: pick(cen),
    voc: pick(cen),
    sections: [],
  };
}

/**
 * تمپو و شبکهٔ ضرب از منحنی شروع صدا.
 *
 * روش: اول منحنی را هموار و نرمال می‌کنیم، بعد خودهمبستگی می‌گیریم.
 * قلهٔ خودهمبستگی در بازهٔ ۶۰ تا ۲۰۰ ضرب در دقیقه، دورهٔ ضرب است.
 * بعد دنبال فازی می‌گردیم که مجموع انرژی روی ضرب‌ها بیشینه شود.
 */
function findBeats(flux, frameRate, duration) {
  const n = flux.length;

  // حذف روند کند، تا بخش‌های بلند آهنگ بر تحلیل غالب نشوند
  const W = Math.round(frameRate * 1.5);
  const env = new Float32Array(n);
  let run = 0;
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - W), b = Math.min(n, i + W);
    if (i === 0) { run = 0; for (let j = a; j < b; j++) run += flux[j]; }
    const mean = run / (b - a);
    env[i] = Math.max(0, flux[i] - mean);
    if (i + W < n) run += flux[i + W];
    if (i - W >= 0) run -= flux[i - W];
  }
  let mx = 0; for (let i = 0; i < n; i++) if (env[i] > mx) mx = env[i];
  if (mx > 0) for (let i = 0; i < n; i++) env[i] /= mx;

  // خودهمبستگی
  const minLag = Math.round((60 / 200) * frameRate);   // ۲۰۰ BPM
  const maxLag = Math.round((60 / 60) * frameRate);    // ۶۰ BPM
  let bestLag = minLag, bestVal = -1;
  for (let lag = minLag; lag <= maxLag; lag++) {
    let s = 0;
    for (let i = 0; i + lag < n; i++) s += env[i] * env[i + lag];
    s /= (n - lag);
    // ترجیح ملایم به حوالی ۱۲۰ ضرب در دقیقه، برای پرهیز از نصف/دوبرابر
    const bpm = (60 * frameRate) / lag;
    const prior = Math.exp(-0.5 * Math.pow(Math.log2(bpm / 125) / 0.9, 2));
    s *= prior;
    if (s > bestVal) { bestVal = s; bestLag = lag; }
  }

  // پالایش دوره با مرکز جرم اطراف قله
  let num = 0, den = 0;
  for (let lag = bestLag - 2; lag <= bestLag + 2; lag++) {
    if (lag < minLag || lag > maxLag) continue;
    let s = 0;
    for (let i = 0; i + lag < n; i++) s += env[i] * env[i + lag];
    s /= (n - lag);
    num += lag * s; den += s;
  }
  const period = den > 0 ? num / den : bestLag;
  const tempo = (60 * frameRate) / period;

  /* ردیابی ضرب با برنامه‌نویسی پویا (روش Ellis، همان که librosa دارد).

     چرا جستجوی شبکه‌ای کافی نبود: آن مدل دورهٔ کاملاً ثابت فرض
     می‌کند، ولی آهنگ واقعی کمی نوسان تمپو دارد. با دورهٔ ثابت،
     خطای ۰٫۳ ضرب در دقیقه تا آخر آهنگ ۳۵۰ میلی‌ثانیه انباشته
     می‌شد — یعنی نزدیک یک‌سوم ضرب.

     اینجا به‌جای یک دوره، برای هر فریم بهترین «ضرب قبلی» را پیدا
     می‌کنیم: امتیاز = انرژی ضربه + امتیاز تجمعی ضرب قبلی − جریمهٔ
     انحراف از دورهٔ هدف. جریمه لگاریتمی است، پس انحراف کوچک تقریباً
     رایگان و انحراف بزرگ گران است. آخرش از بهترین ضرب پایانی به
     عقب برمی‌گردیم. */
  const p = Math.round(period);
  const TIGHT = 100;                 // همان مقدار پیش‌فرض librosa
  const lo = Math.max(1, Math.round(p / 2));
  const hi = Math.round(p * 2);

  // جریمهٔ از پیش محاسبه‌شده برای هر فاصلهٔ ممکن
  const pen = new Float32Array(hi + 1);
  for (let d = lo; d <= hi; d++) pen[d] = -TIGHT * Math.pow(Math.log(d / p), 2);

  const cum = new Float32Array(n);
  const back = new Int32Array(n).fill(-1);
  for (let i = 0; i < n; i++) {
    let best = -Infinity, bj = -1;
    const jlo = Math.max(0, i - hi), jhi = i - lo;
    for (let j = jlo; j <= jhi; j++) {
      const v = cum[j] + pen[i - j];
      if (v > best) { best = v; bj = j; }
    }
    if (bj < 0) { cum[i] = env[i]; back[i] = -1; }
    else { cum[i] = env[i] + best; back[i] = bj; }
  }

  // ضرب پایانی: بهترین امتیاز در انتهای آهنگ
  let last = 0, lastV = -Infinity;
  const tailFrom = Math.max(0, n - hi);
  for (let i = tailFrom; i < n; i++) if (cum[i] > lastV) { lastV = cum[i]; last = i; }

  const idx = [];
  for (let i = last; i >= 0; i = back[i]) { idx.push(i); if (back[i] < 0) break; }
  idx.reverse();

  const beats = idx.map(i => +(i / frameRate).toFixed(4));

  // تمپوی گزارش‌شده = میانهٔ فاصلهٔ ضرب‌ها
  let tempoR = tempo;
  if (beats.length > 4) {
    const d = [];
    for (let i = 1; i < beats.length; i++) d.push(beats[i] - beats[i - 1]);
    d.sort((x, y) => x - y);
    tempoR = 60 / d[d.length >> 1];
  }
  return { tempo: +tempoR.toFixed(3), beats };

}

/** فایل صوتی → AudioBuffer */
export async function decodeAudioFile(file) {
  const ab = file instanceof ArrayBuffer ? file : await file.arrayBuffer();
  const Ctx = window.AudioContext || window.webkitAudioContext;
  const ctx = new Ctx();
  try {
    return await ctx.decodeAudioData(ab.slice(0));
  } finally {
    ctx.close?.();
  }
}
