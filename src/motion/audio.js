/**
 * صدای لایه‌ها به سبک Alight Motion — منطق خالص، بدون DOM
 * ─────────────────────────────────────────────────────────────
 * لایهٔ صوتی (audio) و صدای ویدیو (video.sound) هر دو با همین
 * حساب‌ها کار می‌کنند: پنجرهٔ منبع [trimIn, trimOut)، تکرار،
 * بلندی صدا و محوِ شروع/پایان. چون خالص است، تست Node هم
 * می‌تواند آن را بررسی کند و پیش‌نمایش و خروجی یک حساب را
 * به کار می‌برند (پیش‌نمایش با عنصر <audio>/<video>، خروجی
 * با OfflineAudioContext).
 */

/** پنجرهٔ منبع بر حسب ثانیهٔ فایل؛ trimOut برابر null یعنی تا انتهای فایل */
export function sourceWindow(L, dur) {
  const start = Math.max(0, L.data?.trimIn || 0);
  let end = L.data?.trimOut;
  if (end == null || !(end > start)) end = dur > 0 ? dur : start + 1e9;
  return [start, Math.max(start + 0.01, end)];
}

/** زمانی از فایل که در زمان محلی lt باید پخش شود (مثل MediaPool.mediaTime) */
export function mediaTime(L, lt, dur) {
  const sp = L.data?.speed || 1;
  const [start, end] = sourceWindow(L, dur);
  const win = end - start;
  let mt;
  if (L.data?.loop !== false) mt = start + (((lt * sp) % win) + win) % win;
  else mt = Math.min(start + lt * sp, end - 0.04);
  return Math.max(start, mt);
}

/**
 * بهرهٔ نهایی صدا در زمان محلی lt (۰..~۲):
 * بلندی لایه × محو شروع × محو پایان. برای ویدیو، vol از
 * ویژگی vol می‌آید؛ برای لایهٔ صوتی هم همین کلید است.
 */
export function audioGain(L, lt, volProp) {
  const dur = Math.max(0, (L.t1 || 0) - (L.t0 || 0));
  const vol = volProp != null ? volProp : (L.props?.vol?.v ?? 100);
  let g = Math.max(0, vol) / 100;
  const fi = Math.max(0, L.data?.fadeIn || 0), fo = Math.max(0, L.data?.fadeOut || 0);
  if (fi > 0) g *= Math.min(1, Math.max(0, lt) / fi);
  if (fo > 0) g *= Math.min(1, Math.max(0, dur - lt) / fo);
  return g;
}

/** آیا این لایه در خروجی صدا دارد؟ (صوتی، یا ویدیوی با sound روشن) */
/**
 * پاسخ ضربهٔ ریورب — نویز نماییِ قطعی (بدون Math.random تا خروجی
 * تکرارپذیر بماند). actx فقط createBuffer می‌خواهد، پس در Node هم
 * با یک actx ساختگی قابل تست است.
 */
export function makeImpulse(actx, seconds = 2, decay = 3) {
  const rate = actx.sampleRate || 48000;
  const len = Math.max(1, Math.floor(rate * Math.max(0.1, seconds)));
  const buf = actx.createBuffer(2, len, rate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      const h = Math.sin(i * 12.9898 + ch * 78.233) * 43758.5453;
      d[i] = (h - Math.floor(h)) * 2 - 1;
      d[i] *= Math.pow(1 - i / len, decay);
    }
  }
  return buf;
}

/**
 * زنجیرهٔ افکت صوتی لایه بین gain و destination.
 * L.data.audioFx: 'none' | 'echo' | 'reverb'.
 * فقط در خروجی (OfflineAudioContext) استفاده می‌شود؛ پیش‌نمایش
 * با عنصر <audio> پخش می‌شود و خشک می‌ماند.
 */
export function applyAudioFx(actx, gain, L, destination) {
  const fx = L.data?.audioFx || 'none';
  gain.connect(destination);
  if (fx === 'echo') {
    const delay = actx.createDelay(2);
    delay.delayTime.value = Math.max(0.05, L.data?.echoDelay || 0.3);
    const fb = actx.createGain(); fb.gain.value = 0.35;
    const wet = actx.createGain(); wet.gain.value = Math.max(0, (L.data?.echoMix ?? 40)) / 100;
    gain.connect(delay); delay.connect(fb); fb.connect(delay); delay.connect(wet); wet.connect(destination);
  } else if (fx === 'reverb') {
    const conv = actx.createConvolver();
    conv.buffer = makeImpulse(actx, L.data?.reverbDecay || 2, 3);
    const wet = actx.createGain(); wet.gain.value = Math.max(0, (L.data?.reverbMix ?? 40)) / 100;
    gain.connect(conv); conv.connect(wet); wet.connect(destination);
  }
  return gain;
}

export function hasLayerAudio(L) {
  if (!L || L.visible === false) return false;
  if (L.type === 'audio') return !!L.data?.media;
  if (L.type === 'video') return !!L.data?.sound && !!L.data?.media;
  return false;
}
