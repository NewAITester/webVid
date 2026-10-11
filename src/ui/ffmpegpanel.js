import { h, faN, select, check } from './dom.js';
import {
  CONTAINERS, VCODECS, ACODECS, PRESETS_X264, TUNES, RECIPES,
  defaultOptions, buildArgs, commandText, parseCommand, isAudioOnly, isImageOut,
} from '../ffmpeg/args.js';
import { runFFmpeg, probeDuration, ffmpegSupported } from '../ffmpeg/engine.js';

/**
 * پنل «فشرده‌سازی و تبدیل» — همهٔ توان FFmpeg با چند ضربه
 * ─────────────────────────────────────────────────────────────
 * ورودی: آخرین ویدیوی خروجی این پروژه، یا هر فایلی از گوشی.
 * سه راه کار:
 *   ۱) یک «دستورپخت» آماده بزنید (تلگرام، واتس‌اپ، گیف…)
 *   ۲) تنظیمات را خودتان بچینید (کدک، کیفیت، اندازه، فیلتر، صدا…)
 *   ۳) دستور ffmpeg را مستقیم بنویسید
 * دستور ساخته‌شده همیشه پایین نمایش داده می‌شود تا یاد بگیرید.
 *
 * host: { getLastExport():{blob,name}|null, save(blob,name), share(uri) }
 */
export class FFmpegPanel {
  constructor(root, host) {
    this.root = root;
    this.host = host;
    this.o = defaultOptions();
    this.src = 'last';          // 'last' | 'file'
    this.file = null;
    this.duration = 0;
    this.raw = false;           // حالت دستور دلخواه
    this.rawText = '';
    this.abort = null;
    this.result = null;
    this._fileIn = h('input', { type: 'file', accept: 'video/*,audio/*,image/gif', class: 'hidden',
      onchange: async () => {
        this.file = this._fileIn.files?.[0] || null;
        this.src = 'file';
        this.duration = this.file ? await probeDuration(this.file) : 0;
        this.render();
      } });
    document.body.append(this._fileIn);
  }

  input() {
    if (this.src === 'file') return this.file ? { blob: this.file, name: this.file.name } : null;
    return this.host.getLastExport();
  }

  async render() {
    const R = this.root;
    R.innerHTML = '';
    R.append(h('div', { class: 'phead' }, 'فشرده‌سازی و تبدیل (FFmpeg)'));
    if (!ffmpegSupported()) {
      R.append(h('p', { class: 'msg err' }, 'این دستگاه WebAssembly ندارد؛ FFmpeg اجرا نمی‌شود.'));
      return;
    }
    R.append(h('p', { class: 'note' }, 'ویدیو را کم‌حجم کنید، قالبش را عوض کنید، گیف یا MP3 بگیرید، برش بزنید و فیلتر بگذارید. '
      + 'همه روی خود گوشی و بدون اینترنت انجام می‌شود؛ ولی چون پردازنده‌ی گوشی است، برای ویدیوی بلند حوصله لازم است.'));

    /* ورودی */
    const inp = this.input();
    if (inp && !this.duration && inp.blob) this.duration = await probeDuration(inp.blob);
    R.append(h('div', { class: 'frow btns' },
      h('button', { class: 'chip' + (this.src === 'last' ? ' on' : ''), onclick: async () => {
        this.src = 'last'; this.duration = 0; this.render();
      } }, 'آخرین خروجی'),
      h('button', { class: 'chip' + (this.src === 'file' ? ' on' : ''), onclick: () => { this._fileIn.value = ''; this._fileIn.click(); } }, 'انتخاب فایل…'),
      h('span', { class: 'pill' }, inp ? `${inp.name.slice(0, 26)} · ${faN((inp.blob.size / 1048576).toFixed(1))} مگ`
        + (this.duration ? ` · ${faN(this.duration.toFixed(1))} ث` : '') : 'ورودی ندارد — اول خروجی بگیرید یا فایل انتخاب کنید')));

    /* دستورپخت‌ها */
    R.append(h('div', { class: 'shead sm' }, 'دستورپخت آماده'));
    R.append(h('div', { class: 'agrid' }, ...RECIPES.map(r => h('button', { class: 'achip', onclick: () => {
      this.o = { ...defaultOptions(), ...r.o };
      if (this.o.container === 'mp4' && r.o.vcodec) this.o.vcodec = r.o.vcodec;
      this.raw = false; this.render();
    } }, r.label))));

    /* فرم */
    const form = h('div', { class: 'form ffm' });
    this._form(form);
    R.append(form);

    /* دستور */
    const cmd = this._cmd();
    const pre = h('textarea', { class: 'code sm', spellcheck: false, readOnly: !this.raw,
      value: this.raw ? this.rawText : cmd.text, oninput: () => { this.rawText = pre.value; } });
    R.append(h('div', { class: 'shead sm' }, 'دستور', h('div', { class: 'spacer' }),
      check('ویرایش دستی', this.raw, v => { this.raw = v; if (v) this.rawText = cmd.text; this.render(); })));
    R.append(pre);
    if (this.raw) {
      R.append(h('p', { class: 'note' }, `نام فایل ورودی را «${cmd.inName}» و خروجی را out.پسوند بنویسید (مثلاً out.mp4).`));
    }

    /* اجرا */
    const bar = h('div', { class: 'bar2 hidden' }, h('i'));
    const msg = h('div', { class: 'msg' });
    const log = h('pre', { class: 'ffl' });
    const go = h('button', { class: 'btn primary' }, 'اجرا');
    const cancel = h('button', { class: 'btn sm hidden' }, 'لغو');
    const out = h('div', { class: 'frow btns' });
    go.onclick = () => this._run({ bar, msg, log, go, cancel, out });
    cancel.onclick = () => this.abort?.abort();
    R.append(h('div', { class: 'frow btns' }, go, cancel), bar, msg, out,
      h('details', { class: 'xhelp' }, h('summary', {}, 'گزارش FFmpeg'), log));
  }

