/**
 * صفحهٔ آموزش
 *
 * دو نوع درس دارد:
 *  - COURSE: دورهٔ کدنویسی از صفر با «زمین بازی» زنده
 *  - LESSONS: درس‌های مفهومی قدیمی (شهود ← تشبیه ← سازوکار ← کد)
 *
 * زمین بازی همان موتور «لایهٔ کد» را اجرا می‌کند (compileCode + codeEnv)،
 * پس کدی که این‌جا کار کند، در پروژه هم عیناً کار می‌کند.
 */
import { h, faN } from './dom.js';
import { LESSONS, CATEGORIES } from '../engine/learn.js';
import { COURSE, COURSE_CATS } from '../learn/course.js';
import { compileCode, codeEnv } from '../motion/codeapi.js';

const BPM = 120;                       // ضرب مصنوعی برای e.kick
const DW = 1280, DH = 720;             // ابعاد طراحی زمین بازی

/** حالت صدای ساختگی در لحظهٔ t — شبیه یک آهنگ ۱۲۰ ضرب */
function fakeAudio(t) {
  const period = 60 / BPM;
  const ph = t % period;
  const kick = Math.exp(-ph * 9);
  return { kick, rms: 0.35 + 0.35 * kick, low: kick * 0.8, beat: Math.floor(t / period), pulse: kick };
}

/** یک زمین بازی: بوم + ویرایشگر + پیام خطا */
class Playground {
  constructor(code, host) {
    this.code = code;
    this.start = performance.now();
    this.running = false;
    this.cv = h('canvas', { class: 'pgcv', width: 640, height: 360 });
    this.ta = h('textarea', { class: 'code sm', spellcheck: false, value: code, dir: 'ltr' });
    this.msg = h('div', { class: 'msg' });
    this.ta.oninput = () => { this.code = this.ta.value; };
    const reset = h('button', { class: 'btn sm ghost', onclick: () => { this.ta.value = this.code = code; } }, 'برگرداندن');
    const restart = h('button', { class: 'btn sm ghost', onclick: () => { this.start = performance.now(); } }, '⟲ از صفر');
    const tryIt = h('button', { class: 'btn sm', onclick: () => host.tryInProject?.(this.code) }, 'امتحان در پروژه');
    this.el = h('div', { class: 'pg' }, this.cv, this.ta, h('div', { class: 'frow btns' }, restart, reset, tryIt), this.msg);
    this.ctx = this.cv.getContext('2d');
    this._loop = () => { if (!this.running) return; this.frame(); this.raf = requestAnimationFrame(this._loop); };
  }

  frame() {
    const ctx = this.ctx;
    const t = ((performance.now() - this.start) / 1000) % 20;
    const s = this.cv.width / DW;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#0A0B0E';
    ctx.fillRect(0, 0, this.cv.width, this.cv.height);
    const { fn, error } = compileCode(this.code);
    if (error) { this.show(error); return; }
    ctx.save();
    ctx.setTransform(s, 0, 0, s, this.cv.width / 2, this.cv.height / 2);
    try {
      fn(ctx, codeEnv({ ctx, lt: t, time: t, dur: 20, W: DW, H: DH, P: { w: 1200, h: 700 }, ...fakeAudio(t) }));
      this.show('');
    } catch (err) {
      this.show('خطای اجرا: ' + err.message);
    }
    ctx.restore();
  }

  show(err) {
    if (this._last === err) return;
    this._last = err;
    this.msg.textContent = err || 'سالم ✓ — کد را تغییر دهید، نتیجه زنده است';
    this.msg.className = 'msg ' + (err ? 'err' : 'ok');
    this.ta.classList.toggle('bad', !!err);
  }

  play() { if (!this.running) { this.running = true; this.raf = requestAnimationFrame(this._loop); } }
  stop() { this.running = false; cancelAnimationFrame(this.raf); }
}

export class Lessons {
  /**
   * @param {{list:HTMLElement, body:HTMLElement, head:HTMLElement, scroller:()=>HTMLElement}} els
   * @param {{tryInProject:(code:string)=>void}} host
   */
  constructor(els, host) {
    this.els = els;
    this.host = host;
    this.pgs = [];
    this.io = typeof IntersectionObserver !== 'undefined'
      ? new IntersectionObserver(es => {
        for (const en of es) {
          const pg = this.pgs.find(p => p.el === en.target);
          if (pg) (en.isIntersecting ? pg.play() : pg.stop());
        }
      }) : null;
  }

