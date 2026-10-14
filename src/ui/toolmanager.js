import { getManifest, missingFiles, downloadTools, cancelDownload, downloadActive, setupTools } from '../tools/manager.js';
let sheet = null, lastStatus = null;
const bytes = n => `${(n / 1048576).toLocaleString('fa-IR', { maximumFractionDigits:2 })} مگابایت`;
function el(tag, text, cls) {
  const node = document.createElement(tag);
  if (text) node.textContent = text;
  if (cls) node.className = cls;
  return node;
}
export function mountToolManager() {
  for (const header of document.querySelectorAll('[data-screen="library"] .top, [data-screen="editor"] .top')) {
    const button = el('button', '↓ ابزارها', 'btn sm ghost');
    button.title = 'مدیریت دانلود اختیاری پایتون، کتابخانه‌ها و FFmpeg';
    button.onclick = () => openToolManager();
    header.append(button);
  }
  window.addEventListener('wv-tools-status', e => { lastStatus = e.detail; });
  window.addEventListener('wv-tools-needed', e => { if (!sheet) openToolManager(e.detail.ids); });
}
export async function openToolManager(preselect = []) {
  if (sheet) return;
  const overlay = el('div', '', 'sheet'), box = el('div', '', 'sheetbox');
  sheet = overlay;
  const head = el('div', 'مدیریت ابزارها — دانلود اختیاری', 'shead');
  head.append(el('div', '', 'spacer'));
  const close = el('button', '×', 'icon'); head.append(close);
  const body = el('div', '', 'form');
  body.style.maxHeight = '75vh'; body.style.overflowY = 'auto';
  body.append(el('p', 'برنامه بدون دانلود این ابزارها هم باز می‌شود. پایتون واقعی و FFmpeg فقط بعد از انتخاب و تأیید دانلود شما فعال می‌شوند. ابزارهای کامل در آپدیت معمولی حفظ می‌شوند؛ تغییر نسخهٔ ابزار ممکن است فایل‌های تازه لازم داشته باشد.', 'note'));
  body.append(el('p', 'پاک کردن داده‌ها، حذف برنامه یا پاک‌سازی حافظه توسط مرورگر می‌تواند ابزارها را حذف کند. ذخیرهٔ پایدار در صورت پشتیبانی درخواست می‌شود.', 'note'));
  const rows = el('div'), total = el('div', '', 'msg'), status = el('div', 'در حال بررسی ابزارها…', 'msg');
  status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
  const progress = document.createElement('progress'); progress.max = 1; progress.value = 0;
  progress.style.width = '100%';
  const buttons = el('div', '', 'frow btns');
  let storageReady = false;
  const start = el('button', 'دانلود انتخاب‌شده‌ها', 'btn primary'), cancel = el('button', 'لغو دانلود', 'btn sm');
  const retry = el('button', 'تلاش دوباره برای اتصال', 'btn sm ghost');
  retry.hidden = true; retry.classList.add('hidden');
  start.disabled = true; cancel.disabled = !downloadActive();
  cancel.onclick = cancelDownload;
  buttons.append(start, cancel, retry); body.append(rows, total, buttons, progress, status); box.append(head, body); overlay.append(box); document.body.append(overlay);
  const checks = new Map(); let generation = 0;
  const selected = () => [...checks].filter(([,c]) => c.checked).map(([id]) => id);
  async function recalc() {
    const run = ++generation;
    try {
      const missing = await missingFiles(selected());
      if (run !== generation || !overlay.isConnected) return;
      total.textContent = `حجم دانلود جدید با وابستگی‌ها: ${bytes(missing.reduce((s,f) => s + f.bytes,0))}`;
      start.disabled = !storageReady || downloadActive() || !missing.length;
    } catch (e) { status.textContent = e.message; start.disabled = true; }
  }
  function paint(data) {
    if (!data) return;
    const f = data.file;
    if (f) {
      status.textContent = `${f.name} — ${f.path.split('/').pop()}\n${bytes(data.received || 0)} از ${bytes(f.bytes)} — ${data.type === 'verifying' ? 'بررسی سلامت فایل' : data.type === 'installed' || data.type === 'cached' ? 'ذخیره شد' : 'در حال دانلود'}`;
      progress.value = f.bytes ? Math.min(1,(data.received || 0) / f.bytes) : 0;
    } else if (data.type === 'error') status.textContent = data.message;
    else if (data.type === 'done') { status.textContent = '✓ دانلود و بررسی سلامت ابزارهای انتخاب‌شده تمام شد.'; progress.value = 1; }
  }
  const onStatus = e => paint(e.detail);
  const onChanged = async () => {
    cancel.disabled = !downloadActive();
    for (const c of checks.values()) c.disabled = downloadActive();
    await recalc();
    await refreshInstalled();
  };
  async function refreshInstalled() {
    for (const [id,c] of checks) {
      const missing = await missingFiles([id]);
      c.parentNode.querySelector('.tool-installed').textContent = missing.length ? 'نصب نشده / ناقص' : '✓ آمادهٔ استفادهٔ آفلاین';
    }
  }
  function dismiss() {
    overlay.remove(); sheet = null;
    window.removeEventListener('wv-tools-status', onStatus);
    window.removeEventListener('wv-tools-changed', onChanged);
  }
  retry.onclick = () => { const ids = selected(); dismiss(); openToolManager(ids); };
  close.onclick = dismiss; overlay.onclick = e => { if (e.target === overlay) dismiss(); };
  window.addEventListener('wv-tools-status', onStatus);
  window.addEventListener('wv-tools-changed', onChanged);
  try {
    // The metadata is a packaged asset and can be shown even if WebView's
    // separate ServiceWorker request path is unavailable.
    const manifest = await getManifest();
    if (!overlay.isConnected) return;
    for (const [id,e] of Object.entries(manifest.entries).sort(([a],[b]) => (a === 'python' ? -1 : b === 'python' ? 1 : a.localeCompare(b)))) {
      const row = el('label', '', 'frow'); row.style.flexWrap = 'wrap';
      const c = document.createElement('input'); c.type = 'checkbox'; c.checked = preselect.includes(id); c.disabled = downloadActive();
      c.onchange = recalc; checks.set(id,c);
      row.append(c, el('b', `${e.name} · ${e.version || ''}`), el('span', bytes(e.files.reduce((s,f) => s + f.bytes,0)), 'pill'), el('span', '', 'tool-installed note'));
      rows.append(row);
    }
    status.textContent = 'ابزارهای دلخواه را انتخاب کنید؛ حجم مجموع شامل وابستگی‌ها محاسبه می‌شود.';
    paint(lastStatus);
    await refreshInstalled();
    status.textContent = 'در حال اتصال حافظهٔ آفلاین ابزارها…';
    await setupTools();
    if (!overlay.isConnected) return;
    storageReady = true;
    status.textContent = 'ابزارهای دلخواه را انتخاب کنید؛ دانلود فقط پس از تأیید شما آغاز می‌شود.';
    paint(lastStatus);
    await recalc();
    start.onclick = async () => {
      try {
        const ids = selected(), missing = await missingFiles(ids);
        if (!missing.length) return;
        const names = [...new Set(missing.map(f => f.name))].join('، ');
        if (!confirm(`دانلود اختیاری ${names}\nحجم: ${bytes(missing.reduce((s,f) => s + f.bytes,0))}\nشروع شود؟`)) return;
        start.disabled = true; cancel.disabled = false;
        checks.forEach(c => { c.disabled = true; });
        await downloadTools(ids);
      } catch (e) { status.textContent = e.message; }
      finally { await onChanged(); }
    };
  } catch (e) {
    status.textContent = e.message; start.disabled = true; retry.hidden = false; retry.classList.remove('hidden');
  }
}
