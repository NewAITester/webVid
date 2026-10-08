/**
 * خوانندهٔ LRC با تایمینگ کلمه‌به‌کلمه
 *
 * فرمت ورودی:
 *   [00:10.08]<00:10.08>تاریکی <00:12.56>می‌خزه <00:13.48>تو
 *
 * زمان خط در [] است و زمان هر کلمه در <>.
 */

const RE_LINE = /^\[(\d+):(\d+(?:\.\d+)?)\]/;
const RE_WORD = /<(\d+):(\d+(?:\.\d+)?)>([^<]*)/g;

/** حذف اعراب عربی — شِکَنَم → شکنم */
export function stripDiacritics(s) {
  return s.replace(/[\u064B-\u0652\u0670\u0640]/g, '');
}

export function parseLRC(text, { strip = true } = {}) {
  const lines = [];
  for (const raw of text.split(/\r?\n/)) {
    const m = raw.match(RE_LINE);
    if (!m) continue;
    const lineStart = +m[1] * 60 + parseFloat(m[2]);
    const rest = raw.slice(m[0].length);

    const words = [];
    let wm;
    RE_WORD.lastIndex = 0;
    while ((wm = RE_WORD.exec(rest)) !== null) {
      let w = wm[3].trim();
      if (!w) continue;
      if (strip) w = stripDiacritics(w);
      words.push({ t: +wm[1] * 60 + parseFloat(wm[2]), text: w });
    }

    // اگر خط تایمینگ کلمه نداشت، کل متن را یک کلمه حساب کن
    if (!words.length) {
      const plain = strip ? stripDiacritics(rest.trim()) : rest.trim();
      if (plain) words.push({ t: lineStart, text: plain });
    }
    if (words.length) lines.push({ t: lineStart, words });
  }

  lines.sort((a, b) => a.t - b.t);

  // پایان هر کلمه و هر خط را حساب کن
  for (let i = 0; i < lines.length; i++) {
    const L = lines[i];
    const nextLine = lines[i + 1]?.t ?? L.words.at(-1).t + 2.5;
    for (let j = 0; j < L.words.length; j++) {
      const w = L.words[j];
      w.end = L.words[j + 1]?.t ?? Math.min(nextLine, w.t + 2.0);
      w.i = j;
      w.line = i;
      w.id = `l${i}w${j}`;          // شناسهٔ پایدار — برای override دستی
    }
    L.end = Math.min(nextLine, L.words.at(-1).end + 0.4);
    L.i = i;
    L.text = L.words.map(w => w.text).join(' ');
  }
  return lines;
}

/**
 * خطی که در لحظهٔ t فعال است (با کمی حاشیه برای ورود/خروج)
 *
 * دقت: نباید «اولین خط منطبق» را برگرداند. وقتی حاشیه بزرگ باشد،
 * پنجرهٔ خط قبلی روی خط بعدی می‌افتد و خط اشتباه برنده می‌شود.
 * پس اول دنبال خطی می‌گردیم که واقعاً t داخلش است، و اگر نبود،
 * نزدیک‌ترین خط در محدودهٔ حاشیه را برمی‌داریم.
 */
export function lineAt(lines, t, pad = 0.5) {
  let exact = null, near = null, nearD = Infinity;
  for (const L of lines) {
    if (t >= L.t && t <= L.end) exact = L;            // آخرین منطبق واقعی
    if (t >= L.t - pad && t <= L.end + pad) {
      const d = t < L.t ? L.t - t : t > L.end ? t - L.end : 0;
      if (d < nearD) { nearD = d; near = L; }
    }
  }
  return exact || near;
}

/** همهٔ خطوط فعال در لحظهٔ t */
export function linesAt(lines, t, pad = 0.5) {
  return lines.filter(L => t >= L.t - pad && t <= L.end + pad);
}

/** ایندکس کلمه‌ای که همین حالا خوانده می‌شود (-1 اگر هیچ‌کدام) */
export function activeWord(line, t) {
  if (!line) return -1;
  for (let i = line.words.length - 1; i >= 0; i--) {
    if (t >= line.words[i].t) return i;
  }
  return -1;
}