  _cmd() {
    const inp = this.input();
    const ext = (inp?.name.match(/\.([a-z0-9]+)$/i)?.[1] || 'mp4').toLowerCase();
    const inName = `in.${ext}`;
    const b = buildArgs(this.o, inName, this.duration);
    return { ...b, inName, text: commandText(b.args) };
  }

  _form(F) {
    const o = this.o;
    const upd = (rebuild = true) => { if (rebuild) this.render(); };
    const set = (k, rebuild = true) => v => { o[k] = v; upd(rebuild); };
    const num = (label, k, min, max, step, unit = '') => {
      const v = h('span', { class: 'v' }, faN(o[k]) + unit);
      const r = h('input', { type: 'range', class: 'rng', min, max, step, value: o[k],
        oninput: () => { o[k] = +r.value; v.textContent = faN(r.value) + unit; },
        onchange: () => this.render() });
      return h('div', { class: 'ctl' }, h('label', {}, label), r, v);
    };
    const grp = (title, open, ...kids) => h('details', { class: 'grp', open }, h('summary', {}, title), ...kids);

    F.append(h('div', { class: 'frow' }, h('label', {}, 'قالب خروجی'),
      select(CONTAINERS, o.container, v => {
        o.container = v;
        if (VCODECS[v] && !VCODECS[v].some(c => c[0] === o.vcodec)) o.vcodec = VCODECS[v][0][0];
        if (ACODECS[v] && !ACODECS[v].some(c => c[0] === o.acodec)) o.acodec = ACODECS[v][0][0];
        this.render();
      })));

    const C = o.container;
    if (isImageOut(C)) {
      F.append(num('زمان عکس', 'snapAt', 0, Math.max(1, Math.floor(this.duration || 60)), 0.1, ' ث'));
      F.append(this._sizeRow());
      return;
    }
    if (C === 'gif' || C === 'webp') {
      F.append(num('عرض', 'gifWidth', 120, 1080, 10, 'px'), num('فریم بر ثانیه', 'gifFps', 5, 30, 1));
      if (C === 'webp') F.append(num('فشردگی', 'crf', 0, 50, 1));
      F.append(h('div', { class: 'frow' }, h('label', {}, 'تکرار'),
        select([['0', 'بی‌نهایت'], ['1', 'یک‌بار'], ['-1', 'بدون تکرار']], String(o.gifLoop), v => { o.gifLoop = +v; this.render(); })));
      F.append(this._trimGroup(grp), this._filterGroup(grp));
      return;
    }
    if (!isAudioOnly(C)) {
      F.append(grp('تصویر', true,
        h('div', { class: 'frow' }, h('label', {}, 'کدک'), select(VCODECS[C] || VCODECS.mp4, o.vcodec, set('vcodec'))),
        o.vcodec === 'copy' ? h('p', { class: 'note' }, 'کپی: تصویر دست نمی‌خورد (خیلی سریع)؛ ولی فیلتر و تغییر اندازه هم اعمال نمی‌شود.') : [
          h('div', { class: 'frow btns' },
            ...[['crf', 'کیفیت ثابت'], ['bitrate', 'بیت‌ریت'], ['size', 'حجم هدف']].map(([v, lb]) =>
              h('button', { class: 'chip' + (o.rate === v ? ' on' : ''), onclick: () => { o.rate = v; this.render(); } }, lb))),
          o.rate === 'crf' ? [num('کیفیت (کمتر = بهتر)', 'crf', 0, 51, 1),
            h('p', { class: 'note' }, '۱۸ تقریباً بی‌افت، ۲۳ معمولی، ۲۸ کم‌حجم، بالای ۳۲ افت قابل‌دیدن.')] : null,
          o.rate === 'bitrate' ? num('بیت‌ریت تصویر', 'vbitrate', 200, 40000, 100, ' kb/s') : null,
          o.rate === 'size' ? [num('حجم نهایی', 'targetMB', 1, 500, 1, ' مگ'),
            h('p', { class: 'note' }, this.duration ? 'بیت‌ریت از روی طول ویدیو حساب می‌شود.' : 'طول ورودی معلوم نیست؛ اول ورودی را انتخاب کنید.')] : null,
          h('div', { class: 'frow' }, h('label', {}, 'سرعت فشرده‌سازی'),
            select(PRESETS_X264.map(p => [p, { ultrafast: 'خیلی سریع', superfast: 'بسیار سریع', veryfast: 'سریع (پیشنهادی)', faster: 'نسبتاً سریع', fast: 'متوسط سریع', medium: 'متوسط', slow: 'کند (کم‌حجم‌تر)', slower: 'کندتر', veryslow: 'خیلی کند' }[p]]), o.preset, set('preset'))),
        ]),
        this._sizeRow());
    }
    F.append(this._trimGroup(grp));
    if (!isAudioOnly(C) && o.vcodec !== 'copy') F.append(this._filterGroup(grp));

    if (o.acodec !== 'copy' || isAudioOnly(C)) {
      const ac = isAudioOnly(C) ? null : h('div', { class: 'frow' }, h('label', {}, 'کدک صدا'), select(ACODECS[C] || ACODECS.mp4, o.acodec, set('acodec')));
      F.append(grp('صدا', isAudioOnly(C), ac,
        o.acodec === 'none' && !isAudioOnly(C) ? null : [
          C !== 'wav' ? num('بیت‌ریت صدا', 'abitrate', 32, 320, 16, ' kb/s') : null,
          h('div', { class: 'frow' }, h('label', {}, 'نمونه‌برداری'),
            select([['0', 'بدون تغییر'], ['22050', '۲۲ کیلوهرتز'], ['44100', '۴۴٫۱ کیلوهرتز'], ['48000', '۴۸ کیلوهرتز']], String(o.arate), v => { o.arate = +v; this.render(); }),
            select([['0', 'کانال‌ها: بدون تغییر'], ['1', 'تک‌کانال'], ['2', 'استریو']], String(o.channels), v => { o.channels = +v; this.render(); })),
          num('بلندی', 'volume', -20, 20, 1, ' dB'),
          check('یکسان‌سازی بلندی (استاندارد پخش آنلاین)', o.loudnorm, v => { o.loudnorm = v; this.render(); }),
          num('محو صدا در شروع', 'afadeIn', 0, 10, 0.5, ' ث'),
          num('محو صدا در پایان', 'afadeOut', 0, 10, 0.5, ' ث'),
        ]));
    } else if (!isAudioOnly(C)) {
      F.append(h('div', { class: 'frow' }, h('label', {}, 'کدک صدا'), select(ACODECS[C] || ACODECS.mp4, o.acodec, set('acodec'))));
    }

    if (!isAudioOnly(C) && o.vcodec !== 'copy') {
      F.append(grp('پیشرفته', false,
        h('div', { class: 'frow' }, h('label', {}, 'نوع محتوا'), select(TUNES, o.tune, set('tune'))),
        o.vcodec === 'libx264' ? h('div', { class: 'frow' }, h('label', {}, 'پروفایل'),
          select([['baseline', 'Baseline (گوشی‌های قدیمی)'], ['main', 'Main'], ['high', 'High (پیش‌فرض)']], o.profile, set('profile'))) : null,
        num('فاصلهٔ کی‌فریم (۰ = خودکار)', 'gop', 0, 600, 10, ' فریم'),
        check('سازگاری رنگ yuv420p (پیشنهادی)', o.pixfmt, v => { o.pixfmt = v; this.render(); }),
        C === 'mp4' || C === 'mov' ? check('شروع سریع پخش آنلاین (faststart)', o.faststart, v => { o.faststart = v; this.render(); }) : null,
        check('حذف اطلاعات فایل (متادیتا)', o.stripMeta, v => { o.stripMeta = v; this.render(); }),
        h('div', { class: 'frow' }, h('label', {}, 'عنوان'),
          h('input', { class: 'txt', value: o.title, onchange: e => { o.title = e.target.value; this.render(); } }))));
    }
  }

