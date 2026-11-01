/**
 * تست افکت‌های صوتی فاز ۲۳ — با actx ساختگی، بدون مرورگر.
 *   node tests/audio-fx.test.mjs
 */
import { makeImpulse, applyAudioFx } from '../src/motion/audio.js';

let fail = 0;
const ok = (c, m) => { console.log((c ? '  ✅' : '  ❌') + ' ' + m); if (!c) fail++; };

function fakeActx() {
  const conns = [];
  const node = (kind) => ({
    kind, gain: { value: 0 }, delayTime: { value: 0 }, buffer: null,
    connect: (t) => { conns.push([kind, t?.kind || 'dest']); },
  });
  return {
    sampleRate: 48000, conns,
    createBuffer: (ch, len, rate) => ({
      length: len, sampleRate: rate,
      getChannelData: () => new Float32Array(len),
    }),
    createGain: () => node('gain'),
    createDelay: () => node('delay'),
    createConvolver: () => node('convolver'),
  };
}

console.log('── پاسخ ضربهٔ ریورب ──');
{
  const actx = fakeActx();
  const buf = makeImpulse(actx, 2, 3);
  ok(buf.length === 96000, 'ایمپالس ۲ ثانیه‌ای ۹۶۰۰۰ نمونه دارد');
  const d = buf.getChannelData(0);
  ok(Math.abs(d[0]) <= 1 && Math.abs(d[95999]) < 0.01, 'نویز نمایی محو می‌شود');
  const buf2 = makeImpulse(actx, 2, 3);
  ok(buf2.getChannelData(0)[100] === d[100], 'ایمپالس قطعی است — دو بار اجرا یک نتیجه می‌دهد');
}

console.log('── زنجیرهٔ افکت ──');
{
  const actx = fakeActx();
  const gain = actx.createGain();
  applyAudioFx(actx, gain, { data: { audioFx: 'none' } }, { kind: 'dest' });
  ok(actx.conns.some(([a, b]) => a === 'gain' && b === 'dest'), 'بدون افکت: gain مستقیم به خروجی می‌رسد');
  const actx2 = fakeActx();
  applyAudioFx(actx2, actx2.createGain(), { data: { audioFx: 'echo', echoDelay: 0.3, echoMix: 40 } }, { kind: 'dest' });
  ok(actx2.conns.some(([a]) => a === 'delay'), 'اکو: نود تأخیر در زنجیره هست');
  const actx3 = fakeActx();
  applyAudioFx(actx3, actx3.createGain(), { data: { audioFx: 'reverb', reverbDecay: 2, reverbMix: 40 } }, { kind: 'dest' });
  ok(actx3.conns.some(([a]) => a === 'convolver'), 'ریورب: نود کانوولوِر در زنجیره هست');
}

console.log(fail ? `\n❌ ${fail} تست ناموفق` : '\n✅ همهٔ تست‌ها گذشت');
process.exit(fail ? 1 : 0);
