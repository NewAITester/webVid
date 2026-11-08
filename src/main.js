/** بوت اپ: کتابخانه → ویرایشگر. */
import { Store } from './core/store.js';
import { wireHome } from './ui/home.js';
import { Editor } from './ui/editor.js';
import { estimateSize, exportVideo } from './export/exporter.js';

const $ = s => document.querySelector(s);
const store = new Store();
store.ensureDemo();

let editor = null;
function openEditor(id) {
  store.openProject(id);
  if (!editor) editor = new Editor(store, () => { $('#app').dataset.screen = 'library'; });
  editor.open();
  wireExportPane();
}

function wireExportPane() {
  const p = store.project; if (!p) return;
  $('#exFrom').value = 0; $('#exTo').value = Math.ceil(p.duration);
  const est = estimateSize(p, { bitrateMbps: 12 });
  $('#exEst').textContent = `برآورد: حدود ${est.estMB} مگابایت برای ${est.seconds} ثانیه`;
  $('#exGo').onclick = async () => {
    $('#exMsg').textContent = 'خروجی ویدیو در فاز R5 می‌آید — فعلاً پیش‌نمایش را ببینید.';
    try { await exportVideo(); } catch (e) { $('#exMsg').textContent = e.message; }
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
