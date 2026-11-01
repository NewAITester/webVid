import { h, faN, nice, select, check } from './dom.js';
import { BezierEditor, easeIcon } from './bezier.js';
import {
  LAYER_TYPES, TRANSFORM_PROPS, EFFECTS, EFFECT_CATS, SHAPE_KINDS, BLEND_MODES,
  newLayer, newEffect, propDefs, effectsFor,
} from '../motion/schema.js';
import { TEXT_STYLES, LOOKS, ELEMENTS, applyTextStyle, applyLook, buildElement, fxWith } from '../motion/presets.js';
import { thumb, sampleText, sampleImage, sampleShape } from './thumbs.js';
import { sample, keyAt, hasKeys, toggleKey, setValue, setKey, prevKeyTime, nextKeyTime } from '../motion/tracks.js';
import { compileExpr, exprErrors, EXPR_HELP, EXPR_EXAMPLES } from '../motion/expr.js';
import { APPEAR, APPEAR_GROUPS, LOOPS } from '../motion/animate.js';
import { EASE_INFO, easeLabel } from '../motion/easing.js';
import { allKeyTimes, setEaseAt, deleteKeysAt, duplicate, groupLayers, ungroup, isHiddenByCollapse, toggleCollapse, applySolo, restoreSolo } from '../motion/ops.js';
import { CODE_LAYER_DEFAULT, CODE_SNIPPETS } from '../motion/codeapi.js';
import { FONT_CHOICES } from '../motion/render.js';
import { frameEnv } from '../motion/evaluate.js';
import * as M from '../motion/mat.js';
import { pickFontFile, userFonts, removeFont } from '../motion/fonts.js';
import { ELEMENT_KINDS, ELEMENT_CATS, colorProp, elementParams, setElementParam, swapElement, findTweaks, setTweak, makeElementLayer } from '../motion/elements.js';
import { attachCodeSearch } from './codesearch.js';
const isImportedCode = code => /e\.runImported\(ctx, e, PROGRAM/.test(code || '');
import { openScriptSheet } from './scriptpanel.js';

/** نشانهٔ ردیف «شعر» در ترتیب لایه‌ها */
const LYRIC = { lyric: true };

/**
 * پنل «لایه‌ها» — قلب ویرایش حرکتی
 * ─────────────────────────────────────────────────────────────
 * دو نما دارد:
 *   فهرست    همهٔ لایه‌ها، بالاترین بالا؛ افزودن، پنهان، قفل، ترتیب
 *   بازرس    تنظیمات لایهٔ انتخاب‌شده در چهار زبانه (لایهٔ کد یکی بیشتر):
 *            تنظیم · حرکت · افکت · (کد) · پیشرفته
 *   افزودن   برگهٔ «＋ افزودن»: لایهٔ خالی، متن آماده، عنصر آماده (openAdd)
 *
 * کنار هر ویژگی دو دکمه هست:
 *   ◆  کی‌فریم در همین لحظه (پُر = هست، نیمه = جای دیگری کی‌فریم دارد)
 *   ƒ  عبارت (فرمول) برای همین ویژگی
 *
 * host (از main.js) این‌ها را می‌دهد:
 *   getLayers, getTime, seek, draw, save, select(id), selectedId,
 *   renderer, stage, canvas, media, addMediaFile(file), play, W(), H()
 */
export class MotionPanel {
  constructor(root, host) {
    this.root = root;
    this.host = host;
    this.record = false;          // ⏺ حالت ضبط: هر تغییری کی‌فریم می‌سازد
    this.tab = 'edit';
    this.animWhich = 'in';        // زبانهٔ حرکت: ورود | خروج | تکرار
    this.fxCat = 'light';         // دستهٔ بازِ گالری افکت
    this.keySel = null;           // کی‌فریم انتخاب‌شده در زبانهٔ منحنی
    this.openExpr = new Set();    // ویژگی‌هایی که جعبهٔ عبارتشان باز است
    this._updaters = [];
    this._bez = null;
    this._file = h('input', { type: 'file', accept: 'image/*,video/*,audio/*', class: 'hidden',
      onchange: () => this._onFile() });
    document.body.append(this._file);
  }

  /* ── کمک‌ها ─────────────────────────────────────────────── */
  get layers() { return this.host.getLayers(); }
  get sel() { const id = this.host.selectedId(); return this.layers.find(L => L.id === id) || null; }
  lt(L) { return Math.max(0, Math.min(L.t1 - L.t0, this.host.getTime() - L.t0)); }
  changed(rebuild = false) {
    this.host.save();
    this.host.draw();
    if (rebuild) this.render(); else this.tick();
  }

  /** بعد از هر جابه‌جایی زمان صدا زده می‌شود: فقط مقدارها به‌روز می‌شوند */
  tick() { for (const u of this._updaters) u(); }

  render() {
    this._updaters = [];
    this._bez?.stop();
    this.root.innerHTML = '';
    const L = this.sel;
    if (L) this._inspector(L); else this._list();
  }

  /* ── افزودن لایه ─────────────────────────────────────────── */
  add(type, over = {}) {
    const t = this.host.getTime();
    const dur = Math.max(1, Math.min(5, (this.host.duration() || 5) - t)) || 5;
    const L = newLayer(type, Math.max(0, Math.min(t, Math.max(0, (this.host.duration() || 5) - 1))), dur, over);
    const n = this.layers.filter(x => x.type === type).length + 1;
    L.name = `${LAYER_TYPES[type].label} ${faN(n)}`;
    if (type === 'code' && !L.data.code) L.data.code = CODE_LAYER_DEFAULT;
    if (type === 'adjust') L.effects.push(newEffect('color'));
    if (type === 'spectrum') { L.props.y.v = Math.round(this.host.H() * 0.3); }
    this.layers.push(L);
    this.tab = type === 'code' ? 'code' : 'edit';
    this.host.select(L.id);
    this.changed(true);
    return L;
  }

  /** متن تازه با یک سبک آماده */
  addTextStyle(style) {
    const L = this.add('text');
    L.data.str = 'متن شما';
    applyTextStyle(L, style, this.host.W(), this.host.H());
    L.name = style.label;
    this.changed(true);
    return L;
  }

  /** عنصر آماده (قلب، کانفتی، نوار…) */
  /** نوشته ← لایهٔ المان ذره‌ای (flowTitle / flowText) با همان نوشته و زمان */
  textToFlow(L, kind) {
    const str = String(L.data?.str || '').replace(/\s+/g, ' ').trim() || 'FLOW';
    const F = makeElementLayer(kind, { text: str }, L.t0, Math.max(0.5, L.t1 - L.t0), this.host.W(), this.host.H());
    if (F.props.h.v > this.host.H()) F.props.h = { v: this.host.H() };
    if (F.props.w.v > this.host.W()) F.props.w = { v: this.host.W() };
    if (L.scene) F.scene = L.scene;
    this.layers.splice(this.layers.indexOf(L) + 1, 0, F);
    L.visible = false;
    this.tab = 'edit';
    this.host.select(F.id);
    this.changed(true);
    return F;
  }

  addElement(el) {
    const t = this.host.getTime(), total = this.host.duration() || 5;
    const t0 = Math.max(0, Math.min(t, Math.max(0, total - 1)));
    const L = buildElement(el, t0, Math.max(1, Math.min(5, total - t0)) || 5, this.host.W(), this.host.H());
    if (L.type === 'code' && L.props.h.v > this.host.H()) L.props.h = { v: this.host.H() };
    if (L.type === 'code' && L.props.w.v > this.host.W()) L.props.w = { v: this.host.W() };
    this.layers.push(L);
    this.tab = 'edit';
    this.host.select(L.id);
    this.changed(true);
    return L;
  }

  /**
   * برگهٔ «＋ افزودن» — همهٔ چیزهایی که می‌شود اضافه کرد، یک‌جا و با عکس.
   * @param {Array<{ic,label,desc,fn}>} extras  کارهای بیرون از لایه‌ها (بخش شعر و…)
   */
  openAdd(extras = this.host.addExtras?.() || []) {
    document.querySelector('.addsheet')?.remove();
    const run = (fn, open = true) => () => { sheet.remove(); fn(); if (open) this.host.openPane?.(); };
    const tiles = [];
    const tile = (ic, label, desc, fn, img = null) => {
      const b = h('button', { class: 'stile' + (img ? ' has' : ''), onclick: fn, title: desc || label },
        img || h('i', {}, ic), h('b', {}, label), desc ? h('small', {}, desc) : null);
      b.dataset.q = (label + ' ' + (desc || '')).toLowerCase();
      tiles.push(b);
      return b;
    };
    const grp = (title, hint, ...kids) => h('section', { class: 'sgrp' },
      h('div', { class: 'sgh' }, h('b', {}, title), hint ? h('small', {}, hint) : null),
      h('div', { class: 'sgrid' }, ...kids));
    const basic = [
      ['text', 'T', 'متن', 'نوشتهٔ خالی'],
      ['media', '▣', 'عکس یا ویدیو', 'از گالری گوشی'],
      ['shape', '◆', 'شکل', 'مستطیل، دایره، ستاره…'],
      ['spectrum', '≋', 'موج صدا', 'با آهنگ می‌رقصد'],
      ['code', '{}', 'کد', 'با برنامه‌نویسی بکشید'],
      ['adjust', '◐', 'لایهٔ تنظیم', 'افکت روی همهٔ زیرین‌ها'],
      ['null', '⊕', 'والد خالی', 'برای حرکت گروهی'],
      ['audio', '♪', 'صدا', 'فایل صوتی مستقل از آهنگ'],
      ['camera', '🎥', 'دوربین', 'پن، زوم و چرخش کل صحنه'],
      ['draw', '〰', 'خط آزاد', 'خط موجی که مثل دست کشیده می‌شود'],
    ].map(([type, ic, label, desc]) => tile(ic, label, desc,
      type === 'media' ? run(() => this.pickMedia()) : run(() => this.add(type))));
    const styles = TEXT_STYLES.map(st => tile(st.ic, st.label, '', run(() => this.addTextStyle(st)),
      thumb('style:' + st.id, () => { const L = sampleText('متن'); applyTextStyle(L, st, 600, 400); L.props.y = { v: 0 }; return [L]; })));
    const els = ELEMENTS.map(el => tile(el.ic, el.label, '', run(() => this.addElement(el)),
      el.type === 'adjust' ? null : thumb('el:' + el.id, () => {
        const L = buildElement(el, 0, 5, 600, 400);
        L.props.y = { v: 0 };
        if (L.type === 'code') { L.props.w = { v: 600 }; L.props.h = { v: 400 }; }
        if (L.props.w && L.type !== 'code' && L.type !== 'spectrum') L.props.sc = { v: Math.min(100, Math.round(100 * 340 / Math.max(L.props.w.v, L.props.h?.v || 0))) };
        if (L.type === 'spectrum') L.props.sc = { v: 55 };
        return [L];
      }, 1.6)));
    const flows = ['flowTitle', 'flowPulse', 'flowText'].map(k => ELEMENTS.find(el => el.id === 'el_' + k)).filter(Boolean)
      .map(el => tile(el.ic, el.label, ELEMENT_KINDS[el.kind].desc, run(() => this.addElement(el)),
        thumb('el:' + el.id, () => { const L = buildElement(el, 0, 5, 600, 400); L.props.w = { v: 600 }; L.props.h = { v: 400 }; L.props.y = { v: 0 }; return [L]; }, el.kind === 'flowText' ? 1.9 : el.kind === 'flowPulse' ? 1.04 : 1.6)));
    const ext = extras.map(x => tile(x.ic, x.label, x.desc, run(x.fn, x.openLayers !== false)));

    const q = h('input', { class: 'txt', type: 'search', placeholder: 'جستجو: نئون، قلب، برف…',
      oninput: () => {
        const v = q.value.trim().toLowerCase();
        for (const t of tiles) t.classList.toggle('hidden', !!v && !t.dataset.q.includes(v));
        for (const g of sheet.querySelectorAll('.sgrp')) g.classList.toggle('hidden', ![...g.querySelectorAll('.stile')].some(t => !t.classList.contains('hidden')));
      } });
    const sheet = h('div', { class: 'addsheet', onclick: e => { if (e.target === sheet) sheet.remove(); } },
      h('div', { class: 'sbody' },
        h('div', { class: 'shd' }, h('b', {}, '＋ چه چیزی اضافه شود؟'), h('div', { class: 'spacer' }),
          h('button', { class: 'icon sm', onclick: () => sheet.remove(), title: 'بستن' }, '✕')),
        q,
        h('div', { class: 'sscroll' },
          grp('🌊 تازه: افکت ذره‌ای FLOW', 'از کد پایتون شوریل — عنوان ریتمیک برای اسم اول ویدیو، جریان برای هر جای ویدیو', ...flows),
          grp('لایهٔ خالی', 'از صفر بسازید', ...basic),
          grp('متن آماده', 'یک ضربه = متن با رنگ، افکت و انیمیشن', ...styles),
          grp('کد و اسکریپت', 'کل ویدیو را با کد بنویسید، بعد دستی ویرایش کنید',
            tile('📜', 'موشن‌اسکریپت', 'صحنه‌ها با کد ← لایه‌ها', run(() => this.openScript(), false))),
          grp('عنصرهای آماده', 'شکل متحرک، ذرات، نوار و…', ...els),
          ext.length ? grp('شعر و زیرنویس', 'برای بخش‌های آهنگ', ...ext) : null)));
    document.body.append(sheet);
    setTimeout(() => sheet.classList.add('in'), 0);
    return sheet;
  }

  pickMedia() { this._file.value = ''; this._file.click(); }

  /** پنجرهٔ موشن‌اسکریپت */
  openScript() { return openScriptSheet(this); }

  async _onFile() {
    const f = this._file.files?.[0];
    if (!f) return;
    const rec = await this.host.addMediaFile(f);      // در IndexedDB ذخیره و به استخر اضافه می‌شود
    if (!rec) return;
    const type = rec.type;
    // «تعویض فایل»: همان لایه، فایل تازه
    const rep = this._replaceFor;
    this._replaceFor = null;
    if (rep && rep.type === type) {
      rep.data.media = rec.id;
      this.changed(true);
      return;
    }
    const L = this.add(type);
    L.name = f.name.replace(/\.[^.]+$/, '').slice(0, 24) || L.name;
    L.data.media = rec.id;
    const it = this.host.media.get(rec.id);
    const fitW = () => {
      if (type === 'audio') {
        if (it.dur) L.t1 = +(L.t0 + Math.min(it.dur, Math.max(1, (this.host.duration() || it.dur) - L.t0))).toFixed(2);
        this.changed(true);
        return;
      }
      const W = this.host.W(), H = this.host.H();
      const ar = it.w / Math.max(1, it.h);
      L.props.w.v = Math.round(type === 'video' ? Math.max(W, H * ar) : Math.min(W * 0.7, H * 0.7 * ar));
      if (type === 'video' && it.dur) L.t1 = +(L.t0 + Math.min(it.dur, Math.max(1, (this.host.duration() || it.dur) - L.t0))).toFixed(2);
      this.changed(true);
    };
    if (it?.ready) fitW();
    else {
      const el = it?.el;
      el?.addEventListener(type === 'video' ? 'loadeddata' : type === 'audio' ? 'loadedmetadata' : 'load', () => setTimeout(fitW, 0), { once: true });
    }
  }

  /* ── نمای فهرست ──────────────────────────────────────────── */
  _list() {
    const R = this.root;
    R.append(h('div', { class: 'phead' }, 'لایه‌ها', h('div', { class: 'spacer' }),
      h('span', { class: 'pill' }, faN(this.layers.length))));
    R.append(h('button', { class: 'btn primary wide addbig', onclick: () => this.openAdd() },
      '＋ افزودن لایه، متن آماده یا عنصر'));
    R.append(h('button', { class: 'btn ghost wide sm', style: { marginBottom: '10px' }, onclick: () => this.openScript() },
      '📜 موشن‌اسکریپت — ساختن و ویرایش با کد'));
    if (!this.layers.length) {
      R.append(h('div', { class: 'empty' },
        h('div', { class: 'bigicon' }, '◧'),
        h('p', {}, 'هنوز لایه‌ای ندارید. دکمهٔ «＋ افزودن» را بزنید.'),
        h('p', { class: 'note' }, 'هر لایه را می‌شود با انگشت روی تصویر کشید، بزرگ کرد و چرخاند. '
          + 'با دکمهٔ ◆ کنار هر ویژگی «کی‌فریم» بگذارید تا حرکت کند.')));
      return;
    }
    // ترتیب نمایش: بالاترین لایه بالا. ردیف «شعر» خودش یک طبقه است؛
    // لایه‌های بالای آن روی شعر کشیده می‌شوند و پایینی‌ها زیر شعر.
    const list = h('div', { class: 'llist' });
    const D = this._stack();
    const soloId = this._soloId || null;
    D.forEach((L, k) => {
      if (L === LYRIC) {
        list.append(h('div', { class: 'lrow lyric', title: 'شعر و پس‌زمینهٔ آهنگ' },
          h('span', { class: 'lic t-lyric' }, '♪'),
          h('span', { class: 'lnm' }, 'شعر آهنگ', h('small', {}, 'لایه‌های بالای این ردیف روی شعرند، پایینی‌ها پشت شعر')),
          h('button', { class: 'btn sm ghost', onclick: () => this.host.openLyricFx?.() }, '✦ افکت شعر')));
        return;
      }
      // فاز ۹: فرزندِ گروهِ جمع‌شده در فهرست دیده نمی‌شود (رندرش سر جایش است)
      if (isHiddenByCollapse(L, this.layers)) return;
      const on = this.host.getTime() >= L.t0 && this.host.getTime() < L.t1;
      const grip = h('span', { class: 'grip', title: 'برای جابه‌جایی بکشید' }, '⋮⋮');
      const isGroup = L.type === 'null';
      const kids = isGroup ? this.layers.filter(x => x.parent === L.id).length : 0;
      const row = h('div', { class: 'lrow' + (on ? ' live' : '') + (L.visible === false ? ' off' : '') + (L.parent ? ' child' : ''),
        onclick: e => { if (e.target.closest('.grip,.ib')) return; this.host.select(L.id); this.render(); } },
        isGroup ? iconBtn(L.data?.collapsed ? '▸' : '▾', kids ? `جمع/باز کردن گروه (${faN(kids)} عضو)` : 'جمع/باز کردن گروه', () => { toggleCollapse(L); this.changed(true); }) : null,
        grip,
        h('span', { class: 'lic t-' + L.type, title: LAYER_TYPES[L.type].label }, LAYER_TYPES[L.type].icon),
        h('span', { class: 'lnm' }, L.name,
          h('small', {}, (L.scene ? `🎬 ${L.scene} · ` : '') + (L.data?.el && ELEMENT_KINDS[L.data.el.kind] ? 'المان ' + ELEMENT_KINDS[L.data.el.kind].ic : LAYER_TYPES[L.type].label) + (L.effects.length ? ` · ${faN(L.effects.length)} افکت` : '')
            + ` · ${faN(L.t0.toFixed(1))}–${faN(L.t1.toFixed(1))}ث`),
          hasAnyKeys(L) ? h('em', { class: 'kf' }, ' ◆') : null),
        iconBtn(L.visible === false ? '◌' : '👁', 'نمایش', () => { L.visible = L.visible === false; this.changed(true); }),
        iconBtn(soloId === L.id ? '◉' : '◎', soloId === L.id ? 'بازگرداندن تک‌نمایش' : 'تک‌نمایش: فقط همین لایه', () => {
          if (this._soloId === L.id) { restoreSolo(this.layers, this._soloPrev); this._soloId = null; this._soloPrev = null; }
          else { this._soloPrev = applySolo(this.layers, L.id); this._soloId = L.id; }
          this.changed(true);
        }),
        iconBtn(L.locked ? '🔒' : '🔓', 'قفل', () => { L.locked = !L.locked; this.changed(true); }),
        iconBtn('↑', 'یک طبقه بالاتر', () => this._moveTo(L, k - 1)),
        iconBtn('↓', 'یک طبقه پایین‌تر', () => this._moveTo(L, k + 1)),
      );
      row.dataset.k = k;
      this._dragRow(grip, row, list, L);
      list.append(row);
    });
    R.append(list);
    R.append(h('p', { class: 'note' }, 'بالاترین ردیف روی همه است. با ⋮⋮ بکشید یا با ↑↓ جابه‌جا کنید — می‌شود لایه را از روی شعر به زیر شعر برد. روی هر ردیف بزنید تا تنظیماتش باز شود.'));
  }

  /** ترتیب نمایش: [لایه‌های روی شعر (بالا به پایین)، شعر، لایه‌های زیر شعر] */
  _stack() {
    const arr = this.layers;
    const front = arr.filter(L => !L.behind).reverse();
    const back = arr.filter(L => L.behind).reverse();
    return [...front, LYRIC, ...back];
  }
  /** لایه را به جای k در ترتیب نمایش ببر و آرایهٔ اصلی را از نو بساز */
  _moveTo(L, k) {
    const D = this._stack();
    const i = D.indexOf(L);
    k = Math.max(0, Math.min(D.length - 1, k));
    if (i < 0 || k === i) return;
    D.splice(i, 1); D.splice(k, 0, L);
    const li = D.indexOf(LYRIC);
    const order = [];
    D.forEach((x, j) => { if (x !== LYRIC) { x.behind = j > li; order.push(x); } });
    order.reverse();
    this.layers.splice(0, this.layers.length, ...order);
    this.changed(true);
  }
  /** کشیدن ردیف با انگشت (روی گوشی هم کار می‌کند) */
  _dragRow(grip, row, list, L) {
    grip.addEventListener('pointerdown', e => {
      e.preventDefault(); e.stopPropagation();
      grip.setPointerCapture?.(e.pointerId);
      const rows = [...list.children];
      const tops = rows.map(r => r.getBoundingClientRect());
      const y0 = e.clientY;
      row.classList.add('dragging');
      let target = +row.dataset.k;
      const mv = ev => {
        const dy = ev.clientY - y0;
        row.style.transform = `translateY(${dy}px)`;
        const cy = ev.clientY;
        target = tops.findIndex(r => cy < r.top + r.height / 2);
        if (target < 0) target = rows.length - 1;
        rows.forEach((r, j) => r.classList.toggle('dropmark', j === target && r !== row));
      };
      const up = () => {
        grip.removeEventListener('pointermove', mv);
        grip.removeEventListener('pointerup', up);
        grip.removeEventListener('pointercancel', up);
        row.classList.remove('dragging'); row.style.transform = '';
        rows.forEach(r => r.classList.remove('dropmark'));
        this._moveTo(L, target);
      };
      grip.addEventListener('pointermove', mv);
      grip.addEventListener('pointerup', up);
      grip.addEventListener('pointercancel', up);
    });
  }

  /**
   * ویرایشگر افکت برای چیزی جز لایه (شعر، کل صفحه) — همان گالری و کارت‌ها.
   * @param {HTMLElement} box
   * @param {{id,t0,t1,effects}} target   شیء شبه‌لایه
   * @param {()=>void} onChange          ذخیره، کشیدن و ساختن دوبارهٔ همین جعبه
   */
  fxEditor(box, target, onChange) {
    target.type ||= 'adjust';
    target.props ||= {};
    this._tabFx(target, box, { onChange, kinds: ['filter', 'move'] });
  }

  /* ── نمای بازرس ─────────────────────────────────────────── */
  _inspector(L) {
    const R = this.root;
    const head = h('div', { class: 'ihead' },
      h('button', { class: 'btn sm ghost', onclick: () => { this.host.select(null); this.render(); } }, '› لایه‌ها'),
      h('input', { class: 'txt', value: L.name, oninput: e => { L.name = e.target.value; this.host.save(); } }),
      iconBtn('⧉', 'تکثیر', () => {
        const n = duplicate(L);
        this.layers.splice(this.layers.indexOf(L) + 1, 0, n);
        this.host.select(n.id); this.changed(true);
      }),
      iconBtn('⊕', 'گروه با این لایه', () => {
        const g = groupLayers([L]);
        this.layers.splice(this.layers.indexOf(L) + 1, 0, g);
        this.host.select(g.id); this.changed(true);
      }),
      iconBtn('🗑', 'حذف', () => {
        if (!confirm('این لایه حذف شود؟')) return;
        this.layers.splice(this.layers.indexOf(L), 1);
        for (const x of this.layers) if (x.parent === L.id) x.parent = null;
        this.host.select(null); this.changed(true);
      }),
    );
    R.append(head);
    R.append(h('p', { class: 'note' },
      `${LAYER_TYPES[L.type]?.label || L.type} · ${faN(L.t0.toFixed(1))}–${faN(L.t1.toFixed(1))}ث · ${faN(L.effects.length)} افکت · ترکیب: ${(BLEND_MODES.find(b => b[0] === L.blend) || [])[1] || L.blend}`));
    R.append(this._keyNav(L));

    // نام‌های قدیمی زبانه‌ها (از نسخهٔ هفت‌زبانه) به زبانه‌های تازه
    const legacy = { transform: 'edit', look: 'edit', ease: 'anim', more: 'adv' };
    this.tab = legacy[this.tab] || this.tab;
    if (this.tab === 'code' && L.type !== 'code') this.tab = 'adv';
    const tabs = [['edit', '✎ تنظیم', 'نوشته، رنگ، اندازه و جای لایه'],
                  ['anim', '➜ حرکت', 'چطور بیاید، چطور برود، و در این میان چه حرکتی کند'],
                  ['fx', '✦ افکت', 'افکت‌ها روی هم جمع می‌شوند — از بالا به پایین اعمال می‌شوند'],
                  ...(L.type === 'code' ? [['code', '{} کد', 'کد این لایه — تغییرات زنده دیده می‌شود']] : []),
                  ['adv', '⚙ پیشرفته', 'حالت ترکیب، والد، ماسک، زمان و فرمول']];
    if (!tabs.some(t => t[0] === this.tab)) this.tab = 'edit';
    const tb = h('div', { class: 'tabs big' });
    for (const [id, label] of tabs) {
      const n = id === 'fx' && L.effects.length ? h('sup', {}, faN(L.effects.length)) : null;
      tb.append(h('button', { class: 'tab' + (this.tab === id ? ' on' : ''),
        onclick: () => { this.tab = id; this.render(); } }, label, n));
    }
    R.append(tb);
    R.append(h('p', { class: 'thint' }, tabs.find(t => t[0] === this.tab)[2]));
    const body = h('div', { class: 'ibody' });
    R.append(body);
    ({
      edit: () => this._tabEdit(L, body),
      anim: () => this._tabAnim(L, body),
      fx: () => this._tabFx(L, body),
      code: () => this._tabCode(L, body),
      adv: () => this._tabAdv(L, body),
    })[this.tab]?.();
  }

  /* ── زبانهٔ «تنظیم»: محتوا + جا و اندازه ─────────────────── */
  _tabEdit(L, body) {
    if (L.type === 'text') {
      body.append(h('div', { class: 'shead sm' }, 'سبک آماده — یک ضربه'));
      body.append(this._strip(TEXT_STYLES.map(st => this._thumbBtn(
        thumb('style:' + st.id, () => { const S = sampleText('متن'); applyTextStyle(S, st, 600, 400); S.props.y = { v: 0 }; return [S]; }),
        st.label, L.style === st.id, () => {
          applyTextStyle(L, st, this.host.W(), this.host.H());
          this.changed(true);
          this.host.seek(L.t0 + Math.min(1.2, (L.t1 - L.t0) / 2));
        }))));
    }
    const typeLabel = { text: 'نوشته و رنگ', shape: 'شکل و رنگ', image: 'تصویر', video: 'ویدیو',
      spectrum: 'موج صدا', code: 'رنگ‌ها و پارامترهای کد', adjust: 'لایهٔ تنظیم', null: 'والد خالی' }[L.type];
    const content = h('details', { class: 'grp', open: this._closed?.has('content') ? false : true },
      h('summary', {}, typeLabel));
    content.addEventListener('toggle', () => this._remember('content', content.open));
    this._tabLook(L, content);
    body.append(content);
    if (L.type === 'camera') {
      body.append(h('details', { class: 'grp', open: true },
        h('summary', {}, '🎥 دوربین روی شعر'),
        h('label', { style: 'display:flex;gap:8px;align-items:center' },
          h('input', { type: 'checkbox', checked: !!L.data?.lyrics,
            onchange: e => { L.data = { ...(L.data || {}), lyrics: e.target.checked }; this.host.draw(); this.host.save(); } }),
          h('span', {}, 'دوربین روی شعر هم اثر بگذارد (پیش‌فرض: فقط لایه‌های موشن)'))));
    }
    if (L.type === 'draw') {
      const pad = h('details', { class: 'grp', open: true },
        h('summary', {}, '✏ خط با دست — روی پد زیر بکشید'));
      const info = h('p', { class: 'note' },
        L.data?.mode === 'free' && L.data.points?.length
          ? `خط ضبط‌شده با ${faN(L.data.points.length)} نقطه — الان همین خط کشیده می‌شود`
          : 'هنوز خطی ضبط نشده؛ الان خط موجی کشیده می‌شود');
      const cv = h('canvas', { width: 320, height: 140, style: 'width:100%;height:140px;background:#11141c;border:1px dashed #3a4258;border-radius:10px;touch-action:none;cursor:crosshair' });
      const drawPad = () => {
        const x = cv.getContext('2d');
        x.clearRect(0, 0, 320, 140);
        const pts = L.data?.points || [];
        if (pts.length > 1) {
          const w = L.props.w?.v || 800, hh = L.props.h?.v || 200;
          x.strokeStyle = '#E4142A'; x.lineWidth = 2; x.beginPath();
          pts.forEach(([px, py], i) => {
            const cx = (px / w + 0.5) * 320, cy = (py / hh + 0.5) * 140;
            i ? x.lineTo(cx, cy) : x.moveTo(cx, cy);
          });
          x.stroke();
        }
      };
      let cur = null;
      const toLocal = e => {
        const r = cv.getBoundingClientRect();
        const w = L.props.w?.v || 800, hh = L.props.h?.v || 200;
        return [((e.clientX - r.left) / r.width - 0.5) * w, ((e.clientY - r.top) / r.height - 0.5) * hh];
      };
      cv.addEventListener('pointerdown', e => {
        cur = [toLocal(e)]; cv.setPointerCapture?.(e.pointerId); drawPad(); e.preventDefault();
      });
      cv.addEventListener('pointermove', e => {
        if (!cur) return;
        const p = toLocal(e), last = cur[cur.length - 1];
        if (Math.hypot(p[0] - last[0], p[1] - last[1]) > 4) { cur.push(p); }
        const w = L.props.w?.v || 800, hh = L.props.h?.v || 200;
        const x = cv.getContext('2d');
        x.strokeStyle = '#E4142A'; x.lineWidth = 2; x.beginPath();
        x.moveTo((last[0] / w + 0.5) * 320, (last[1] / hh + 0.5) * 140);
        x.lineTo((p[0] / w + 0.5) * 320, (p[1] / hh + 0.5) * 140); x.stroke();
        e.preventDefault();
      });
      const finish = () => {
        if (!cur) return;
        if (cur.length > 1 && cur.length <= 500) {
          L.data = { mode: 'free', points: cur };
          info.textContent = `خط ضبط‌شده با ${faN(cur.length)} نقطه — الان همین خط کشیده می‌شود`;
          this.host.draw(); this.host.save();
        }
        cur = null;
      };
      cv.addEventListener('pointerup', finish);
      cv.addEventListener('pointercancel', () => { cur = null; drawPad(); });
      pad.append(info, cv,
        h('button', { class: 'btn sm ghost', onclick: () => {
          L.data = { mode: 'wave', points: [] };
          info.textContent = 'برگشت به خط موجی';
          this.host.draw(); this.host.save(); drawPad();
        } }, '↩ برگشت به خط موجی'));
      setTimeout(drawPad, 0);
      body.append(pad);
    }
    const tr = h('details', { class: 'grp', open: this._closed?.has('xform') ? false : true },
      h('summary', {}, 'جا، اندازه، چرخش و شفافیت'));
    tr.addEventListener('toggle', () => this._remember('xform', tr.open));
    this._tabTransform(L, tr);
    body.append(tr);
  }
  _remember(key, open) {
    this._closed ||= new Set();
    if (open) this._closed.delete(key); else this._closed.add(key);
  }

  /** نوار افقی پیش‌نمایش‌ها */
  _strip(items) { return h('div', { class: 'tstrip' }, ...items); }
  _thumbBtn(img, label, on, fn) {
    return h('button', { class: 'tbtn' + (on ? ' on' : ''), onclick: fn, title: label }, img, h('span', {}, label));
  }

  /** نوار کی‌فریم: ◀ قبلی · ◆ کی‌فریم همه · بعدی ▶ · ⏺ ضبط */
  _keyNav(L) {
    const times = () => allKeyTimes(L);
    const tl = h('span', { class: 'kft' });
    const kAll = h('button', { class: 'kbtn big', title: 'کی‌فریم برای جا، اندازه، چرخش و شفافیت' }, '◆');
    const rec = h('button', { class: 'recb' + (this.record ? ' on' : ''), title: 'ضبط خودکار کی‌فریم' }, '⏺ ضبط');
    const jump = dir => {
      const now = this.lt(L);
      const ks = times();
      const tgt = dir < 0 ? [...ks].reverse().find(k => k < now - 1 / 120) : ks.find(k => k > now + 1 / 120);
      if (tgt !== undefined) this.host.seek(L.t0 + tgt);
    };
    kAll.onclick = () => {
      const lt = this.lt(L);
      const keys = ['x', 'y', 'sc', 'rot', 'opacity'];
      const anyHere = keys.some(k => keyAt(L.props[k], lt));
      for (const k of keys) {
        const tr = L.props[k];
        if (anyHere) { if (keyAt(tr, lt)) toggleKey(tr, lt); }
        else setKey(tr, lt, sample(tr, lt));
      }
      this.changed(true);
    };
    rec.onclick = () => { this.record = !this.record; rec.classList.toggle('on', this.record); };
    this._updaters.push(() => {
      const lt = this.lt(L);
      tl.textContent = `${faN(lt.toFixed(2))} از ${faN((L.t1 - L.t0).toFixed(1))} ث`;
      const here = times().some(k => Math.abs(k - lt) <= 1 / 120);
      kAll.classList.toggle('on', here);
      kAll.classList.toggle('has', times().length > 0);
    });
    // زمان روی تایم‌لاین از چپ به راست جلو می‌رود، پس این سه دکمه چپ‌به‌راست‌اند
    return h('div', { class: 'kfnav' },
      h('span', { class: 'kgrp', dir: 'ltr' },
        h('button', { class: 'btn sm ghost', onclick: () => jump(-1), title: 'کی‌فریم قبلی' }, '◀'),
        kAll,
        h('button', { class: 'btn sm ghost', onclick: () => jump(1), title: 'کی‌فریم بعدی' }, '▶')),
      tl, h('div', { class: 'spacer' }), rec);
  }

  /* ── سطر یک ویژگی ─────────────────────────────────────────── */
  _propRow(L, tr, def, tag) {
    const row = h('div', { class: 'prow' });
    const lab = h('label', {}, def.label);
    const kb = h('button', { class: 'kbtn', title: 'کی‌فریم' }, '◆');
    const fb = h('button', { class: 'fbtn' + (tr.x ? ' on' : ''), title: 'عبارت (فرمول)' }, 'ƒ');
    let ctl, upd;

    if (def.type === 'color') {
      const hasA = def.def.length === 9;
      const ci = h('input', { type: 'color' });
      const ai = hasA ? h('input', { type: 'range', class: 'rng sm', min: 0, max: 255, step: 1 }) : null;
      const write = () => {
        let v = ci.value;
        if (hasA) v += (+ai.value).toString(16).padStart(2, '0');
        setValue(tr, this.lt(L), v, this.record);
        this.host.draw(); this.host.save(); upd();
      };
      ci.oninput = write; if (ai) ai.oninput = write;
      ctl = h('div', { class: 'pctl' }, ci, ai);
      upd = () => {
        const v = String(sample(tr, this.lt(L)) || def.def);
        if (document.activeElement !== ci) ci.value = v.slice(0, 7);
        if (ai && document.activeElement !== ai) ai.value = v.length === 9 ? parseInt(v.slice(7, 9), 16) : 255;
      };
    } else {
      const rg = h('input', { type: 'range', class: 'rng', min: def.min, max: def.max, step: def.step });
      const nb = h('input', { type: 'number', class: 'pnum', step: def.step });
      const write = v => {
        if (!Number.isFinite(v)) return;
        setValue(tr, this.lt(L), v, this.record);
        this.host.draw(); this.host.save(); upd(true);
      };
      rg.oninput = () => write(+rg.value);
      nb.onchange = () => write(+nb.value);
      ctl = h('div', { class: 'pctl' }, rg, nb);
      upd = () => {
        const v = sample(tr, this.lt(L));
        if (document.activeElement !== rg) rg.value = v;
        if (document.activeElement !== nb) nb.value = nice(v);
      };
    }
    const updKeys = () => {
      const lt = this.lt(L);
      kb.classList.toggle('on', !!keyAt(tr, lt));
      kb.classList.toggle('has', hasKeys(tr));
      fb.classList.toggle('on', !!tr.x);
      fb.classList.toggle('bad', !!(tr.x && (compileExpr(tr.x).error || exprErrors.get(tag))));
    };
    const full = () => { upd(); updKeys(); };
    kb.onclick = () => { toggleKey(tr, this.lt(L)); this.host.draw(); this.host.save(); full(); };

    const exprBox = h('div', { class: 'exprbox' + (this.openExpr.has(tag) ? '' : ' hidden') });
    fb.onclick = () => {
      if (this.openExpr.has(tag)) this.openExpr.delete(tag); else this.openExpr.add(tag);
      exprBox.classList.toggle('hidden');
      if (!exprBox.childElementCount) this._exprEditor(exprBox, tr, tag, updKeys);
    };
    if (this.openExpr.has(tag)) this._exprEditor(exprBox, tr, tag, updKeys);

    row.append(lab, ctl, kb, fb);
    this._updaters.push(full);
    full();
    return h('div', { class: 'pwrap' }, row, exprBox);
  }

  _exprEditor(box, tr, tag, onChange) {
    const ta = h('textarea', { class: 'code sm', spellcheck: false, value: tr.x || '',
      placeholder: 'مثلاً: value + sin(time * 3) * 40' });
    const msg = h('div', { class: 'msg' });
    const show = () => {
      const err = tr.x ? (compileExpr(tr.x).error || exprErrors.get(tag)) : null;
      msg.textContent = err || (tr.x ? 'فعال است ✓' : 'خالی = بدون عبارت');
      msg.className = 'msg ' + (err ? 'err' : tr.x ? 'ok' : '');
    };
    let timer = 0;
    ta.oninput = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        tr.x = ta.value.trim() || undefined;
        if (!tr.x) delete tr.x;
        this.host.draw(); this.host.save(); show(); onChange();
        setTimeout(show, 60);   // خطای اجرایی بعد از کشیدن معلوم می‌شود
      }, 300);
    };
    const ex = select([['', 'نمونه‌ها…'], ...EXPR_EXAMPLES.map(([a, b]) => [b, a])], '', v => {
      if (!v) return;
      ta.value = v; ta.oninput();
    });
    const help = h('details', { class: 'xhelp' }, h('summary', {}, 'چه چیزهایی در دسترس است؟'),
      h('div', {}, ...EXPR_HELP.map(([k, d]) => h('div', { class: 'xh' }, h('code', {}, k), ' ', d))));
    box.append(ta, h('div', { class: 'frow btns' }, ex,
      h('button', { class: 'btn sm ghost', onclick: () => { ta.value = ''; ta.oninput(); } }, 'پاک کردن')), msg, help);
    show();
  }

  _props(L, body, keys) {
    for (const d of propDefs(L.type)) {
      if (keys && !keys.includes(d.key)) continue;
      body.append(this._propRow(L, L.props[d.key], d, `${L.id}.${d.key}`));
    }
  }

  /* ── زبانه‌ها ───────────────────────────────────────────── */
  _tabTransform(L, body) {
    this._props(L, body, ['x', 'y', 'sc', 'rot', 'opacity']);
    body.append(h('div', { class: 'frow btns' },
      h('button', { class: 'btn sm ghost', onclick: () => {
        const lt = this.lt(L);
        setValue(L.props.x, lt, 0, this.record); setValue(L.props.y, lt, 0, this.record);
        this.changed();
      } }, '⊙ وسط قاب'),
      h('button', { class: 'btn sm ghost', onclick: () => {
        for (const k of ['x', 'y', 'rot', 'sc', 'opacity', 'sx', 'sy', 'skx', 'ax', 'ay']) {
          const d = TRANSFORM_PROPS.find(p => p.key === k);
          L.props[k] = { v: d.def };
        }
        this.changed(true);
      } }, '↺ بازنشانی تبدیل')));
    const more = h('details', { class: 'grp' }, h('summary', {}, 'کشش، کجی و نقطهٔ لنگر'));
    this._props(L, more, ['sx', 'sy', 'skx', 'ax', 'ay']);
    more.append(h('p', { class: 'note' }, 'نقطهٔ لنگر مرکز چرخش و بزرگ‌شدن است. مثلاً برای چرخیدن عقربه دور یک سرش، لنگر را به همان سر ببرید.'));
    body.append(more);
  }

  _tabLook(L, body) {
    const D = L.data;
    if (L.type === 'text') {
      const ta = h('textarea', { class: 'lyr sm', value: D.str, rows: 2,
        oninput: () => { D.str = ta.value; this.host.draw(); this.host.save(); } });
      body.append(ta);
      body.append(h('div', { class: 'frow btns' },
        select(FONT_CHOICES.map(f => [f[0], f[2]]), D.font, v => { D.font = v; this.changed(true); }),
        h('button', { class: 'btn sm ghost', title: 'فایل ttf / otf / woff از گوشی', onclick: async () => {
          const id = await pickFontFile();
          if (id) { D.font = id; this.changed(true); }
        } }, '＋ فونت'),
        ...[['right', 'راست'], ['center', 'وسط'], ['left', 'چپ']].map(([v, lb]) =>
          h('button', { class: 'chip' + (D.align === v ? ' on' : ''), onclick: () => { D.align = v; this.changed(true); } }, lb))));
      this._props(L, body, ['size', 'fill', 'stroke', 'strokeW', 'spacing', 'lineH', 'reveal']);
      const bg = h('details', { class: 'grp' }, h('summary', {}, 'پس‌زمینهٔ متن (برچسب)'));
      this._props(L, bg, ['bg', 'bgPad', 'bgR']);
      body.append(bg);
      return;
    }
    if (L.type === 'shape') {
      const kinds = h('div', { class: 'frow btns' });
      for (const [k, lb] of SHAPE_KINDS) {
        kinds.append(h('button', { class: 'chip' + (D.kind === k ? ' on' : ''),
          onclick: () => { D.kind = k; this.changed(true); } }, lb));
      }
      body.append(kinds);
      body.append(h('div', { class: 'frow' },
        h('label', {}, 'پُر کردن'),
        select([['none', 'یک‌رنگ'], ['linear', 'گرادیان خطی'], ['radial', 'گرادیان دایره‌ای']], D.grad,
          v => { D.grad = v; this.changed(true); }),
        check('توپر', D.fillOn !== false, v => { D.fillOn = v; this.changed(); })));
      const keys = ['w', 'h', 'fill'];
      if (D.grad !== 'none') keys.push('fill2', 'gradA');
      keys.push('stroke', 'strokeW');
      if (D.kind === 'rect') keys.push('radius');
      if (D.kind === 'polygon' || D.kind === 'star') keys.push('sides');
      if (D.kind === 'star') keys.push('inner');
      keys.push('trimS', 'trimE');
      this._props(L, body, keys);
      body.append(h('p', { class: 'note' }, '«برش مسیر» فقط دورخط را می‌کشد — برای انیمیشن «کشیده شدن» خط، روی «برش مسیر تا» از ۰ تا ۱۰۰ کی‌فریم بگذارید.'));
      return;
    }
    if (L.type === 'audio') {
      const it = this.host.media.get(D.media);
      body.append(h('div', { class: 'frow' },
        h('span', { class: 'pill' }, it ? `${it.name || ''} · ${it.dur ? it.dur.toFixed(1) + ' ثانیه' : ''}` : 'فایلی انتخاب نشده'),
        h('button', { class: 'btn sm ghost', onclick: async () => {
          this._replaceFor = L; this.pickMedia();
        } }, 'انتخاب فایل صوتی')));
      this._props(L, body, ['vol']);
      body.append(this._staticNum('سرعت', D.speed, 0.25, 4, 0.05, v => { D.speed = v; }, '×'));
      body.append(this._staticNum('شروع از ثانیهٔ', D.trimIn, 0, Math.max(1, it?.dur || 60), 0.05, v => { D.trimIn = v; }));
      body.append(this._staticNum('پایان در ثانیهٔ', D.trimOut ?? (it?.dur || 60), 0, Math.max(1, it?.dur || 60), 0.05, v => { D.trimOut = v; }));
      body.append(h('div', { class: 'frow btns' },
        h('button', { class: 'btn sm ghost', onclick: () => { D.trimOut = null; this.changed(true); } }, 'پایان = انتهای فایل')));
      body.append(this._staticNum('محو شروع (ثانیه)', D.fadeIn || 0, 0, 10, 0.1, v => { D.fadeIn = v; }));
      body.append(this._staticNum('محو پایان (ثانیه)', D.fadeOut || 0, 0, 10, 0.1, v => { D.fadeOut = v; }));
      body.append(h('div', { class: 'frow btns' },
        check('تکرار', D.loop !== false, v => { D.loop = v; this.changed(); })));
      body.append(h('p', { class: 'note' }, 'صدای این لایه در پیش‌نمایش پخش می‌شود و در خروجی با آهنگ پروژه میکس می‌شود.'));
      return;
    }
    if (L.type === 'image' || L.type === 'video') {
      const it = this.host.media.get(D.media);
      body.append(h('div', { class: 'frow' },
        h('span', { class: 'pill' }, it ? `${it.name || ''} · ${it.w}×${it.h}` : 'فایلی انتخاب نشده'),
        h('button', { class: 'btn sm ghost', onclick: async () => {
          this._replaceFor = L; this.pickMedia();
        } }, 'تعویض فایل')));
      this._props(L, body, ['w', 'radius']);
      body.append(h('div', { class: 'frow btns' },
        h('button', { class: 'btn sm ghost', onclick: () => {
          if (!it?.ready) return;
          const W = this.host.W(), H = this.host.H();
          L.props.w = { v: Math.round(Math.max(W, H * it.w / it.h)) };
          L.props.x = { v: 0 }; L.props.y = { v: 0 }; this.changed(true);
        } }, 'پر کردن قاب'),
        h('button', { class: 'btn sm ghost', onclick: () => {
          if (!it?.ready) return;
          const W = this.host.W(), H = this.host.H();
          L.props.w = { v: Math.round(Math.min(W, H * it.w / it.h)) };
          L.props.x = { v: 0 }; L.props.y = { v: 0 }; this.changed(true);
        } }, 'جا شدن در قاب')));
      if (L.type === 'video') {
        body.append(this._staticNum('سرعت', D.speed, 0.25, 4, 0.05, v => { D.speed = v; }, '×'));
        body.append(this._staticNum('شروع از ثانیهٔ', D.trimIn, 0, Math.max(1, it?.dur || 60), 0.05, v => { D.trimIn = v; }));
        body.append(this._staticNum('پایان در ثانیهٔ', D.trimOut ?? (it?.dur || 60), 0, Math.max(1, it?.dur || 60), 0.05, v => { D.trimOut = v; }));
        body.append(h('div', { class: 'frow btns' },
          h('button', { class: 'btn sm ghost', onclick: () => { D.trimOut = null; this.changed(true); } }, 'پایان = انتهای فایل')));
        body.append(h('div', { class: 'frow btns' },
          check('صدای خود ویدیو (پیش‌فرض خاموش، تا با آهنگ قاطی نشود)', !!D.sound, v => { D.sound = v; this.changed(true); })));
        body.append(h('div', { class: 'frow btns' },
          check('تکرار', D.loop !== false, v => { D.loop = v; this.changed(); }),
          h('button', { class: 'btn sm ghost', onclick: () => {
            if (!it?.dur) return;
            const end = D.trimOut ?? it.dur;
            L.t1 = +(L.t0 + (end - (D.trimIn || 0)) / (D.speed || 1)).toFixed(2); this.changed(true);
          } }, 'طول لایه = تا پایان')));
        body.append(h('p', { class: 'note' }, 'صدای ویدیو پخش نمی‌شود — صدای پروژه همان آهنگ است. برای حذف پردهٔ سبز در زبانهٔ «✦ افکت» دستهٔ «ترکیب و برش» ← «پردهٔ سبز» را بزنید.'));
      }
      return;
    }
    if (L.type === 'spectrum') {
      body.append(h('div', { class: 'frow btns' },
        select([['mirror', 'میله‌های وسط‌چین'], ['bars', 'میله‌های پایین'], ['circle', 'دایره‌ای'], ['wave', 'موج']],
          D.mode, v => { D.mode = v; this.changed(); }),
        select([['rms', 'بلندی کل'], ['low', 'بیس و کیک'], ['voc', 'صدای خواننده']], D.source,
          v => { D.source = v; this.changed(); })));
      body.append(this._staticNum('تعداد میله', D.bars, 4, 160, 1, v => { D.bars = v; }));
      this._props(L, body, ['w', 'h', 'fill', 'fill2', 'gain', 'gap']);
      return;
    }
    if (L.type === 'code' && L.data.el && ELEMENT_KINDS[L.data.el.kind]) { this._elementEdit(L, body); return; }
    if (L.type === 'code') {
      this._codeTweaks(L, body);
      this._props(L, body, ['w', 'h', 'c1', 'c2', 'p1', 'p2', 'p3']);
      body.append(h('p', { class: 'note' }, 'این مقدارها در کد به شکل e.c1، e.p1 و… در دسترس‌اند — و می‌شود رویشان کی‌فریم گذاشت. کد را در زبانهٔ «{} کد» بنویسید.'));
      return;
    }
    if (L.type === 'adjust') {
      body.append(h('p', { class: 'note' }, 'لایهٔ تنظیم روی هر چیزی که زیرش است اثر می‌گذارد. افکت‌هایش را از زبانهٔ «✦ افکت» بچینید؛ با «شفافیت» (پایین همین صفحه)، شدتش را کم و زیاد کنید.'));
      return;
    }
    body.append(h('p', { class: 'note' }, 'والد خالی دیده نمی‌شود. لایه‌های دیگر را از زبانهٔ «⚙ پیشرفته» فرزند این کنید تا با جابه‌جا کردن این، همه با هم حرکت کنند.'));
  }

  /** تنظیم‌های نام‌دار یک المان + تعویض با المان دیگر */
  _elementEdit(L, body) {
    const el = L.data.el, K = ELEMENT_KINDS[el.kind], p = elementParams(L);
    const W = this.host.W(), H = this.host.H();
    // تعویض: فهرست همهٔ المان‌ها، دسته‌بندی‌شده
    const sw = h('select', { class: 'elswap', onchange: () => {
      swapElement(L, sw.value, W, H); this.changed(true);
    } });
    for (const [cat, cl] of ELEMENT_CATS) {
      const og = h('optgroup', { label: cl });
      for (const [k, X] of Object.entries(ELEMENT_KINDS)) if (X.cat === cat) og.append(h('option', { value: k, selected: k === el.kind }, `${X.ic} ${X.label}`));
      sw.append(og);
    }
    body.append(h('div', { class: 'elhead' }, h('span', { class: 'elic' }, K.ic),
      h('div', {}, h('b', {}, K.label), h('small', {}, K.desc + (L.scene ? ` · صحنهٔ «${L.scene}»` : ''))),
      h('label', { class: 'elsw' }, h('small', {}, '⇄ تعویض با'), sw)));
    for (const d of K.params) {
      const cp = colorProp(el.kind, d.key);
      if (cp && L.props[cp]) {         // رنگ اصلی ← ویژگی لایه (کی‌فریم‌پذیر)
        const def = { key: cp, label: d.label, type: 'color', def: d.def };
        body.append(this._propRow(L, L.props[cp], def, `${L.id}.${cp}`));
        continue;
      }
      if (d.type === 'num') {
        body.append(this._staticNum(d.label, p[d.key], d.min, d.max, d.step, v => { setElementParam(L, d.key, v); }));
      } else if (d.type === 'color') {
        const inp = h('input', { type: 'color', value: String(p[d.key]).slice(0, 7), oninput: () => { setElementParam(L, d.key, inp.value); this.host.draw(); this.host.save(); } });
        body.append(h('div', { class: 'ctl' }, h('label', {}, d.label), inp));
      } else if (d.type === 'text') {
        let t = 0;
        const inp = h('input', { class: 'txt', type: 'text', value: p[d.key], oninput: () => {
          clearTimeout(t); t = setTimeout(() => { setElementParam(L, d.key, inp.value); this.host.draw(); this.host.save(); }, 200);
        } });
        body.append(h('div', { class: 'frow' }, h('label', {}, d.label), inp));
      } else if (d.type === 'sel') {
        body.append(h('div', { class: 'frow' }, h('label', {}, d.label),
          select(d.opts, p[d.key], v => { setElementParam(L, d.key, v); this.changed(); })));
      }
    }
    this._props(L, body, ['w', 'h']);
    body.append(h('p', { class: 'note' }, 'رنگ‌ها کی‌فریم می‌خورند (◆). «تعویض» زمان، جا، حرکت، افکت و رنگ‌ها را نگه می‌دارد. کد این المان در زبانهٔ «{} کد» دیده می‌شود.'));
  }

  /** «عددهای قابل تنظیم» کد آزاد: هر  const نام = مقدار; // برچسب  یک کنترل می‌شود */
  _codeTweaks(L, body) {
    const tws = findTweaks(L.data.code);
    const imp = isImportedCode(L.data.code);
    if (imp) body.append(h('p', { class: 'note' },
      '🧩 این لایه «کد وارد‌شده» است: کد اصلی همه‌چیز را خودش می‌کشد، پس نوشته‌ها و شکل‌هایش لایهٔ جدا نیستند و مستقیم روی تصویر انتخاب نمی‌شوند. ',
      'چیزهایی که برنامه پیدا کرده (متن، رنگ، عدد) همین پایین قابل‌تغییرند — مقدارهای 🌐 سراسری در همهٔ صحنه‌های همین کد با هم عوض می‌شوند. ',
      'برای بقیه: در زبانهٔ «{} کد» با 🔍 جستجو کنید و همان‌جا کد اصلی را عوض کنید؛ یا موقع ساخت پروژه گزینهٔ «✏️ نسخهٔ قابل‌ویرایش» را بزنید تا هر افکت یک لایهٔ جدا شود.'));
    if (!tws.length) return;
    body.append(h('div', { class: 'shead sm' }, imp ? 'متن‌ها و مقدارهای این کد' : 'مقدارهای داخل کد'));
    const gIdx = imp ? L.data.code.split('\n').findIndex(l => l.startsWith('// ── 🌐')) : -1;
    const isGlobal = tw => gIdx >= 0 && tw.line > gIdx;
    let headed = false;
    for (const tw of tws) {
      if (isGlobal(tw) && !headed) { headed = true; body.append(h('div', { class: 'shead sm' }, '🌐 سراسری (همهٔ صحنه‌های این کد)')); }
      const set = v => {
        const old = tw.value;
        L.data.code = setTweak(L.data.code, tw, v); tw.value = v;
        // مقدار سراسری ← همهٔ لایه‌های وارد‌شده از همین کد
        if (isGlobal(tw)) for (const O of this.host.getLayers?.() || []) {
          if (O === L || O.type !== 'code' || !isImportedCode(O.data?.code)) continue;
          const ot = findTweaks(O.data.code).find(x => x.name === tw.name && String(x.value) === String(old));
          if (ot) O.data.code = setTweak(O.data.code, ot, v);
        }
        this.host.draw(); this.host.save();
      };
      if (tw.type === 'num') body.append(this._staticNum(tw.label, tw.value, Math.min(tw.min, tw.value), Math.max(tw.max, tw.value), tw.step, set));
      else if (tw.type === 'color') {
        const inp = h('input', { type: 'color', value: tw.value.slice(0, 7), oninput: () => set(inp.value) });
        body.append(h('div', { class: 'ctl' }, h('label', {}, tw.label), inp));
      } else {
        let t = 0;
        const inp = h('input', { class: 'txt', type: 'text', value: tw.value, oninput: () => { clearTimeout(t); t = setTimeout(() => set(inp.value), 200); } });
        body.append(h('div', { class: 'frow' }, h('label', {}, tw.label), inp));
      }
    }
    body.append(h('p', { class: 'note' }, 'این کنترل‌ها از خط‌های «const نام = مقدار; // برچسب» در کد ساخته شده‌اند. بازه را می‌شود در برچسب نوشت: // سرعت [0..10]'));
  }

  _staticNum(label, val, min, max, step, set, unit = '') {
    const v = h('span', { class: 'v' }, nice(val) + unit);
    const r = h('input', { type: 'range', class: 'rng', min, max, step, value: val,
      oninput: () => { set(+r.value); v.textContent = nice(+r.value) + unit; this.host.draw(); this.host.save(); } });
    return h('div', { class: 'ctl' }, h('label', {}, label), r, v);
  }

  /* ── زبانهٔ «حرکت»: ورود / خروج / تکرار + کی‌فریم ─────────── */
  _tabAnim(L, body) {
    const W = this.animWhich;
    const parts = [['in', 'ورود', APPEAR], ['out', 'خروج', APPEAR], ['loop', 'در طول نمایش', LOOPS]];
    const seg = h('div', { class: 'seg' });
    for (const [id, label, table] of parts) {
      const cur = L.anim[id].id;
      seg.append(h('button', { class: W === id ? 'on' : '', onclick: () => { this.animWhich = id; this.render(); } },
        h('b', {}, label), h('small', {}, cur === 'none' ? 'بدون' : table[cur]?.label || cur)));
    }
    body.append(seg);
    const a = L.anim[W];
    const pick = id => {
      a.id = id; this.changed(true);
      // پیش‌نمایش فوری: پرش به جایی که انیمیشن دیده شود
      if (W === 'in') this.host.seek(L.t0 + 0.01);
      if (W === 'out') this.host.seek(Math.max(L.t0, L.t1 - (a.d || 0.5) - 0.05));
      if (id !== 'none' && W !== 'loop') this.host.playRange(W === 'in' ? L.t0 : Math.max(L.t0, L.t1 - (a.d || 0.5) - 0.1),
        W === 'in' ? Math.min(L.t1, L.t0 + (a.d || 0.5) + 0.4) : L.t1);
    };
    const chip = (id, o) => h('button', { class: 'achip' + (a.id === id ? ' on' : ''), onclick: () => pick(id) }, o.label);
    if (W === 'loop') {
      body.append(h('div', { class: 'agrid' }, ...Object.entries(LOOPS).map(([id, o]) => chip(id, o))));
      body.append(this._staticNum('سرعت', a.s ?? 1, 0.1, 5, 0.05, v => { a.s = v; }, '×'));
      body.append(this._staticNum('شدت', a.a ?? 100, 0, 300, 1, v => { a.a = v; }, '٪'));
    } else {
      for (const [g, ids] of APPEAR_GROUPS) {
        if (g === 'مخصوص متن' && L.type !== 'text') continue;
        body.append(h('div', { class: 'fxcat' }, g));
        body.append(h('div', { class: 'agrid' }, ...ids.filter(id => APPEAR[id]).map(id => chip(id, APPEAR[id]))));
      }
      body.append(this._staticNum('مدت', a.d, 0.1, 3, 0.05, v => { a.d = v; }, ' ث'));
    }
    body.append(h('div', { class: 'frow btns' },
      h('button', { class: 'btn sm primary', onclick: () => this.host.playRange(L.t0, L.t1) }, '▶ پخش این لایه')));

    const keys = h('details', { class: 'grp', open: hasAnyKeys(L) || this.tabEaseOpen },
      h('summary', {}, '◆ کی‌فریم‌ها و منحنی سرعت (حرکت دلخواه)'));
    keys.addEventListener('toggle', () => { this.tabEaseOpen = keys.open; });
    keys.append(h('p', { class: 'note' }, 'برای حرکت دلخواه: در یک لحظه دکمهٔ ◆ کنار ویژگی را بزنید، نشانگر را جلو ببرید، مقدار را عوض کنید. '
      + 'انیمیشن‌های آمادهٔ بالا روی کی‌فریم‌ها «اضافه» می‌شوند.'));
    this._tabEase(L, keys);
    body.append(keys);
  }

  /* ── زبانهٔ «افکت»: افکت‌های فعلی + ظاهر آماده + گالری ───── */
  _tabFx(L, body, opt = {}) {
    const ch = opt.onChange || (() => this.changed(true));
    body.append(h('div', { class: 'shead sm' }, `افکت‌های این لایه (${faN(L.effects.length)})`,
      h('div', { class: 'spacer' }),
      // فاز ۱۵ — کپی/چسباندن افکت‌ها بین لایه‌ها (مثل Alight)
      L.effects.length ? h('button', { class: 'btn sm ghost', onclick: () => {
        this._fxClipboard = JSON.parse(JSON.stringify(L.effects));
        this.render();
      } }, '⎘ کپی افکت‌ها') : null,
      this._fxClipboard?.length ? h('button', { class: 'btn sm primary', onclick: () => {
        for (const fx of this._fxClipboard) {
          const nf = newEffect(fx.type);
          nf.on = fx.on !== false;
          for (const d of EFFECTS[fx.type]?.params || []) if (fx.p?.[d.key]) nf.p[d.key] = JSON.parse(JSON.stringify(fx.p[d.key]));
          L.effects.push(nf);
        }
        ch();
      } }, `⎘ چسباندن ${faN(this._fxClipboard.length)} افکت`) : null,
      L.effects.length ? h('button', { class: 'btn sm ghost', onclick: () => {
        if (!confirm('همهٔ افکت‌های این لایه پاک شود؟')) return;
        L.effects = []; ch();
      } }, 'پاک کردن همه') : null));
    if (!L.effects.length) body.append(h('p', { class: 'note' }, 'هنوز افکتی ندارد. از «ظاهر آماده» یا گالری پایین یکی بزنید.'));
    L.effects.forEach((fx, i) => {
      const E = EFFECTS[fx.type];
      const card = h('details', { class: 'fxbox', open: this._openFx === fx.id },
        h('summary', {},
          h('span', { class: 'fxi' }, E.ic || '✦'),
          h('span', { class: 'fxn' + (fx.on ? '' : ' off') }, E.label),
          h('span', { class: 'spacer' }),
          iconBtn(fx.on ? '●' : '○', 'روشن/خاموش', ev => { ev.preventDefault(); fx.on = !fx.on; ch(); }),
          iconBtn('↑', 'بالاتر', ev => { ev.preventDefault(); if (i > 0) { [L.effects[i - 1], L.effects[i]] = [L.effects[i], L.effects[i - 1]]; ch(); } }),
          iconBtn('↓', 'پایین‌تر', ev => { ev.preventDefault(); if (i < L.effects.length - 1) { [L.effects[i + 1], L.effects[i]] = [L.effects[i], L.effects[i + 1]]; ch(); } }),
          iconBtn((this._fxFav || []).includes(fx.type) ? '★' : '☆', 'علاقه‌مندی', ev => { ev.preventDefault();
            this._fxFav = (this._fxFav || []).includes(fx.type)
              ? this._fxFav.filter(k => k !== fx.type) : [...(this._fxFav || []), fx.type];
            ch(); }),
          iconBtn('⧉', 'تکثیر', ev => { ev.preventDefault(); const nf = newEffect(fx.type); nf.on = fx.on !== false;
            for (const d of EFFECTS[fx.type]?.params || []) if (fx.p && d.key in fx.p) nf.p[d.key] = JSON.parse(JSON.stringify(fx.p[d.key]));
            L.effects.splice(i + 1, 0, nf); ch(); }),
          iconBtn('✕', 'حذف', ev => { ev.preventDefault(); L.effects.splice(i, 1); ch(); }),
        ));
      card.addEventListener('toggle', () => { if (card.open) this._openFx = fx.id; });
      if (E.desc) card.append(h('p', { class: 'note' }, E.desc));
      for (const d of E.params) card.append(this._propRow(L, fx.p[d.key], d, `${L.id}.${fx.id}.${d.key}`));
      body.append(card);
    });

    // نوشته ← افکت ذره‌ای FLOW (همان صحنهٔ FLOW شوریل پایتون)
    if (L.type === 'text' && !opt.noLooks) {
      body.append(h('div', { class: 'shead sm' }, '🌊 افکت ذره‌ای FLOW برای همین نوشته'));
      body.append(h('p', { class: 'note' }, 'نوشته با هزاران ذرهٔ رنگی ساخته می‌شود (یک لایهٔ تازه با همین نوشته و همین زمان؛ نوشتهٔ ساده پنهان می‌شود و هر وقت خواستید برش می‌گردانید).'));
      body.append(this._strip(['flowTitle', 'flowPulse', 'flowText'].map(kind => this._thumbBtn(
        thumb('el:el_' + kind, () => { const T = makeElementLayer(kind, {}, 0, 5, 600, 400); T.props.w = { v: 600 }; T.props.h = { v: 400 }; T.props.y = { v: 0 }; return [T]; }, kind === 'flowText' ? 1.9 : kind === 'flowPulse' ? 1.04 : 1.6),
        kind === 'flowTitle' ? 'عنوان ریتمیک (اول ویدیو)' : kind === 'flowPulse' ? 'فقط با ریتم آهنگ می‌تپد' : 'جریان FLOW (هر جای ویدیو)', false,
        () => this.textToFlow(L, kind)))));
    }

    if (L.type !== 'null' && !opt.noLooks) {
      body.append(h('div', { class: 'shead sm' }, 'ظاهر آماده — چند افکت با هم'));
      body.append(this._strip(LOOKS.map(lk => this._thumbBtn(
        thumb('look:' + lk.id, () => [applyLook(sampleImage(), lk)]), lk.label, false,
        () => { applyLook(L, lk); ch(); }))));
    }

    // فاز ۲۰ — افکت‌های علاقه‌مندی (ستاره روی کارت افکت)
    const fav = (this._fxFav || []).filter(k => EFFECTS[k]);
    if (fav.length) {
      body.append(h('div', { class: 'shead sm' }, '⭐ افکت‌های علاقه‌مندی'));
      body.append(h('div', { class: 'fxgal' }, ...fav.map(k => {
        const E = EFFECTS[k];
        return h('button', { class: 'fxt', title: E.desc || E.label, onclick: () => {
          const fx = newEffect(k); L.effects.push(fx); this._openFx = fx.id; ch();
        } }, h('i', {}, E.ic || '✦'), h('b', {}, E.label));
      })));
    }
    // فاز ۱۳ — افکت‌های اخیر (مثل Alight): آخرین افکت‌های استفاده‌شده
    // بالای گالری می‌مانند تا دوباره زدن‌شان یک ضربه باشد.
    const recent = (this._recentFx || []).filter(k => avail.some(([id]) => id === k));
    if (recent.length) {
      body.append(h('div', { class: 'shead sm' }, '🕘 افکت‌های اخیر'));
      body.append(h('div', { class: 'fxgal' }, ...recent.map(k => {
        const E = EFFECTS[k];
        return h('button', { class: 'fxt', title: E.desc || E.label, onclick: () => {
          const fx = newEffect(k); L.effects.push(fx); this._openFx = fx.id; ch();
        } }, h('i', {}, E.ic || '✦'), h('b', {}, E.label));
      })));
    }
    body.append(h('div', { class: 'shead sm' }, 'افزودن افکت'));
    const avail = effectsFor(L.type).filter(([, E]) => !opt.kinds || opt.kinds.includes(E.kind));
    const cats = EFFECT_CATS.filter(([c]) => avail.some(([, E]) => E.cat === c));
    if (!cats.some(([c]) => c === this.fxCat)) this.fxCat = cats[0]?.[0];
    const grid = h('div', { class: 'fxgal' });
    let showCat = c => {
      this.fxCat = c;
      for (const b of catBar.children) b.classList.toggle('on', b.dataset.c === c);
      grid.innerHTML = '';
      for (const [k, E] of avail) {
        if (E.cat !== c) continue;
        const sample = E.kind === 'move' ? null
          : thumb('fx:' + k, () => {
            const S = E.cat === 'text' || E.cat === 'light' ? sampleText('افکت')
              : E.cat === 'combo' ? sampleShape() : sampleImage();
            if (k === 'repeat') S.props.x = { v: -120 };
            S.effects = [fxWith(k, k === 'outline' ? { color: '#E4142A', w: 6 } : {})];
            return [S];
          });
        grid.append(h('button', { class: 'fxt', title: E.desc || E.label, onclick: () => {
          const fx = newEffect(k); L.effects.push(fx); this._openFx = fx.id;
          this._recentFx = [k, ...(this._recentFx || []).filter(x => x !== k)].slice(0, 8);
          ch();
        } }, sample || h('i', {}, E.ic || '✦'), h('b', {}, E.label), h('small', {}, E.desc || '')));
      }
    };
    const fxSearch = h('input', { class: 'txt', type: 'search', placeholder: 'جستجوی افکت: تاری، نور، چرخش…',
      value: this._fxSearch || '',
      oninput: () => { this._fxSearch = fxSearch.value.trim(); showCat(this.fxCat); } });
    const applyFxSearch = () => {
      const q = (this._fxSearch || '').trim().toLowerCase();
      if (!q) return;
      for (const t of grid.children) {
        const txt = (t.title + ' ' + t.textContent).toLowerCase();
        t.style.display = txt.includes(q) ? '' : 'none';
      }
    };
    const catBar = h('div', { class: 'tabs' }, ...cats.map(([c, label]) => {
      const b = h('button', { class: 'chip', onclick: () => showCat(c) }, label);
      b.dataset.c = c;
      return b;
    }));
    body.append(fxSearch, catBar, grid);
    const _origShowCat = showCat;
    showCat = c => { _origShowCat(c); applyFxSearch(); };
    showCat(this.fxCat);
  }

  /* ── زبانهٔ «پیشرفته» ─────────────────────────────────────── */
  _tabAdv(L, body) {
    this._tabMore(L, body);
    if (L.type !== 'code') {
      const ex = h('details', { class: 'grp', open: propDefs(L.type).some(d => L.props[d.key]?.x) },
        h('summary', {}, 'ƒ فرمول (Expression) — حرکت با یک خط کد'));
      this._tabCode(L, ex);
      body.append(ex);
    }
  }

  _tabEase(L, body) {
    const times = allKeyTimes(L);
    if (!times.length) {
      body.append(h('div', { class: 'empty' },
        h('p', {}, 'این لایه هنوز کی‌فریم ندارد.'),
        h('p', { class: 'note' }, 'کی‌فریم یعنی «در این لحظه، این مقدار». دو کی‌فریم بگذارید تا لایه بینشان حرکت کند؛ منحنی تعیین می‌کند این حرکت چطور طی شود: یکنواخت، نرم، با پرش یا فنری.'),
        h('button', { class: 'btn sm primary', onclick: () => {
          // حرکت نمونه: از چپ بیاید و با فراتر رفتن بایستد
          const x = L.props.x, v = sample(x, 0);
          setKey(x, 0, v - 400, 'outBack'); setKey(x, Math.min(1, L.t1 - L.t0), v, 'outBack');
          this.host.seek(L.t0); this.changed(true);
        } }, 'یک حرکت نمونه بساز')));
      return;
    }
    const now = this.lt(L);
    if (this.keySel === null || !times.some(k => Math.abs(k - this.keySel) < 1e-3)) {
      this.keySel = [...times].reverse().find(k => k <= now + 1 / 120) ?? times[0];
    }
    const kt = this.keySel;
    const strip = h('div', { class: 'kstrip' });
    times.forEach((k, i) => strip.append(h('button', {
      class: 'kchip' + (Math.abs(k - kt) < 1e-3 ? ' on' : ''),
      onclick: () => { this.keySel = k; this.host.seek(L.t0 + k); this.render(); },
    }, '◆ ', faN(i + 1), h('small', {}, ` ${faN(k.toFixed(2))}ث`))));
    body.append(strip);

    const isLast = Math.abs(kt - times[times.length - 1]) < 1e-3;
    // منحنی فعلی: از اولین ترکی که در این لحظه کی‌فریم دارد
    let cur = 'linear';
    outer: for (const tr of Object.values(L.props)) for (const q of tr.k || []) if (Math.abs(q.t - kt) < 1e-3) { cur = q.e || 'linear'; break outer; }
    for (const fx of L.effects) for (const tr of Object.values(fx.p)) for (const q of tr.k || []) if (Math.abs(q.t - kt) < 1e-3 && cur === 'linear') cur = q.e || 'linear';

    body.append(h('p', { class: 'note' }, isLast
      ? 'این آخرین کی‌فریم است؛ منحنی‌اش فقط وقتی اثر دارد که بعدش کی‌فریم دیگری بگذارید.'
      : `منحنی حرکت از کی‌فریم ${faN(times.indexOf(kt) + 1)} تا بعدی: «${easeLabel(cur)}»`));

    const apply = e => { setEaseAt(L, kt, e); this.changed(); this._bez?.set(e); markOn(e); };
    const grid = h('div', { class: 'egrid' });
    const btns = [];
    for (const [id, label] of EASE_INFO) {
      const b = h('button', { class: 'ebtn' + (cur === id ? ' on' : ''), onclick: () => apply(id), title: label });
      b.innerHTML = easeIcon(id);
      b.append(h('span', {}, label));
      b.dataset.id = id;
      btns.push(b); grid.append(b);
    }
    const markOn = e => btns.forEach(b => b.classList.toggle('on', b.dataset.id === e));
    body.append(grid);

    body.append(h('div', { class: 'shead sm' }, 'منحنی دلخواه — دستگیره‌ها را بکشید'));
    this._bez = new BezierEditor(bez => apply(bez));
    this._bez.set(cur);
    this._bez.start();
    body.append(this._bez.cv);
    body.append(h('div', { class: 'frow btns' },
      h('button', { class: 'btn sm ghost', onclick: () => {
        for (const k of times) setEaseAt(L, k, this._bez.spec ?? cur);
        this.changed(true);
      } }, 'همین منحنی روی همهٔ کی‌فریم‌ها'),
      h('button', { class: 'btn sm ghost', onclick: () => { deleteKeysAt(L, kt); this.keySel = null; this.changed(true); } }, 'حذف این کی‌فریم')));
  }

  _tabCode(L, body) {
    if (L.type === 'code') {
      const D = L.data;
      if (D.el && ELEMENT_KINDS[D.el.kind]) body.append(h('p', { class: 'note warn' },
        `این لایه المان «${ELEMENT_KINDS[D.el.kind].label}» است و کدش از روی تنظیم‌های زبانهٔ «✎ تنظیم» ساخته می‌شود. `
        + 'اگر کد را دستی عوض کنید، به «لایهٔ کد آزاد» تبدیل می‌شود (تنظیم‌های نام‌دار دیگر نیستند، ولی عددهای const بالای کد قابل تنظیم می‌مانند).'));
      const ta = h('textarea', { class: 'code', spellcheck: false, value: D.code || '' });
      const msg = h('div', { class: 'msg' });
      const show = () => {
        const err = this.host.renderer.motion.errors.get(L.id);
        msg.textContent = err || 'سالم ✓ — تغییرات زنده روی تصویر دیده می‌شود';
        msg.className = 'msg ' + (err ? 'err' : 'ok');
        ta.classList.toggle('bad', !!err);
      };
      let timer = 0;
      ta.oninput = () => {
        clearTimeout(timer);
        timer = setTimeout(() => {
          if (D.el && ta.value !== D.code) delete D.el;      // ویرایش دستی ← کد آزاد
          D.code = ta.value; this.host.draw(); this.host.save(); setTimeout(show, 30);
        }, 300);
      };
      const sn = select([['', 'نمونه‌کدها…'], ...Object.keys(CODE_SNIPPETS).map(k => [k, k])], '', k => {
        if (!k) return;
        ta.value = CODE_SNIPPETS[k]; ta.oninput();
      });
      body.append(h('div', { class: 'frow btns' }, sn,
        h('button', { class: 'btn sm ghost', onclick: () => { ta.value = CODE_LAYER_DEFAULT; ta.oninput(); } }, 'پیش‌فرض'),
        h('button', { class: 'btn sm ghost', onclick: () => this.host.openLearn?.() }, '؟ آموزش کدنویسی')));
      body.append(ta, msg);
      attachCodeSearch(ta, { open: true });
      body.append(h('details', { class: 'xhelp' }, h('summary', {}, 'فهرست ابزارهای e'),
        h('div', {}, ...[
          ['e.t / e.time', 'زمان لایه / زمان آهنگ'], ['e.p', 'پیشرفت لایه ۰..۱'],
          ['e.kick / e.rms', 'ضربه و بلندی صدا ۰..۱'], ['e.w / e.h', 'اندازهٔ کادر لایه'],
          ['e.c1 e.c2 e.p1 e.p2 e.p3', 'رنگ‌ها و پارامترهای قابل کی‌فریم'],
          ['e.circle(x,y,r,رنگ)', 'دایره'], ['e.ring(x,y,r,رنگ,ضخامت)', 'حلقه'],
          ['e.box(x,y,w,h,رنگ)', 'مستطیل وسط‌چین'], ['e.line(x1,y1,x2,y2,رنگ,ضخامت)', 'خط'],
          ['e.text(متن,x,y,اندازه,رنگ)', 'متن فارسی'], ['e.star / e.poly', 'ستاره و چندضلعی'],
          ['e.hsl(فام) / e.rgb(r,g,b)', 'ساخت رنگ'], ['e.sin e.cos e.lerp e.map e.noise e.random', 'ریاضی'],
          ['e.lineText', 'خط شعر فعلی'], ['ctx', 'بوم خام Canvas برای کارهای پیشرفته'],
        ].map(([k, d]) => h('div', { class: 'xh' }, h('code', {}, k), ' ', d)))));
      setTimeout(show, 50);
      return;
    }
    body.append(h('p', { class: 'note' }, 'هر ویژگی می‌تواند به‌جای کی‌فریم (یا کنارش) یک «عبارت» داشته باشد: یک خط کد که مقدار را می‌سازد. دکمهٔ ƒ کنار هر ویژگی را بزنید.'));
    const withX = [];
    for (const d of propDefs(L.type)) if (L.props[d.key]?.x) withX.push(d);
    if (withX.length) {
      body.append(h('div', { class: 'shead sm' }, 'ویژگی‌هایی که عبارت دارند'));
      for (const d of withX) body.append(this._propRow(L, L.props[d.key], d, `${L.id}.${d.key}`));
    }
    body.append(h('div', { class: 'shead sm' }, 'افزودن سریع'));
    const quick = [
      ['تپش اندازه با ضرب', 'sc', 'value * (1 + kick * 0.35)'],
      ['شناوری عمودی', 'y', 'value + sin(time * 2) * 30'],
      ['لرزش جا', 'x', 'value + wiggle(4, 18)'],
      ['چرخش پیوسته', 'rot', 'value + t * 60'],
      ['چشمک شفافیت', 'opacity', 'every(0.25) ? value : value * 0.3'],
    ];
    body.append(h('div', { class: 'agrid' }, ...quick.map(([lb, key, x]) => h('button', { class: 'achip', onclick: () => {
      L.props[key].x = x; this.openExpr.add(`${L.id}.${key}`); this.changed(true);
    } }, lb))));
    body.append(h('details', { class: 'xhelp', open: true }, h('summary', {}, 'راهنمای عبارت'),
      h('div', {}, ...EXPR_HELP.map(([k, d]) => h('div', { class: 'xh' }, h('code', {}, k), ' ', d)))));
  }

  _tabMore(L, body) {
    body.append(h('div', { class: 'frow' }, h('label', {}, 'حالت ترکیب'),
      select(BLEND_MODES, L.blend, v => { L.blend = v; this.changed(); })));
    // والد: نه خودش، نه نوادگانش (وگرنه حلقه می‌شود)
    const desc = new Set([L.id]);
    let grow = true;
    while (grow) { grow = false; for (const x of this.layers) if (x.parent && desc.has(x.parent) && !desc.has(x.id)) { desc.add(x.id); grow = true; } }
    body.append(h('div', { class: 'frow' }, h('label', {}, 'والد'),
      select([['', '— بدون والد —'], ...this.layers.filter(x => !desc.has(x.id)).map(x => [x.id, x.name])],
        L.parent || '', v => { L.parent = v || null; this.changed(); })));
    if (L.type === 'null') body.append(h('div', { class: 'frow btns' },
      h('button', { class: 'btn sm ghost', onclick: () => {
        const kids = ungroup(L, this.layers);
        if (!kids.length) alert('این گروه فرزندی ندارد.');
        this.changed(true);
      } }, 'باز کردن گروه (آزاد کردن فرزندان)')));
    body.append(h('div', { class: 'frow' }, h('label', {}, 'ماسک'),
      select([['none', 'بدون ماسک'], ['below', 'فقط داخل لایهٔ زیرین'], ['belowInv', 'فقط بیرون لایهٔ زیرین']],
        L.clip || 'none', v => { L.clip = v; this.changed(); })));
    body.append(h('p', { class: 'note' }, 'ماسک: لایهٔ زیرینِ همین لایه (یک ردیف پایین‌تر در فهرست) دیگر کشیده نمی‌شود و فقط شکلش برای بریدن این لایه استفاده می‌شود. مثلاً متن داخل یک دایره.'));
    body.append(this._staticNum('تاری حرکت', L.mblur || 0, 0, 100, 1, v => { L.mblur = v; }, '٪'));
    body.append(h('div', { class: 'frow btns' },
      check('پشت شعر', L.behind, v => { L.behind = v; this.changed(); }),
      check('قفل', L.locked, v => { L.locked = v; this.changed(); }),
      check('نمایش', L.visible !== false, v => { L.visible = v; this.changed(); })));
    const num = (label, key) => {
      const i = h('input', { type: 'number', step: 0.05, value: L[key], onchange: () => {
        const v = +i.value; if (!Number.isFinite(v)) return;
        if (key === 't0' && v < L.t1 - 0.05) L.t0 = Math.max(0, v);
        if (key === 't1' && v > L.t0 + 0.05) L.t1 = v;
        this.changed(true);
      } });
      return [h('label', {}, label), i];
    };
    body.append(h('div', { class: 'frow' }, ...num('شروع', 't0'), ...num('پایان', 't1'), h('span', { class: 'dim' }, 'ثانیه')));
    body.append(h('div', { class: 'frow btns' },
      h('button', { class: 'btn sm ghost', onclick: () => {
        const len = L.t1 - L.t0; L.t0 = +this.host.getTime().toFixed(2); L.t1 = +(L.t0 + len).toFixed(2); this.changed(true);
      } }, 'شروع از نشانگر')));
  }

  /* ── دستکاری روی بوم: کشیدن، بزرگ کردن، چرخاندن ─────────── */
  attachGizmo() {
    const { canvas, stage, renderer: R } = this.host;
    const ptrs = new Map();
    let g = null;              // حالت کشیدن فعلی

    const design = e => stage.toDesign(e.clientX, e.clientY);
    const env = () => {
      const t = this.host.getTime();
      return { ...frameEnv(R.song, t, this.host.W(), this.host.H()), song: R.song, fx: {}, playing: false };
    };
    const active = () => this.host.isPaneOpen() || !!this.sel;

    const begin = (L, mode, p) => {
      const t = this.host.getTime(), lt = this.lt(L);
      const hd = R.motion.handles(stage.ctx, L, this.layers, t, env(), this.host.media);
      const st = hd.st;
      const parentLin = M.mul(st.world, M.invert(st.local) || M.I());
      g = {
        L, mode, lt, p0: p, anchor: hd.anchor,
        x0: sample(L.props.x, lt), y0: sample(L.props.y, lt),
        sc0: sample(L.props.sc, lt), rot0: sample(L.props.rot, lt),
        invParent: M.invert(parentLin) || M.I(),
      };
    };

    canvas.addEventListener('pointerdown', e => {
      if (!active()) return;
      const p = design(e);
      ptrs.set(e.pointerId, p);
      const t = this.host.getTime();
      const L = this.sel;

      if (ptrs.size === 2 && g && L) {
        // دو انگشت: بزرگ‌نمایی و چرخش هم‌زمان
        const [a, b] = [...ptrs.values()];
        g.mode = 'pinch';
        g.d0 = Math.hypot(b.x - a.x, b.y - a.y);
        g.a0 = Math.atan2(b.y - a.y, b.x - a.x);
        g.sc0 = sample(L.props.sc, g.lt); g.rot0 = sample(L.props.rot, g.lt);
        e.stopImmediatePropagation(); e.preventDefault();
        return;
      }

      if (L && !L.locked && t >= L.t0 && t < L.t1) {
        const hd = R.motion.handles(stage.ctx, L, this.layers, t, env(), this.host.media);
        const tol = 34 / Math.max(0.2, stage.scale * 2) + 14;
        if (Math.hypot(p.x - hd.rot.x, p.y - hd.rot.y) < tol) { begin(L, 'rotate', p); }
        else if (hd.corners.some(c => Math.hypot(p.x - c.x, p.y - c.y) < tol)) { begin(L, 'scale', p); }
      }
      if (!g) {
        const hit = R.motion.hit(stage.ctx, this.layers, t, env(), p.x, p.y, this.host.media);
        if (hit) {
          if (hit.id !== this.host.selectedId()) { this.host.select(hit.id); this.render(); }
          begin(hit, 'move', p);
        } else if (this.host.isPaneOpen()) {
          if (this.host.selectedId()) { this.host.select(null); this.render(); }
          ptrs.delete(e.pointerId);
          return;                     // اجازه بده بقیه (مثلاً متن ساده) رویداد را بگیرند
        } else { ptrs.delete(e.pointerId); return; }
      }
      canvas.setPointerCapture?.(e.pointerId);
      e.stopImmediatePropagation(); e.preventDefault();
    }, { capture: true });

    canvas.addEventListener('pointermove', e => {
      if (!g || !ptrs.has(e.pointerId)) return;
      const p = design(e);
      ptrs.set(e.pointerId, p);
      const { L, lt } = g;
      const set = (k, v) => setValue(L.props[k], lt, v, this.record);
      if (g.mode === 'move') {
        const d = M.applyVec(g.invParent, p.x - g.p0.x, p.y - g.p0.y);
        let nx = g.x0 + d.x, ny = g.y0 + d.y;
        // چسبیدن به وسط قاب
        const snap = 14 / Math.max(0.2, stage.scale);
        if (!L.parent) { if (Math.abs(nx) < snap) nx = 0; if (Math.abs(ny) < snap) ny = 0; }
        set('x', Math.round(nx)); set('y', Math.round(ny));
      } else if (g.mode === 'scale') {
        const d0 = Math.hypot(g.p0.x - g.anchor.x, g.p0.y - g.anchor.y) || 1;
        const d1 = Math.hypot(p.x - g.anchor.x, p.y - g.anchor.y);
        set('sc', Math.max(1, Math.round(g.sc0 * (d1 / d0))));
      } else if (g.mode === 'rotate') {
        const a0 = Math.atan2(g.p0.y - g.anchor.y, g.p0.x - g.anchor.x);
        const a1 = Math.atan2(p.y - g.anchor.y, p.x - g.anchor.x);
        let r = g.rot0 + ((a1 - a0) * 180) / Math.PI;
        if (Math.abs(r % 45) < 3) r = Math.round(r / 45) * 45;   // چسبیدن به زاویه‌های ۴۵ درجه
        set('rot', Math.round(r * 10) / 10);
      } else if (g.mode === 'pinch' && ptrs.size >= 2) {
        const [a, b] = [...ptrs.values()];
        const d = Math.hypot(b.x - a.x, b.y - a.y), an = Math.atan2(b.y - a.y, b.x - a.x);
        set('sc', Math.max(1, Math.round(g.sc0 * (d / (g.d0 || 1)))));
        set('rot', Math.round((g.rot0 + ((an - g.a0) * 180) / Math.PI) * 10) / 10);
      }
      this.host.draw();
      this.tick();
      e.stopImmediatePropagation(); e.preventDefault();
    }, { capture: true });

    const end = e => {
      if (!ptrs.has(e.pointerId)) return;
      ptrs.delete(e.pointerId);
      if (!g) return;
      if (ptrs.size === 0) { g = null; this.host.save(); this.render(); }
      else if (g.mode === 'pinch') {
        // یک انگشت ماند: از همان‌جا جابه‌جایی ادامه پیدا کند
        const L = g.L; const p = [...ptrs.values()][0];
        g = null; begin(L, 'move', p);
      }
      e.stopImmediatePropagation();
    };
    canvas.addEventListener('pointerup', end, { capture: true });
    canvas.addEventListener('pointercancel', end, { capture: true });
  }
}

/* ── کمک‌تابع‌های کوچک ─────────────────────────────────────── */
function iconBtn(ic, title, fn) {
  return h('button', { class: 'ib', title, onclick: e => { e.stopPropagation(); fn(e); } }, ic);
}
function hasAnyKeys(L) { return allKeyTimes(L).length > 0; }

export { prevKeyTime, nextKeyTime };
