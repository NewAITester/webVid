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
        if (Math.abs(x - this.xOf(s[0])) < 16) { this._drag = { mode: 'a', obj: s }; e.preventDefault(); return; }
        if (Math.abs(x - this.xOf(s[1])) < 16) { this._drag = { mode: 'b', obj: s }; e.preventDefault(); return; }
      }
      if (p?.kind === 'text' && y >= R.txt[0] && y <= R.txt[1]) {
        const L = (this.host.getTexts() || []).find(z => z.id === p.id);
        if (L) {
          if (Math.abs(x - this.xOf(L.t0)) < 16) { this._drag = { mode: 'a', obj: L, k: 't0' }; e.preventDefault(); return; }
          if (Math.abs(x - this.xOf(L.t1)) < 16) { this._drag = { mode: 'b', obj: L, k: 't1' }; e.preventDefault(); return; }
          if (x > this.xOf(L.t0) && x < this.xOf(L.t1)) {
            this._drag = { mode: 'move', obj: L, x0: x, a0: L.t0, b0: L.t1 }; e.preventDefault(); return;
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
        trimStart(d.obj, Math.max(0, this.tOf(x)));
        this.host.onChange?.(); this.draw();
      } else if (d.mode === 'lb') {
        trimEnd(d.obj, this.tOf(x));
        this.host.onChange?.(); this.draw();
      } else if (d.mode === 'move') {
        d.moved = Math.max(d.moved || 0, Math.abs(x - d.x0));
        const dt = (x - d.x0) / this.pps;
        const len = d.b0 - d.a0;
        d.obj.t0 = Math.max(0, +(d.a0 + dt).toFixed(2));
        d.obj.t1 = +(d.obj.t0 + len).toFixed(2);
        this.host.onChange?.(); this.draw();
      } else {
        const o = d.obj; if (!o) return;
        const t = Math.max(0, this.tOf(x));
        const ka = d.k ? 't0' : 0, kb = d.k ? 't1' : 1;
        if (d.mode === 'a') {
          const lim = (d.k ? o[kb] : o[1]) - 0.4;
          if (d.k) o.t0 = +Math.min(t, lim).toFixed(2); else o[0] = Math.min(t, lim);
        } else {
          const lim = (d.k ? o[ka] : o[0]) + 0.4;
          if (d.k) o.t1 = +Math.max(t, lim).toFixed(2); else o[1] = Math.max(t, lim);
        }
        this.host.onChange?.(); this.draw();
      }
      e.preventDefault();
    });

    const up = e => {
      const d = this._drag;
      this._drag = null;
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

  /** ضربه روی ردیف لایه‌ها: لایهٔ همان باریکه، وگرنه بالاترین لایهٔ آن لحظه */
  _tapAt(x, y) {
    const R = this.rows();
    const t = this.tOf(x);
    const list = this.host.getLayers?.() || [];
    const lane = Math.floor(((y - R.mot[0]) / MOT_H) * LANES);
    let hit = null;
    for (let i = list.length - 1; i >= 0; i--) {
      const L = list[i];
      if (t < L.t0 || t > L.t1) continue;
      if (i % LANES === lane) { hit = L; break; }
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
    this._sections(ctx, W, R.sec[0]);
    this._lyrics(ctx, W, R.lyr[0], song);
    this._texts(ctx, W, R.txt[0]);
    this._layers(ctx, W, R.mot[0]);
    this._wave(ctx, W, R.wav[0], song, dur);

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
    list.forEach((L, i) => {
      if (L === sel) return;
      const xa = this.xOf(L.t0), xb = this.xOf(L.t1);
      if (xb < -10 || xa > W + 10) return;
      const ly = y + (i % LANES) * laneH + 1;
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