  _sizeRow() {
    const o = this.o;
    return h('div', { class: 'frow' }, h('label', {}, 'اندازه'),
      select([['0', 'بدون تغییر'], ['2160', '۲۱۶۰'], ['1920', '۱۹۲۰'], ['1440', '۱۴۴۰'], ['1080', '۱۰۸۰'], ['720', '۷۲۰'],
        ['540', '۵۴۰'], ['480', '۴۸۰'], ['360', '۳۶۰'], ['240', '۲۴۰']], String(o.height),
        v => { o.height = +v; o.width = 0; this.render(); }),
      h('label', {}, 'فریم'),
      select([['0', 'بدون تغییر'], ['60', '۶۰'], ['50', '۵۰'], ['30', '۳۰'], ['25', '۲۵'], ['24', '۲۴'], ['15', '۱۵']], String(o.fps),
        v => { o.fps = +v; this.render(); }));
  }

  _trimGroup(grp) {
    const o = this.o;
    const t = (label, k) => h('input', { type: 'text', class: 'txt ltr tnum', value: o[k], placeholder: label,
      onchange: e => { o[k] = e.target.value; this.render(); } });
    return grp('برش و سرعت', !!(o.start || o.end || o.speed !== 1),
      h('div', { class: 'frow' }, h('label', {}, 'از'), t('0:00', 'start'), h('label', {}, 'تا'), t('پایان', 'end')),
      h('div', { class: 'frow' }, h('label', {}, 'سرعت'),
        select([['0.25', '۰٫۲۵×'], ['0.5', '۰٫۵×'], ['0.75', '۰٫۷۵×'], ['1', '۱× عادی'], ['1.25', '۱٫۲۵×'], ['1.5', '۱٫۵×'], ['2', '۲×'], ['4', '۴×']],
          String(o.speed), v => { o.speed = +v; this.render(); }),
        check('برعکس (حافظهٔ زیاد)', o.reverse, v => { o.reverse = v; this.render(); })));
  }

