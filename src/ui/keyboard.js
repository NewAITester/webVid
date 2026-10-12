/**
 * صفحه‌کلید گوشی
 * ─────────────────────────────────────────────────────────────
 * وقتی صفحه‌کلید بالا می‌آید، مرورگر (یا WebView) فقط «بخش دیدنی» را کوچک می‌کند
 * و چیدمان زیرش می‌ماند؛ صحنه بالا می‌رود و دیگر معلوم نیست چه چیزی عوض می‌شود.
 * این‌جا اندازهٔ بخش دیدنی (visualViewport) خوانده می‌شود و تا وقتی صفحه‌کلید باز است
 * کلاس kb روی body می‌نشیند: برنامه دقیقاً در همان بخش دیدنی جا می‌گیرد،
 * صحنه بالا (کوچک ولی دیدنی) و پنل ویرایش پایینش؛ نوارهای اضافه پنهان می‌شوند.
 */
const EDIT = 'input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=color]):not([type=file]):not([type=button]), textarea, select, [contenteditable=""], [contenteditable=true]';

export function watchKeyboard({ onChange } = {}) {
  const vv = window.visualViewport;
  if (!vv) return;
  const root = document.documentElement;
  let full = 0, lastW = 0, on = false, raf = 0;
  const editing = () => { const a = document.activeElement; return !!(a && a.matches?.(EDIT) && !a.readOnly && !a.disabled); };
  function update() {
    raf = 0;
    const w = Math.round(window.innerWidth), h = vv.height;
    if (w !== lastW) { lastW = w; full = 0; }                 // چرخش ← از نو
    full = Math.max(full, h, on ? 0 : window.innerHeight);
    const kb = editing() && h < full * 0.8;
    root.style.setProperty('--vvh', Math.round(h) + 'px');
    root.style.setProperty('--vvt', Math.round(vv.offsetTop) + 'px');
    if (kb !== on) {
      on = kb;
      document.body.classList.toggle('kb', kb);
      if (kb) window.scrollTo(0, 0);
      onChange?.(kb);
      if (kb) setTimeout(() => { const a = document.activeElement; if (editing()) a.scrollIntoView({ block: 'center', inline: 'nearest' }); }, 120);
    }
  }
  const later = () => { if (!raf) raf = requestAnimationFrame(update); };
  vv.addEventListener('resize', later);
  vv.addEventListener('scroll', later);
  window.addEventListener('resize', later);
  document.addEventListener('focusin', () => setTimeout(later, 60));
  document.addEventListener('focusout', () => setTimeout(later, 60));
  update();
}
