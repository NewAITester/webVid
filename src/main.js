/** بوت اپ: کتابخانه → ویرایشگر. */
import { Store } from './core/store.js';
import { wireHome } from './ui/home.js';
import { Editor } from './ui/editor.js';
import { estimateSize, exportVideo, exportPlan, exportSupport } from './export/exporter.js';

const $ = s => document.querySelector(s);
const store = new Store();
store.ensureDemo();

let editor = null;
let lastExport = null; // {blob, name}
let exportCtl = null;

function openEditor(id) {
  store.openProject(id);
  if (!editor) editor = new Editor(store, () => { $('#app').dataset.screen = 'library'; });
  editor.open();
  wireExportPane();
}

function resSize() {
  const p = store.project;
  const h = parseInt($('#exRes').value, 10) || 720;
  const w = Math.round(h * p.width / p.height);
  return { width: w, height: h };
}

function wireExportPane() {
  const p = store.project; if (!p) return;
  $('#exFrom').value = 0; $('#exTo').value = Math.ceil(p.duration);
  const updateEst = () => {
    try {
      const { width, height } = resSize();
      const plan = exportPlan(p, {
        from: parseFloat($('#exFrom').value) || 0,
        to: parseFloat($('#exTo').value) || p.duration,
        fps: parseInt($('#exFps').value, 10) || 30,
        width, height,
        bitrateMbps: parseInt($('#exBr').value, 10) || 12,
      });
      $('#exEst').textContent = `برآورد: ${plan.frames} فریم، حدود ${plan.estMB} مگابایت (${plan.width}×${plan.height}، ${plan.fps} فریم/ثانیه)`;
    } catch (e) { $('#exEst').textContent = e.message; }
  };
  ['#exFrom', '#exTo', '#exRes', '#exFps', '#exBr'].forEach(s => { $(s).onchange = updateEst; });
  updateEst();
  const sup = exportSupport();
  if (!sup.webcodecs) {
    $('#exMsg').textContent = 'این مرورگر از WebCodecs پشتیبانی نمی‌کند — خروجی MP4 در دسترس نیست.';
    $('#exGo').disabled = true;
  }
  $('#exGo').onclick = async () => {
    const btn = $('#exGo');
    btn.disabled = true;
    $('#exCancel').classList.remove('hidden');
    $('#exDoneRow').classList.add('hidden');
    $('#exBar').classList.remove('hidden');
    $('#exMsg').textContent = 'در حال آماده‌سازی…';
    window.__exportResult = null; window.__exportError = null;
    exportCtl = new AbortController();
    const phaseFa = { audio: 'میکس صدا', video: 'رندر فریم‌ها', mux: 'ساخت فایل' };
    try {
      const { width, height } = resSize();
      const res = await exportVideo(p, {
        from: parseFloat($('#exFrom').value) || 0,
        to: parseFloat($('#exTo').value) || p.duration,
        fps: parseInt($('#exFps').value, 10) || 30,
        width, height,
        bitrateMbps: parseInt($('#exBr').value, 10) || 12,
        signal: exportCtl.signal,
        onProgress: ({ done, total, phase }) => {
          const pct = total ? Math.round((done / total) * 100) : 0;
          $('#exBar i').style.width = `${phase === 'video' ? pct : phase === 'mux' ? 100 : pct}%`;
          $('#exMsg').textContent = `${phaseFa[phase] || phase}… ${phase === 'video' ? `${done}/${total} فریم` : ''}`;
        },
      }, { renderTo: (c, t) => editor.renderTo(c, t) });
      lastExport = { blob: res.blob, name: `${p.name || 'video'}.mp4` };
      const url = URL.createObjectURL(res.blob);
      const dl = $('#exDownload');
      dl.href = url; dl.download = lastExport.name;
      $('#exDoneRow').classList.remove('hidden');
      $('#exMsg').textContent = `آماده شد: ${res.frames} فریم، ${(res.size / 1048576).toFixed(1)} مگابایت، ${res.codec}`;
      window.__exportResult = { size: res.size, frames: res.frames, codec: res.codec };
    } catch (e) {
      $('#exMsg').textContent = e.name === 'AbortError' ? 'لغو شد.' : 'خطا: ' + e.message;
      window.__exportError = e.message;
    } finally {
      btn.disabled = false;
      $('#exCancel').classList.add('hidden');
      exportCtl = null;
    }
  };
  $('#exCancel').onclick = () => exportCtl?.abort();
  $('#exShare').onclick = async () => {
    if (!lastExport) return;
    const file = new File([lastExport.blob], lastExport.name, { type: 'video/mp4' });
    if (navigator.canShare?.({ files: [file] })) {
      try { await navigator.share({ files: [file] }); return; } catch { /* کاربر لغو کرد */ }
    }
    $('#exDownload').click();
  };
  $('#exSnap').onclick = () => {
    const a = document.createElement('a');
    a.download = 'frame.png';
    a.href = $('#stage').toDataURL('image/png');
    a.click();
  };
}

wireHome(store, openEditor);
$('#app').dataset.screen = 'library';
