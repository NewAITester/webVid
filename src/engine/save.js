/**
 * ذخیرهٔ فایل خروجی
 *
 * مرورگر و اپ نیتیو دو مسیر کاملاً متفاوت دارند:
 *
 *   مرورگر → یک لینک <a download> می‌سازیم، مرورگر در Downloads
 *            می‌گذاردش.
 *
 *   APK    → این روش کار نمی‌کند. WebView اندروید DownloadListener
 *            ندارد، پس کلیک روی لینک blob بی‌صدا نادیده گرفته
 *            می‌شود — فایل جایی ذخیره نمی‌شود و هیچ خطایی هم
 *            نمی‌دهد. باید با افزونهٔ Filesystem مستقیم روی دیسک
 *            نوشت.
 *
 * نکتهٔ حافظه: Filesystem فقط base64 می‌گیرد. تبدیل یکجای یک فایل
 * ۳۰۰ مگابایتی به base64 رشته‌ای ۴۰۰ مگابایتی می‌سازد و اپ را
 * می‌کشد. پس تکه‌تکه می‌نویسیم.
 */

const CHUNK = 3 * 1024 * 1024;   // ۳ مگابایت در هر نوبت

function isNative() {
  return !!(window.Capacitor?.isNativePlatform?.());
}

/** تبدیل یک برش از ArrayBuffer به base64 بدون ساختن رشتهٔ غول‌پیکر */
function toB64(u8) {
  let s = '';
  const STEP = 0x8000;
  for (let i = 0; i < u8.length; i += STEP) {
    s += String.fromCharCode.apply(null, u8.subarray(i, i + STEP));
  }
  return btoa(s);
}

/**
 * @returns {Promise<{where:string, path?:string, canShare?:boolean}>}
 */
export async function saveFile(blob, filename, onProgress = () => {}) {
  if (!isNative()) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    return { where: 'browser' };
  }

  const { Filesystem, Directory } = await import('@capacitor/filesystem');
  const buf = new Uint8Array(await blob.arrayBuffer());

  // اول فایل را خالی بساز، بعد تکه‌تکه اضافه کن
  await Filesystem.writeFile({
    path: filename,
    data: '',
    directory: Directory.Documents,
    recursive: true,
  });

  for (let off = 0; off < buf.length; off += CHUNK) {
    await Filesystem.appendFile({
      path: filename,
      data: toB64(buf.subarray(off, Math.min(off + CHUNK, buf.length))),
      directory: Directory.Documents,
    });
    onProgress(Math.min(1, (off + CHUNK) / buf.length));
  }

  const { uri } = await Filesystem.getUri({
    path: filename,
    directory: Directory.Documents,
  });
  return { where: 'native', path: uri, canShare: true };
}

/** باز کردن منوی اشتراک‌گذاری اندروید برای فایل ذخیره‌شده */
export async function shareFile(uri, title = 'ویدیوی نقاب') {
  try {
    const { Share } = await import('@capacitor/share');
    await Share.share({ title, url: uri, dialogTitle: 'اشتراک‌گذاری ویدیو' });
    return true;
  } catch {
    return false;
  }
}

/** متن خوانا برای نشان دادن محل ذخیره */
export function prettyPath(uri) {
  if (!uri) return '';
  const m = uri.replace(/^file:\/\//, '');
  const i = m.indexOf('/Documents/');
  return i >= 0 ? 'Documents/' + m.slice(i + 11) : m;
}