  get open() { return !this.els.body.classList.contains('hidden'); }

  stop() {
    for (const p of this.pgs) p.stop();
    this.io?.disconnect();
    this.pgs = [];
  }

  /** فهرست همهٔ درس‌ها */
  list() {
    this.stop();
    const { list, body, head } = this.els;
    body.classList.add('hidden');
    list.classList.remove('hidden');
    head.textContent = 'آموزش';
    if (list.childElementCount) return;

    list.append(h('div', { class: 'lintro' },
      h('b', {}, 'از صفر تا اولین کد'),
      h('p', {}, 'لازم نیست چیزی بلد باشید. درس‌ها را به ترتیب بخوانید؛ در هر درس کد را همان‌جا تغییر دهید و نتیجه را زنده ببینید.')));

    let n = 0;
    const card = (title, one, open) => {
      n++;
      return h('div', { class: 'litem', onclick: open },
        h('div', { class: 'n' }, faN(n)),
        h('div', {}, h('div', { class: 'lt' }, title), h('div', { class: 'lo' }, one)));
    };
    for (const cat of COURSE_CATS) {
      const items = COURSE.filter(l => l.cat === cat);
      if (!items.length) continue;
      list.append(h('div', { class: 'lcat' }, cat),
        h('div', { class: 'lgrid' }, ...items.map(L => card(L.title, L.one, () => this.openCourse(L)))));
    }
    for (const cat of CATEGORIES) {
      const items = LESSONS.filter(l => l.cat === cat);
      if (!items.length) continue;
      list.append(h('div', { class: 'lcat' }, 'درون موتور · ' + cat),
        h('div', { class: 'lgrid' }, ...items.map(L => card(L.title, L.one, () => this.openClassic(L)))));
    }
  }

  _show(title) {
    const { list, body, head } = this.els;
    body.classList.remove('hidden');
    list.classList.add('hidden');
    head.textContent = title;
    const sc = this.els.scroller();
    if (sc) sc.scrollTop = 0;
  }

  /** درس دوره با زمین بازی */
  openCourse(L) {
    this.stop();
    const b = this.els.body;
    b.innerHTML = '';
    b.append(h('h3', {}, L.title), h('p', { class: 'big' }, L.one));
    for (const bl of L.blocks) {
      if (bl.p) b.append(h('p', {}, bl.p));
      else if (bl.code) b.append(h('pre', { dir: 'ltr' }, bl.code));
      else if (bl.tip) b.append(h('div', { class: 'nb' }, '💡 ' + bl.tip));
      else if (bl.play) {
        const pg = new Playground(bl.play, this.host);
        this.pgs.push(pg);
        b.append(pg.el);
        if (this.io) this.io.observe(pg.el); else pg.play();
      } else if (bl.task) {
        const ans = h('details', { class: 'ans' }, h('summary', {}, 'دیدن جواب'), h('pre', { dir: 'ltr' }, bl.answer || ''));
        b.append(h('div', { class: 'task' }, h('b', {}, '✍ تمرین: '), bl.task, ans));
      }
    }
    // درس بعدی
    const i = COURSE.indexOf(L);
    const next = COURSE[i + 1];
    const nav = h('div', { class: 'frow btns lnav' });
    if (COURSE[i - 1]) nav.append(h('button', { class: 'btn sm ghost', onclick: () => this.openCourse(COURSE[i - 1]) }, '→ قبلی'));
    if (next) nav.append(h('button', { class: 'btn sm primary', onclick: () => this.openCourse(next) }, 'درس بعد: ' + next.title + ' ←'));
    b.append(nav);
    this._show(L.title);
  }

  /** درس مفهومی قدیمی */
  openClassic(L) {
    this.stop();
    const b = this.els.body;
    const esc = t => String(t).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
    let html = `<h3>${esc(L.title)}</h3>`;
    html += `<div class="lvl">۱ · شهود</div><p class="big">${esc(L.one)}</p>`;
    html += `<div class="lvl">۲ · تشبیه</div><p>${esc(L.like)}</p>`;
    if (L.svg) html += L.svg;            // نمودارهای ثابت خود برنامه — امن
    html += `<div class="lvl">۳ · ساز و کار</div><p>${esc(L.how)}</p>`;
    if (L.code) html += `<div class="lvl">۴ · کد</div><pre dir="ltr">${esc(L.code)}</pre>`;
    if (L.note) html += `<div class="nb">${esc(L.note)}</div>`;
    b.innerHTML = html;
    this._show(L.title);
  }
}