  _filterGroup(grp) {
    const o = this.o;
    const num = (label, k, min, max, step) => {
      const v = h('span', { class: 'v' }, faN(o[k]));
      const r = h('input', { type: 'range', class: 'rng', min, max, step, value: o[k],
        oninput: () => { o[k] = +r.value; v.textContent = faN(r.value); }, onchange: () => this.render() });
      return h('div', { class: 'ctl' }, h('label', {}, label), r, v);
    };
    return grp('فیلترها و برش قاب', false,
      h('div', { class: 'frow' }, h('label', {}, 'برش به نسبت'),
        select([['none', 'بدون'], ['9:16', '۹:۱۶ استوری'], ['1:1', '۱:۱ مربع'], ['4:5', '۴:۵'], ['16:9', '۱۶:۹']], o.crop, v => { o.crop = v; this.render(); }),
        h('label', {}, 'چرخش'),
        select([['none', 'بدون'], ['cw', '۹۰° ساعتگرد'], ['ccw', '۹۰° پادساعتگرد'], ['180', '۱۸۰°'], ['hflip', 'آینهٔ افقی'], ['vflip', 'آینهٔ عمودی']], o.rotate, v => { o.rotate = v; this.render(); })),
      num('کاهش نویز', 'denoise', 0, 100, 5),
      num('تیزی', 'sharpen', 0, 100, 5),
      num('روشنایی', 'bright', -0.5, 0.5, 0.02),
      num('کنتراست', 'contrast', 0.5, 2, 0.05),
      num('اشباع رنگ', 'sat', 0, 3, 0.05),
      num('محو تصویر در شروع', 'fadeIn', 0, 5, 0.25),
      num('محو تصویر در پایان', 'fadeOut', 0, 5, 0.25),
      h('div', { class: 'frow btns' },
        check('سیاه‌وسفید', o.gray, v => { o.gray = v; this.render(); }),
        check('سایهٔ لبه', o.vignette, v => { o.vignette = v; this.render(); }),
        check('رفع پله‌پله‌شدن رنگ', o.deband, v => { o.deband = v; this.render(); })));
  }

