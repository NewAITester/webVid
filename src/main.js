/** بوت اپ: کتابخانه → ویرایشگر. */
import { Store } from './core/store.js';
import { wireHome } from './ui/home.js';
import { Editor } from './ui/editor.js';
import { estimateSize, exportVideo, exportPlan, exportSupport } from './export/exporter.js';
import { CONTAINERS, VCODECS, ACODECS, PRESETS_X264, RECIPES, defaultOptions, buildArgs, commandText, isAudioOnly, isImageOut } from './export/ffargs.js';
import { runFFmpeg, probeDuration, ffmpegSupported } from './export/ffmpeg.js';

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
  wireFFmpegPane();
}

/** پنل تبدیل FFmpeg — فاز R8. ورودی: آخرین خروجی یا فایل انتخاب‌شده. */
function wireFFmpegPane() {
  const st = { o: defaultOptions(), src: 'last', file: null, duration: 0, abort: null };
  const fill = (sel, opts, val) => {
    const s = $(sel); s.innerHTML = '';
    for (const [v, label] of opts) {
      const o = document.createElement('option'); o.value = v; o.textContent = label; s.appendChild(o);
    }
    s.value = val;
  };
  const input = () => {
    if (st.src === 'file') return st.file ? { blob: st.file, name: st.file.name } : null;
    return lastExport;
  };
  const refresh = () => {
    const o = st.o, c = o.container;
    fill('#ffContainer', CONTAINERS, c);
    const vc = VCODECS[c] || [];
    $('#ffVcodecCell').style.display = vc.length ? '' : 'none';
    fill('#ffVcodec', vc, o.vcodec);
    const ac = ACODECS[c] || [];
    $('#ffAcodecCell').style.display = ac.length ? '' : 'none';
    fill('#ffAcodec', ac, o.acodec);
    fill('#ffPreset', PRESETS_X264.map(p => [p, p]), o.preset);
    $('#ffCrf').value = o.crf; $('#ffCrfV').textContent = o.crf;
    $('#ffHeight').value = String(o.height); $('#ffFps').value = String(o.fps);
    $('#ffAbitrate').value = String(o.abitrate);
    $('#ffGifWidth').value = o.gifWidth; $('#ffGifFps').value = o.gifFps; $('#ffSnapAt').value = o.snapAt;
    $('#ffGifRow').style.display = c === 'gif' ? '' : 'none';
    $('#ffSnapRow').style.display = c === 'png' ? '' : 'none';
    const inp = input();
    const ext = (inp?.name.match(/\.([a-z0-9]+)$/i)?.[1] || 'mp4').toLowerCase();
    const inName = `in.${ext}`;
    const b = buildArgs(o, inName, st.duration);
    $('#ffCmd').value = commandText(b.args);
    $('#ffInputInfo').textContent = inp
      ? `${inp.name.slice(0, 26)} · ${(inp.blob.size / 1048576).toFixed(1)} مگ` + (st.duration ? ` · ${st.duration.toFixed(1)} ث` : '')
      : 'ورودی ندارد — اول خروجی بگیرید یا فایل انتخاب کنید';
    $('#ffSrcLast').classList.toggle('on', st.src === 'last');
    $('#ffSrcFile').classList.toggle('on', st.src === 'file');
  };
  const read = () => {
    const o = st.o;
    o.container = $('#ffContainer').value;
    o.vcodec = $('#ffVcodec').value || o.vcodec;
    o.acodec = $('#ffAcodec').value || o.acodec;
    o.crf = parseInt($('#ffCrf').value, 10);
    o.preset = $('#ffPreset').value;
    o.height = parseInt($('#ffHeight').value, 10);
    o.fps = parseInt($('#ffFps').value, 10);
    o.abitrate = parseInt($('#ffAbitrate').value, 10);
    o.gifWidth = parseInt($('#ffGifWidth').value, 10) || 480;
    o.gifFps = parseInt($('#ffGifFps').value, 10) || 15;
    o.snapAt = parseFloat($('#ffSnapAt').value) || 1;
    // کدک پیش‌فرض هر قالب، وقتی قالب عوض شد
    if (o.container === 'webm') { o.vcodec = 'libvpx-vp9'; o.acodec = 'libopus'; }
    if (o.container === 'mp4') { if (!VCODECS.mp4.some(([v]) => v === o.vcodec)) o.vcodec = 'libx264'; if (!ACODECS.mp4.some(([v]) => v === o.acodec)) o.acodec = 'aac'; }
  };
  const recRow = $('#ffRecipes');
  recRow.innerHTML = '';
  for (const r of RECIPES) {
    const b = document.createElement('button');
    b.className = 'chip'; b.textContent = r.label;
    b.onclick = () => { st.o = { ...defaultOptions(), ...r.o }; refresh(); };
    recRow.appendChild(b);
  }
  if (!ffmpegSupported()) {
    $('#ffMsg').textContent = 'این دستگاه WebAssembly ندارد؛ FFmpeg اجرا نمی‌شود.';
    $('#ffGo').disabled = true;
  }
  ['#ffContainer', '#ffVcodec', '#ffAcodec', '#ffPreset', '#ffHeight', '#ffFps', '#ffAbitrate', '#ffGifWidth', '#ffGifFps', '#ffSnapAt'].forEach(s => { $(s).onchange = () => { read(); refresh(); }; });
  $('#ffCrf').oninput = () => { read(); refresh(); };
  $('#ffSrcLast').onclick = async () => { st.src = 'last'; st.duration = lastExport ? await probeDuration(lastExport.blob) : 0; refresh(); };
  const fileIn = document.createElement('input');
  fileIn.type = 'file'; fileIn.accept = 'video/*,audio/*,image/gif';
  fileIn.onchange = async () => {
    st.file = fileIn.files?.[0] || null;
    st.src = 'file';
    st.duration = st.file ? await probeDuration(st.file) : 0;
    refresh();
  };
  $('#ffSrcFile').onclick = () => { fileIn.value = ''; fileIn.click(); };
  $('#ffGo').onclick = async () => {
    const inp = input();
    if (!inp) { $('#ffMsg').textContent = 'ورودی ندارد — اول خروجی بگیرید یا فایل انتخاب کنید.'; return; }
    const ext = (inp.name.match(/\.([a-z0-9]+)$/i)?.[1] || 'mp4').toLowerCase();
    const inName = `in.${ext}`;
    const { args, outName, mime } = buildArgs(st.o, inName, st.duration);
    const go = $('#ffGo'), cancel = $('#ffCancel');
    go.disabled = true; cancel.classList.remove('hidden');
    $('#ffDownload').classList.add('hidden');
    $('#ffBar').classList.remove('hidden');
    $('#ffLog').textContent = '';
    $('#ffMsg').textContent = 'در حال بار کردن FFmpeg…';
    st.abort = new AbortController();
    try {
      const blob = await runFFmpeg({
        input: inp.blob, inName, args, outName, mime,
        signal: st.abort.signal,
        onProgress: p => { $('#ffBar i').style.width = `${Math.round(p * 100)}%`; },
        onLog: line => {
          $('#ffMsg').textContent = line;
          const log = $('#ffLog');
          log.textContent += line + '\n';
          if (log.textContent.length > 20000) log.textContent = log.textContent.slice(-20000);
        },
      });
      const url = URL.createObjectURL(blob);
      const dl = $('#ffDownload');
      dl.href = url; dl.download = outName;
      dl.classList.remove('hidden');
      $('#ffMsg').textContent = `آماده شد: ${(blob.size / 1048576).toFixed(1)} مگابایت (${outName})`;
      window.__ffResult = { size: blob.size, outName };
    } catch (e) {
      $('#ffMsg').textContent = e.message === 'لغو شد' ? 'لغو شد.' : 'خطا: ' + e.message;
      window.__ffError = e.message;
    } finally {
      go.disabled = false;
      cancel.classList.add('hidden');
      st.abort = null;
    }
  };
  $('#ffCancel').onclick = () => st.abort?.abort();
  refresh();
}

wireHome(store, openEditor);
$('#app').dataset.screen = 'library';
