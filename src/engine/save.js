/**
 * ذخیرهٔ فایل خروجی
 *
 * سه محیط، سه رفتار متفاوت:
 *
 *   مرورگر        → لینک <a download>، می‌رود در Downloads.
 *
 *   APK قدیمی‌تر  → همان لینک کار نمی‌کند: WebView اندروید
 *                   DownloadListener ندارد و کلیک روی blob بی‌صدا
 *                   نادیده گرفته می‌شود.
 *
 *   APK           → از اندروید ۱۰ (Scoped Storage) نوشتن مستقیم در
 *                   پوشه‌های عمومی ممنوع شد. تنها راه رسمی ثبت فایل
 *                   از طریق MediaStore است، که افزونهٔ آمادهٔ
 *                   Filesystem ندارد — برای همین افزونهٔ نیتیو
 *                   MediaSaver را نوشتیم.
 *
 * مسیر نهایی در اپ:
 *   ۱) فایل تکه‌تکه در حافظهٔ موقت خصوصی اپ نوشته می‌شود (همیشه مجاز)
 *   ۲) افزونهٔ نیتیو آن را جریانی به Downloads کپی می‌کند
 *   ۳) فایل موقت پاک می‌شود
 *
 * این‌طور نه مجوزی لازم است، نه کل فایل در حافظهٔ رم تکرار می‌شود.
 */

const CHUNK = 3 * 1024 * 1024;   // ۳ مگابایت در هر نوبت نوشتن

function isNative() {
  return !!(window.Capacitor?.isNativePlatform?.());
}

/** تبدیل یک برش کوچک به base64 بدون ساختن رشتهٔ غول‌پیکر */
function toB64(u8) {
  let s = '';
  const STEP = 0x8000;
  for (let i = 0; i < u8.length; i += STEP) {
    s += String.fromCharCode.apply(null, u8.subarray(i, i + STEP));
  }
  return btoa(s);
}

/* نوع فایل برای MediaStore: قبلاً همه‌چیز video/mp4 ثبت می‌شد و اندروید
   مثلاً «x-music.wav» را «x-music.wav.mp4» می‌کرد — یک «ویدیوی فقط صدا». */
const MIMES = { mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', mkv: 'video/x-matroska', gif: 'image/gif', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp',
  wav: 'audio/wav', mp3: 'audio/mpeg', m4a: 'audio/mp4', ogg: 'audio/ogg', json: 'application/json', js: 'text/javascript', md: 'text/markdown', txt: 'text/plain', py: 'text/x-python', html: 'text/html' };
function mimeOf(blob, filename) {
  const ext = String(filename).toLowerCase().match(/\.([a-z0-9]+)$/)?.[1];
  return MIMES[ext] || (blob?.type && blob.type.split(';')[0]) || 'application/octet-stream';
}

function browserSave(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return { where: 'browser', path: 'Downloads/' + filename };
}

/**
 * @returns {Promise<{where:string, path:string, uri?:string, canShare?:boolean}>}
 */
export async function saveFile(blob, filename, onProgress = () => {}, options = {}) {
  if (!isNative()) {
    options.log?.detail('storagePath', 'browser-download');
    if(options.optimized)options.log?.warn('optimized-native-storage-unavailable-in-browser');
    return browserSave(blob, filename);
  }
  const { Filesystem, Directory } = await import('@capacitor/filesystem');
  const { registerPlugin } = await import('@capacitor/core');
  const MediaSaver = registerPlugin('MediaSaver');
  return saveNativeBlob(blob, filename, onProgress, { ...options, Filesystem, Directory, MediaSaver });
}

/** Injectable native boundary lets CI verify both paths byte-for-byte. */
export async function saveNativeBlob(blob, filename, onProgress, { Filesystem, Directory, MediaSaver, optimized = false, log = null, signal = null }) {
  const tmp = 'export_tmp_' + filename;
  const chunk = optimized ? 1024 * 1024 : CHUNK;
  const check = () => { if(signal?.aborted)throw new DOMException('لغو شد','AbortError'); };
  const measure = (key, fn) => log ? log.measure(key,fn) : fn();
  log?.detail('storagePath', optimized ? 'native-blob-slices-1MiB' : 'native-whole-buffer-3MiB');
  log?.detail('saveChunkBytes',chunk);
  log?.detail('saveInputBytes',blob.size);
  let created = false;
  try {
    check();
    // Legacy path retained; optimized path NEVER materializes the entire Blob again.
    const buf = optimized ? null : new Uint8Array(await measure('saveRead',()=>blob.arrayBuffer()));
    await measure('saveWrite',()=>Filesystem.writeFile({path:tmp,data:'',directory:Directory.Cache,recursive:true})); created=true;
    for(let off=0;off<blob.size;off+=chunk) {
      check();
      const bytes=optimized ? new Uint8Array(await measure('saveRead',()=>blob.slice(off,off+chunk).arrayBuffer())) : buf.subarray(off,Math.min(off+chunk,buf.length));
      const t=performance.now(),data=toB64(bytes);log?.add('saveBase64',performance.now()-t);
      await measure('saveWrite',()=>Filesystem.appendFile({path:tmp,data,directory:Directory.Cache}));
      log?.count('saveChunks'); log?.count('saveBase64Characters',data.length);
      onProgress(Math.min(1,(off+chunk)/blob.size));
    }
    check();
    const {uri:srcUri}=await Filesystem.getUri({path:tmp,directory:Directory.Cache});
    try {
      const res=await measure('savePublish',()=>MediaSaver.saveToDownloads({sourcePath:srcUri,filename,mimeType:mimeOf(blob,filename)}));
      if(signal?.aborted)log?.warn('cancel-requested-after-publication');
      return {where:'downloads',path:res.path,uri:res.uri,canShare:true};
    } catch(e) {
      log?.warn('downloads-publish-failed-cache-preserved');
      return {where:'cache',path:'حافظهٔ موقت اپ',uri:srcUri,canShare:true,warn:e?.message||String(e)};
    }
  } catch(e) {
    if(created)try{await Filesystem.deleteFile({path:tmp,directory:Directory.Cache});}catch{/* cleanup best effort */}
    throw e;
  }
}

/** باز کردن منوی اشتراک‌گذاری اندروید */
export async function shareFile(uri, title = 'ویدیوی نقاب') {
  try {
    const { Share } = await import('@capacitor/share');
    await Share.share({ title, url: uri, dialogTitle: 'اشتراک‌گذاری ویدیو' });
    return true;
  } catch (e) {
    console.warn('اشتراک‌گذاری ناموفق:', e);
    return false;
  }
}