  async _run(ui) {
    const inp = this.input();
    if (!inp) { ui.msg.textContent = 'ورودی ندارد'; ui.msg.className = 'msg err'; return; }
    const cmd = this._cmd();
    let args = cmd.args, outName = cmd.outName, mime = cmd.mime;
    if (this.raw) {
      args = parseCommand(this.rawText);
      outName = [...args].reverse().find(a => /^out\.[a-z0-9]+$/i.test(a));
      if (!outName) { ui.msg.textContent = 'نام خروجی باید out.پسوند باشد (مثلاً out.mp4)'; ui.msg.className = 'msg err'; return; }
      const ext = outName.split('.')[1].toLowerCase();
      mime = { mp4: 'video/mp4', webm: 'video/webm', gif: 'image/gif', mp3: 'audio/mpeg', mkv: 'video/x-matroska', mov: 'video/quicktime', png: 'image/png', jpg: 'image/jpeg', wav: 'audio/wav', m4a: 'audio/mp4', ogg: 'audio/ogg' }[ext] || 'application/octet-stream';
    }
    this.abort = new AbortController();
    ui.go.classList.add('hidden'); ui.cancel.classList.remove('hidden'); ui.bar.classList.remove('hidden');
    ui.out.innerHTML = ''; ui.log.textContent = '';
    const fill = ui.bar.querySelector('i');
    const t0 = performance.now();
    const lines = [];
    try {
      const blob = await runFFmpeg({
        input: inp.blob, inName: cmd.inName, args, outName, mime, signal: this.abort.signal,
        onProgress: p => {
          fill.style.width = (p * 100).toFixed(1) + '%';
          const el = (performance.now() - t0) / 1000;
          ui.msg.textContent = `${faN(Math.round(p * 100))}٪ · ${faN(Math.round(el))} ثانیه گذشته`
            + (p > 0.03 ? ` · حدود ${faN(Math.round(el / p - el))} ثانیه مانده` : '');
          ui.msg.className = 'msg';
        },
        onLog: line => {
          lines.push(line);
          if (lines.length > 400) lines.shift();
          ui.log.textContent = lines.join('\n');
        },
      });
      const a = inp.blob.size / 1048576, b = blob.size / 1048576;
      const pct = a > 0 ? Math.round((1 - b / a) * 100) : 0;
      ui.msg.textContent = `✓ آماده: ${faN(b.toFixed(2))} مگابایت`
        + (pct > 0 ? ` — ${faN(pct)}٪ کم‌حجم‌تر` : pct < 0 ? ` — ${faN(-pct)}٪ بزرگ‌تر` : '');
      ui.msg.className = 'msg ok';
      const base = inp.name.replace(/\.[^.]+$/, '');
      const name = `${base}_ffmpeg.${outName.split('.')[1]}`;
      this.result = { blob, name };
      const save = h('button', { class: 'btn sm primary', onclick: async () => {
        const r = await this.host.save(blob, name);
        ui.msg.textContent = r?.where === 'downloads' ? `ذخیره شد: ${r.path}` : 'ذخیره شد';
        if (r?.canShare && r.uri) ui.out.append(h('button', { class: 'btn sm', onclick: () => this.host.share(r.uri) }, 'اشتراک‌گذاری'));
      } }, 'ذخیره');
      const again = h('button', { class: 'btn sm ghost', onclick: () => {
        // نتیجه را ورودی مرحلهٔ بعد کن (مثلاً اول برش، بعد گیف)
        this.file = new File([blob], name, { type: mime }); this.src = 'file'; this.duration = 0; this.render();
      } }, 'استفاده به‌عنوان ورودی بعدی');
      ui.out.append(save, again);
    } catch (e) {
      console.error(e);
      ui.msg.textContent = 'خطا: ' + e.message;
      ui.msg.className = 'msg err';
    } finally {
      ui.go.classList.remove('hidden'); ui.cancel.classList.add('hidden');
      this.abort = null;
    }
  }
}
