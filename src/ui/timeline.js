import { SECTION_NAMES } from '../engine/song.js';
import { clamp, rgba } from '../engine/core.js';
import { allKeyTimes, moveKeyTime, trimStart, trimEnd } from '../motion/ops.js';

/**
 * تایم‌لاین افقی با لایه‌ها — مدل CapCut / Alight Motion
 *
 * نشانگر زمان وسط صفحه ثابت است و نوار زیرش می‌لغزد. این برعکسِ
 * حالت معمول است ولی روی گوشی خیلی بهتر جواب می‌دهد: انگشتتان
 * هیچ‌وقت لازم نیست دنبال یک خط متحرک بدود.
 *
 * ردیف‌ها:
 *   بخش‌ها   بلوک‌های رنگی که می‌شود انتخاب و لبه‌هایشان را کشید
 *   شعر      خط‌های کوتاه با متن، برای اینکه بدانید کجای آهنگید
 *   متن      لایه‌های متن ساده
 *   لایه‌ها  لایه‌های حرکتی؛ لایهٔ انتخاب‌شده کی‌فریم‌هایش (◆) را نشان
 *            می‌دهد که می‌شود کشید و جابه‌جا کرد
 *   صدا      شکل موج و نشانهٔ ضرب‌ها
 *
 * روی بوم کشیده می‌شود نه DOM، چون صدها بلوک و هزاران نمونهٔ موج
 * با عنصر HTML روی گوشی کُند می‌شود.
 */

const RULER = 15, SECT_H = 34, LYR_H = 22, TXT_H = 22, MOT_H = 38, WAVE_H = 30, GAP = 4;
export const TL_HEIGHT = RULER + SECT_H + LYR_H + TXT_H + MOT_H + WAVE_H + GAP * 5;
const LANES = 3;                 // لایه‌های حرکتی در سه باریکه کنار هم

const C = {
  bg: '#0B0D12', ruler: '#5A6372', line: '#222734',
  clip: '#171B24', text: '#E8EAF0', dim: '#737C8C',
  wave: '#2E3647', waveOn: '#49536A', beat: '#2A3142',
  head: '#E4142A', lyr: '#1A1E28', lyrOn: '#242A38',
};

export class Timeline {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {object} host  { getSong, getSections, getTime, seek, onSelect, onChange }
   */
  constructor(canvas, host) {
    this.cv = canvas;
    this.ctx = canvas.getContext('2d');
    this.host = host;
    this.pps = 46;                // پیکسل بر ثانیه (بزرگ‌نمایی)
    this.snapBeats = true;        // فاز ۹: چسبیدن به ضرب‌های آهنگ هم روشن است
    this.sel = -1;                // شمارهٔ بخش انتخاب‌شده (سازگاری)
    this.pick = null;             // { kind:'section'|'line'|'text', i|id }
    this.dpr = 1;
    this._drag = null;
    this._bind();
  }

  setZoom(k) {
    this.pps = clamp(this.pps * k, 8, 260);
    this.draw();
  }

  resize() {
    const r = this.cv.getBoundingClientRect();
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(80, Math.round(r.width * this.dpr));
    const h = Math.round(TL_HEIGHT * this.dpr);
    this.cv.style.height = TL_HEIGHT + 'px';
    if (this.cv.width !== w || this.cv.height !== h) { this.cv.width = w; this.cv.height = h; }
    this.draw();
  }

  /* مختصات ↔ زمان. نشانگر همیشه وسط است. */
  get cssW() { return this.cv.width / this.dpr; }
  xOf(t) { return this.cssW / 2 + (t - this.host.getTime()) * this.pps; }
  tOf(x) { return this.host.getTime() + (x - this.cssW / 2) / this.pps; }

  /** مرز عمودی هر لایه */
  rows() {
    const a = RULER + GAP;
    const b = a + SECT_H + GAP;
    const c = b + LYR_H + GAP;
    const m = c + TXT_H + GAP;
    const d = m + MOT_H + GAP;
    return { sec: [a, a + SECT_H], lyr: [b, b + LYR_H], txt: [c, c + TXT_H],
             mot: [m, m + MOT_H], wav: [d, d + WAVE_H] };
  }

  /** لایهٔ حرکتی انتخاب‌شده */
  _pickedLayer() {
    const p = this.pick;
    return p?.kind === 'layer' ? (this.host.getLayers?.() || []).find(L => L.id === p.id) : null;
  }

  /* ── رویدادها ─────────────────────────────────────────── */
  _bind() {
    const cv = this.cv;
    const pt = e => {
      const r = cv.getBoundingClientRect();
      const p = e.touches?.[0] ?? e;
      return { x: p.clientX - r.left, y: p.clientY - r.top };
    };

    cv.addEventListener('pointerdown', e => {
      const { x, y } = pt(e);
      const secs = this.host.getSections() || [];
      const R = this.rows();
      cv.setPointerCapture?.(e.pointerId);

      // لبهٔ کلیپ انتخاب‌شده؟ (بخش یا متن آزاد)
      const p = this.pick;
      if (p?.kind === 'section' && secs[p.i] && y >= R.sec[0] && y <= R.sec[1]) {
        const s = secs[p.i];
        const nb = this._secNeighbors(secs, s);
        if (Math.abs(x - this.xOf(s[0])) < 16) { this._drag = { mode: 'a', obj: s, ...nb }; e.preventDefault(); return; }
        if (Math.abs(x - this.xOf(s[1])) < 16) { this._drag = { mode: 'b', obj: s, ...nb }; e.preventDefault(); return; }
      }
      if (p?.kind === 'text' && y >= R.txt[0] && y <= R.txt[1]) {
        const L = (this.host.getTexts() || []).find(z => z.id === p.id);
        if (L) {
          const lim = this._textLimits(L);
          if (Math.abs(x - this.xOf(L.t0)) < 16) { this._drag = { mode: 'a', obj: L, k: 't0', ...lim }; e.preventDefault(); return; }
          if (Math.abs(x - this.xOf(L.t1)) < 16) { this._drag = { mode: 'b', obj: L, k: 't1', ...lim }; e.preventDefault(); return; }
          if (x > this.xOf(L.t0) && x < this.xOf(L.t1)) {
            this._drag = { mode: 'move', obj: L, x0: x, a0: L.t0, b0: L.t1, ...lim }; e.preventDefault(); return;
          }
        }
      }
      const PL = this._pickedLayer();
      if (PL && y >= R.mot[0] && y <= R.mot[1]) {
        // اول کی‌فریم‌ها (کوچک‌ترند و باید اولویت داشته باشند)
        for (const kt of allKeyTimes(PL)) {
          if (Math.abs(x - this.xOf(PL.t0 + kt)) < 11) {
            this._drag = { mode: 'key', obj: PL, kt, x0: x, moved: 0 }; e.preventDefault(); return;
          }
        }
        if (!PL.locked) {
          if (Math.abs(x - this.xOf(PL.t0)) < 14) { this._drag = { mode: 'la', obj: PL }; e.preventDefault(); return; }
          if (Math.abs(x - this.xOf(PL.t1)) < 14) { this._drag = { mode: 'lb', obj: PL }; e.preventDefault(); return; }
          if (x > this.xOf(PL.t0) && x < this.xOf(PL.t1)) {
            this._drag = { mode: 'move', obj: PL, x0: x, a0: PL.t0, b0: PL.t1, moved: 0, y }; e.preventDefault(); return;
          }
        }
      }
      this._drag = { mode: 'scrub', x0: x, t0: this.host.getTime(), moved: 0, y };
      e.preventDefault();
    });

    cv.addEventListener('pointermove', e => {
      if (!this._drag) return;
      const { x } = pt(e);
      const d = this._drag;
      if (d.mode === 'scrub') {
        d.moved = Math.max(d.moved, Math.abs(x - d.x0));
        this.host.seek(d.t0 - (x - d.x0) / this.pps);
      } else if (d.mode === 'key') {
        d.moved = Math.max(d.moved, Math.abs(x - d.x0));
        if (d.moved > 4) {
          const lt = this.tOf(x) - d.obj.t0;
          d.kt = moveKeyTime(d.obj, d.kt, lt);
          this.host.onChange?.(); this.draw();
        }
      } else if (d.mode === 'la') {
        const t = this._snap(this.tOf(x), d.obj);
        trimStart(d.obj, Math.max(0, Math.min(t, d.obj.t1 - 0.1)));
        this.host.onChange?.(); this.draw();
      } else if (d.mode === 'lb') {
        const t = this._snap(this.tOf(x), d.obj);
        trimEnd(d.obj, Math.max(t, d.obj.t0 + 0.1));
        this.host.onChange?.(); this.draw();
      } else if (d.mode === 'move') {
        d.moved = Math.max(d.moved || 0, Math.abs(x - d.x0));
        const dt = (x - d.x0) / this.pps;
        const len = d.b0 - d.a0;
        let a = Math.max(0, d.a0 + dt);
        // آهنربا: لبهٔ شروع یا پایان به نزدیک‌ترین مرز می‌چسبد
        const sa = this._snap(a, d.obj, true), sb = this._snap(a + len, d.obj, true);
        if (sa.hit && (!sb.hit || Math.abs(sa.t - a) <= Math.abs(sb.t - a - len))) { a = sa.t; this._guide = sa.t; }
        else if (sb.hit) { a = sb.t - len; this._guide = sb.t; }
        else this._guide = null;
        // متن‌های ساده روی هم نمی‌روند: بین همسایه‌ها قفل می‌شوند
        if (d.lo !== undefined) a = Math.max(d.lo, Math.min(a, d.hi - len));
        d.obj.t0 = Math.max(0, +a.toFixed(2));
        d.obj.t1 = +(d.obj.t0 + len).toFixed(2);
        this.host.onChange?.(); this.draw();
      } else {
        const o = d.obj; if (!o) return;
        let t = Math.max(0, this._snap(this.tOf(x), o));
        if (d.k) {
          // متن ساده
          if (d.mode === 'a') o.t0 = +Math.max(d.lo ?? 0, Math.min(t, o.t1 - 0.3)).toFixed(2);
          else o.t1 = +Math.min(d.hi ?? 1e9, Math.max(t, o.t0 + 0.3)).toFixed(2);
        } else if (d.mode === 'a') {
          // شروع بخش: به پایان بخش قبلی می‌چسبد و هرگز زیرش نمی‌رود
          const lo = d.prev ? (d.linkPrev ? d.prev[0] + 0.4 : d.prev[1]) : 0;
          t = Math.max(lo, Math.min(t, o[1] - 0.4));
          o[0] = +t.toFixed(2);
          if (d.linkPrev) d.prev[1] = o[0];
        } else {
          const dur = this.host.getDuration?.() || 1e9;
          const hi = d.next ? (d.linkNext ? d.next[1] - 0.4 : d.next[0]) : dur;
          t = Math.min(hi, Math.max(t, o[0] + 0.4));
          o[1] = +t.toFixed(2);
          if (d.linkNext) d.next[0] = o[1];
        }
        this.host.onChange?.(); this.draw();
      }
      e.preventDefault();
    });

    const up = e => {
      const d = this._drag;
      this._drag = null;
      if (this._guide != null) { this._guide = null; this.draw(); }
      if (!d) return;
      if (d.mode === 'key' && d.moved <= 4) {
        // ضربهٔ کوتاه روی ◆ = پرش به آن کی‌فریم
        this.host.seek(d.obj.t0 + d.kt);
        this.host.onKey?.(d.obj, d.kt);
        return;
      }
      if (d.mode === 'move' && d.moved < 6 && d.obj.type) {
        this._tapAt(d.x0, d.y);
        return;
      }
      if (d.mode === 'scrub' && d.moved < 6) {
        // ضربهٔ کوتاه = انتخاب کلیپ زیر انگشت، در هر لایه‌ای که باشد
        const R = this.rows();
        const t = this.tOf(d.x0), y = d.y;
        if (y >= R.sec[0] && y <= R.sec[1]) {
          const secs = this.host.getSections() || [];
          const i = secs.findIndex(s => t >= s[0] && t < s[1]);
          this.choose(i >= 0 ? { kind: 'section', i } : null);
        } else if (y >= R.lyr[0] && y <= R.lyr[1]) {
          const sg = this.host.getSong();
          const L = sg?.lines.find(l => t >= l.words[0].t && t <= sg.lineOut(l.i));
          this.choose(L ? { kind: 'line', i: L.i } : null);
        } else if (y >= R.txt[0] && y <= R.txt[1]) {
          const L = (this.host.getTexts() || []).find(z => t >= z.t0 && t <= z.t1);
          this.choose(L ? { kind: 'text', id: L.id } : null);
        } else if (y >= R.mot[0] && y <= R.mot[1]) {
          this._tapAt(d.x0, y);
        } else this.choose(null);
      } else if (d.mode !== 'scrub') {
        this.host.onChange?.(true);
      }
    };
    cv.addEventListener('pointerup', up);
    cv.addEventListener('pointercancel', up);

    // دو انگشت = بزرگ‌نمایی
    let pinch = 0;
    cv.addEventListener('touchstart', e => {
      if (e.touches.length === 2) {
        pinch = Math.hypot(e.touches[0].clientX - e.touches[1].clientX,
                           e.touches[0].clientY - e.touches[1].clientY);
        this._drag = null;
      }
    }, { passive: true });
    cv.addEventListener('touchmove', e => {
      if (e.touches.length === 2 && pinch) {
        const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX,
                             e.touches[0].clientY - e.touches[1].clientY);
        if (Math.abs(d - pinch) > 6) { this.setZoom(d / pinch); pinch = d; }
      }
    }, { passive: true });
  }

  /** بخش قبلی و بعدی، و اینکه به هم چسبیده‌اند یا نه */
  _secNeighbors(secs, s) {
    let prev = null, next = null;
    for (const o of secs) {
      if (o === s) continue;
      if (o[1] <= s[0] + 0.05 && (!prev || o[1] > prev[1])) prev = o;
      if (o[0] >= s[1] - 0.05 && (!next || o[0] < next[0])) next = o;
    }
    return { prev, next, linkPrev: !!prev && Math.abs(prev[1] - s[0]) < 0.06, linkNext: !!next && Math.abs(next[0] - s[1]) < 0.06 };
  }

  /** بازهٔ آزاد یک متن ساده بین همسایه‌هایش */
  _textLimits(L) {
    let lo = 0, hi = this.host.getDuration?.() || 1e9;
    for (const o of this.host.getTexts?.() || []) {
      if (o === L) continue;
      if (o.t1 <= L.t0 + 0.01) lo = Math.max(lo, o.t1);
      else if (o.t0 >= L.t1 - 0.01) hi = Math.min(hi, o.t0);
    }
    return { lo, hi };
  }

  /** همهٔ مرزهایی که می‌شود به آن‌ها چسبید */
  _markers() { return this.host.getMarkers?.() || this._localMarkers || (this._localMarkers = []); }

  /** افزودن/حذف نشانگر در زمان فعلی پخش (مثل نشانگرهای Alight) */
  addMarkerAtPlayhead() {
    const ms = this._markers(), t = this.host.getTime();
    const near = ms.findIndex(m => Math.abs(m - t) < 0.25);
    if (near >= 0) ms.splice(near, 1); else { ms.push(t); ms.sort((a, b) => a - b); }
    this.host.onChange?.(false);
    this.draw();
  }

  _snapTargets(self) {
    const out = [0, this.host.getTime()];
    const dur = this.host.getDuration?.(); if (dur) out.push(dur);
    for (const s of this.host.getSections?.() || []) if (s !== self) out.push(s[0], s[1]);
    const sg = this.host.getSong?.();
    for (const l of sg?.lines || []) out.push(l.words[0].t);
    // فاز ۹: ضرب‌های آهنگ هم هدف چسبیدن‌اند (مثل Alight که به بیت می‌چسبد)
    if (this.snapBeats) for (const b of sg?.beats || []) if (typeof b === 'number') out.push(b);
    for (const L of this.host.getTexts?.() || []) if (L !== self) out.push(L.t0, L.t1);
    for (const L of this.host.getLayers?.() || []) if (L !== self) out.push(L.t0, L.t1);
    for (const m of this._markers()) out.push(m);
    return out;
  }
  /** t را به نزدیک‌ترین مرز (تا ۱۰ پیکسل) بچسبان */
  _snap(t, self, detail = false) {
    const thr = 10 / this.pps;
    let best = t, bd = thr, hit = false;
    for (const c of this._snapTargets(self)) {
      const dd = Math.abs(c - t);
      if (dd < bd) { bd = dd; best = c; hit = true; }
    }
    if (detail) return { t: best, hit };
    this._guide = hit ? best : null;
    return best;
  }

  /** چیدن لایه‌ها در باریکه‌ها طوری که تا جای ممکن روی هم نیفتند */
  _lanes(list) {
    const lane = new Map(), ends = new Array(LANES).fill(-1e9);
    const order = list.map((L, i) => [L, i]).sort((a, b) => a[0].t0 - b[0].t0 || a[1] - b[1]);
    for (const [L] of order) {
      let k = ends.findIndex(e => e <= L.t0 + 0.001);
      if (k < 0) k = ends.indexOf(Math.min(...ends));
      lane.set(L.id, k);
      ends[k] = Math.max(ends[k], L.t1);
    }
    return lane;
  }

  /** ضربه روی ردیف لایه‌ها: لایهٔ همان باریکه، وگرنه بالاترین لایهٔ آن لحظه */
  _tapAt(x, y) {
    const R = this.rows();
    const t = this.tOf(x);
    const list = this.host.getLayers?.() || [];
    const lane = Math.floor(((y - R.mot[0]) / MOT_H) * LANES);
    const lanes = this._lanes(list);
    let hit = null;
    for (let i = list.length - 1; i >= 0; i--) {
      const L = list[i];
      if (t < L.t0 || t > L.t1) continue;
      if (lanes.get(L.id) === lane) { hit = L; break; }
      hit ??= L;
    }
    this.choose(hit ? { kind: 'layer', id: hit.id } : null);
  }

  select(i) { this.choose(i >= 0 ? { kind: 'section', i } : null); }

  choose(p) {
    this.pick = p;
    this.sel = p?.kind === 'section' ? p.i : -1;
    this.host.onSelect?.(p);
    this.draw();
  }

  /* ── رسم ──────────────────────────────────────────────── */
  draw() {
    const ctx = this.ctx, d = this.dpr;
    const W = this.cssW, H = TL_HEIGHT;
    ctx.setTransform(d, 0, 0, d, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, W, H);

    const song = this.host.getSong();
    const t = this.host.getTime();
    const dur = this.host.getDuration?.() || 1;
    const tL = this.tOf(0), tR = this.tOf(W);

    const R = this.rows();
    this._ruler(ctx, W, tL, tR);
    // فاز ۱۸ — نشانگرهای تایم‌لاین (پرچم روی خط‌کش)
    for (const m of this._markers()) {
      const x = Math.round(this.xOf(m)) + 0.5;
      if (x < -10 || x > W + 10) continue;
      ctx.strokeStyle = '#4DD8FF'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(x, RULER); ctx.lineTo(x, H); ctx.stroke();
      ctx.fillStyle = '#4DD8FF';
      ctx.beginPath(); ctx.moveTo(x, RULER); ctx.lineTo(x + 9, RULER + 4); ctx.lineTo(x, RULER + 8); ctx.closePath(); ctx.fill();
    }
    this._sections(ctx, W, R.sec[0]);
    this._lyrics(ctx, W, R.lyr[0], song);
    this._texts(ctx, W, R.txt[0]);
    this._layers(ctx, W, R.mot[0]);
    this._wave(ctx, W, R.wav[0], song, dur);

    // خط راهنمای آهنربا
    if (this._guide != null) {
      const gx = Math.round(this.xOf(this._guide)) + 0.5;
      ctx.strokeStyle = '#FFD84D'; ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.moveTo(gx, RULER); ctx.lineTo(gx, H); ctx.stroke(); ctx.setLineDash([]);
    }
    // برچسب ردیف‌ها — تا معلوم باشد هر ردیف چیست
    ctx.font = '8.5px "IRANSansX Bold", system-ui, sans-serif';
    ctx.textBaseline = 'middle'; ctx.direction = 'rtl'; ctx.textAlign = 'right';
    for (const [k, lb] of [['sec', 'بخش‌ها'], ['lyr', 'شعر'], ['txt', 'زیرنویس'], ['mot', 'لایه‌ها'], ['wav', 'صدا']]) {
      const [a] = R[k];
      const tw = ctx.measureText(lb).width + 8;
      ctx.fillStyle = 'rgba(11,13,18,0.82)';
      roundRect(ctx, W - tw - 2, a + 1, tw, 12, 4); ctx.fill();
      ctx.fillStyle = '#6E7790';
      ctx.fillText(lb, W - 6, a + 7);
    }

    // نشانگر ثابت وسط
    const cx = Math.round(W / 2) + 0.5;
    ctx.strokeStyle = C.head; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(cx, 0); ctx.lineTo(cx, H); ctx.stroke();
    ctx.fillStyle = C.head;
    ctx.beginPath();
    ctx.moveTo(cx - 5, 0); ctx.lineTo(cx + 5, 0); ctx.lineTo(cx, 7); ctx.closePath();
    ctx.fill();
  }

  _ruler(ctx, W, tL, tR) {
    // گام خط‌کش طوری انتخاب می‌شود که برچسب‌ها روی هم نیفتند
    const want = 70 / this.pps;
    const steps = [0.5, 1, 2, 5, 10, 15, 30, 60];
    const step = steps.find(s => s >= want) || 60;
    ctx.font = '9px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (let s = Math.ceil(tL / step) * step; s < tR; s += step) {
      const x = Math.round(this.xOf(s)) + 0.5;
      ctx.strokeStyle = C.line; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x, 9); ctx.lineTo(x, RULER); ctx.stroke();
      const m = Math.floor(s / 60), ss = Math.floor(s % 60);
      ctx.fillStyle = C.ruler;
      ctx.fillText(`${m}:${String(ss).padStart(2, '0')}`, x, 0);
    }
  }

  _sections(ctx, W, y) {
    const secs = this.host.getSections() || [];
    ctx.font = '11px "IRANSansX Bold", system-ui, sans-serif';
    ctx.textBaseline = 'middle';
    for (let i = 0; i < secs.length; i++) {
      const s = secs[i];
      const xa = this.xOf(s[0]), xb = this.xOf(s[1]);
      if (xb < -40 || xa > W + 40) continue;
      const w = Math.max(3, xb - xa);
      const on = this.pick?.kind === 'section' && this.pick.i === i;
      const acc = s[3] || '#E4142A';

      ctx.fillStyle = on ? rgba(acc, 0.3) : '#171B24';
      roundRect(ctx, xa, y, w, SECT_H, 7);
      ctx.fill();
      // نوار رنگی کنارهٔ راست (شروع بخش در راست‌به‌چپ)
      ctx.fillStyle = acc;
      roundRect(ctx, xb - 3, y, 3, SECT_H, 1.5);
      ctx.fill();
      ctx.strokeStyle = on ? acc : C.line;
      ctx.lineWidth = on ? 2 : 1;
      roundRect(ctx, xa, y, w, SECT_H, 7);
      ctx.stroke();

      if (w > 34) {
        ctx.save();
        ctx.beginPath(); ctx.rect(xa + 4, y, w - 10, SECT_H); ctx.clip();
        ctx.direction = 'rtl'; ctx.textAlign = 'right';
        ctx.fillStyle = on ? C.text : C.dim;
        const nm = this.host.label?.(s[2]) || SECTION_NAMES[s[2]] || s[2];
        ctx.fillText(nm, xb - 8, y + SECT_H / 2);
        ctx.restore();
      }
      if (on) {
        // دستگیرهٔ دو سر
        for (const hx of [xa, xb]) {
          ctx.fillStyle = acc;
          roundRect(ctx, hx - 4, y + SECT_H / 2 - 9, 8, 18, 4);
          ctx.fill();
        }
      }
    }
  }

  _lyrics(ctx, W, y, song) {
    if (!song?.lines?.length) return;
    ctx.font = '9.5px "IRANSansX Bold", system-ui, sans-serif';
    ctx.textBaseline = 'middle';
    const t = this.host.getTime();
    for (const L of song.lines) {
      const a = L.words[0].t, b = song.lineOut(L.i);
      const xa = this.xOf(a), xb = this.xOf(b);
      if (xb < -30 || xa > W + 30) continue;
      const sel = this.pick?.kind === 'line' && this.pick.i === L.i;
      const on = sel || (t >= a && t <= b);
      const fxOn = !!this.host.getLineFx?.()[L.i];
      ctx.fillStyle = sel ? 'rgba(228,20,42,0.26)' : on ? C.lyrOn : C.lyr;
      roundRect(ctx, xa, y, Math.max(2, xb - xa - 2), LYR_H, 4);
      ctx.fill();
      if (sel || fxOn) {
        ctx.strokeStyle = sel ? '#E4142A' : 'rgba(228,20,42,0.55)';
        ctx.lineWidth = sel ? 2 : 1;
        roundRect(ctx, xa, y, Math.max(2, xb - xa - 2), LYR_H, 4);
        ctx.stroke();
      }
      const w = xb - xa;
      if (w > 30) {
        ctx.save();
        ctx.beginPath(); ctx.rect(xa + 3, y, w - 8, LYR_H); ctx.clip();
        ctx.direction = 'rtl'; ctx.textAlign = 'right';
        ctx.fillStyle = on ? C.text : C.dim;
        ctx.fillText(L.text, xb - 6, y + LYR_H / 2);
        ctx.restore();
      }
    }
  }

  _texts(ctx, W, y) {
    const list = this.host.getTexts?.() || [];
    ctx.fillStyle = '#0E1116';
    roundRect(ctx, 0, y, W, TXT_H, 4); ctx.fill();
    ctx.font = '9.5px "IRANSansX Bold", system-ui, sans-serif';
    ctx.textBaseline = 'middle';
    for (const L of list) {
      const xa = this.xOf(L.t0), xb = this.xOf(L.t1);
      if (xb < -30 || xa > W + 30) continue;
      const sel = this.pick?.kind === 'text' && this.pick.id === L.id;
      ctx.fillStyle = sel ? 'rgba(228,20,42,0.3)' : '#232A38';
      roundRect(ctx, xa, y, Math.max(3, xb - xa - 2), TXT_H, 5); ctx.fill();
      ctx.strokeStyle = sel ? '#E4142A' : '#39425A';
      ctx.lineWidth = sel ? 2 : 1;
      roundRect(ctx, xa, y, Math.max(3, xb - xa - 2), TXT_H, 5); ctx.stroke();
      const w = xb - xa;
      if (w > 28) {
        ctx.save();
        ctx.beginPath(); ctx.rect(xa + 3, y, w - 8, TXT_H); ctx.clip();
        ctx.direction = 'rtl'; ctx.textAlign = 'right';
        ctx.fillStyle = sel ? '#E8EAF0' : '#9AA3B4';
        ctx.fillText(L.text || '—', xb - 6, y + TXT_H / 2);
        ctx.restore();
      }
      if (sel) {
        ctx.fillStyle = '#E4142A';
        for (const hx of [xa, xb]) { roundRect(ctx, hx - 3, y + 3, 6, TXT_H - 6, 3); ctx.fill(); }
      }
    }
  }

  _layers(ctx, W, y) {
    const list = this.host.getLayers?.() || [];
    ctx.fillStyle = '#0E1116';
    roundRect(ctx, 0, y, W, MOT_H, 4); ctx.fill();
    if (!list.length) {
      ctx.font = '9.5px "IRANSansX Bold", system-ui, sans-serif';
      ctx.fillStyle = '#3A4256'; ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
      ctx.direction = 'rtl';
      ctx.fillText('لایه‌های حرکتی اینجا می‌آیند — از تب «لایه‌ها» اضافه کنید', W / 2, y + MOT_H / 2);
      return;
    }
    const laneH = MOT_H / LANES;
    const sel = this._pickedLayer();
    ctx.font = '8.5px "IRANSansX Bold", system-ui, sans-serif';
    ctx.textBaseline = 'middle';
    const lanes = this._lanes(list);
    list.forEach((L) => {
      if (L === sel) return;
      const xa = this.xOf(L.t0), xb = this.xOf(L.t1);
      if (xb < -10 || xa > W + 10) return;
      const ly = y + lanes.get(L.id) * laneH + 1;
      ctx.globalAlpha = L.visible === false ? 0.35 : 1;
      ctx.fillStyle = L.behind ? '#1E2740' : '#2A2140';
      roundRect(ctx, xa, ly, Math.max(3, xb - xa - 1), laneH - 2, 3); ctx.fill();
      if (xb - xa > 40) {
        ctx.save(); ctx.beginPath(); ctx.rect(xa + 2, ly, xb - xa - 6, laneH); ctx.clip();
        ctx.direction = 'rtl'; ctx.textAlign = 'right'; ctx.fillStyle = '#AFA6CC';
        ctx.fillText(L.name || L.type, xb - 5, ly + laneH / 2);
        ctx.restore();
      }
      ctx.globalAlpha = 1;
    });
    if (!sel) return;
    // لایهٔ انتخاب‌شده تمام‌قد، با کی‌فریم‌ها
    const xa = this.xOf(sel.t0), xb = this.xOf(sel.t1);
    ctx.fillStyle = 'rgba(124,92,255,0.30)';
    roundRect(ctx, xa, y + 1, Math.max(3, xb - xa - 1), MOT_H - 2, 6); ctx.fill();
    ctx.strokeStyle = '#7C5CFF'; ctx.lineWidth = 2;
    roundRect(ctx, xa, y + 1, Math.max(3, xb - xa - 1), MOT_H - 2, 6); ctx.stroke();
    ctx.fillStyle = '#7C5CFF';
    for (const hx of [xa, xb]) { roundRect(ctx, hx - 3, y + 6, 6, MOT_H - 12, 3); ctx.fill(); }
    if (xb - xa > 50) {
      ctx.save(); ctx.beginPath(); ctx.rect(xa + 6, y, xb - xa - 12, 14); ctx.clip();
      ctx.direction = 'rtl'; ctx.textAlign = 'right'; ctx.fillStyle = '#E8E4FF';
      ctx.fillText(sel.name || sel.type, xb - 8, y + 9);
      ctx.restore();
    }
    const now = this.host.getTime() - sel.t0;
    const ky = y + MOT_H * 0.62;
    for (const kt of allKeyTimes(sel)) {
      const kx = this.xOf(sel.t0 + kt);
      if (kx < -8 || kx > W + 8) continue;
      const on = Math.abs(kt - now) < 1 / 60;
      ctx.save();
      ctx.translate(kx, ky); ctx.rotate(Math.PI / 4);
      ctx.fillStyle = on ? '#FFD84D' : '#F6F3EC';
      ctx.fillRect(-4.5, -4.5, 9, 9);
      ctx.strokeStyle = '#0B0D12'; ctx.lineWidth = 1.5; ctx.strokeRect(-4.5, -4.5, 9, 9);
      ctx.restore();
    }
  }

  _wave(ctx, W, y, song, dur) {
    ctx.fillStyle = '#0E1116';
    roundRect(ctx, 0, y, W, WAVE_H, 5); ctx.fill();
    if (!song?.A) return;
    const A = song.A, step = A.t_step || 0.093;
    const mid = y + WAVE_H / 2;
    const t = this.host.getTime();

    // ضرب‌ها فقط وقتی به‌هم نچسبند
    if (song.beats && this.pps * (60 / (A.tempo || 120)) > 7) {
      ctx.fillStyle = C.beat;
      for (const bt of song.beats) {
        const x = this.xOf(bt);
        if (x < -2 || x > W + 2) continue;
        ctx.fillRect(x, y + 3, 1, WAVE_H - 6);
      }
    }
    // شکل موج
    const n = A.rms?.length || 0;
    for (let px = 0; px < W; px += 2) {
      const tt = this.tOf(px);
      if (tt < 0 || tt > dur) continue;
      const i = Math.round(tt / step);
      if (i < 0 || i >= n) continue;
      const v = A.rms[i] || 0;
      const h = Math.max(1.5, v * (WAVE_H - 8));
      ctx.fillStyle = tt <= t ? C.waveOn : C.wave;
      ctx.fillRect(px, mid - h / 2, 1.6, h);
    }
  }
}

function roundRect(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

