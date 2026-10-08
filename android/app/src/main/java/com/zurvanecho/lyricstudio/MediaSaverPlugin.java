package com.zurvanecho.lyricstudio;

import android.content.ContentResolver;
import android.content.ContentValues;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;

import androidx.annotation.RequiresApi;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;

/**
 * نوشتن فایل در پوشهٔ عمومی Downloads.
 *
 * چرا افزونهٔ آمادهٔ Filesystem کافی نیست: از اندروید ۱۰ به بعد
 * (Scoped Storage) اپ‌ها دیگر نمی‌توانند مستقیم در پوشه‌های عمومی
 * بنویسند. تنها راه رسمی، ثبت فایل از طریق MediaStore است.
 *
 * روش کار: فایل اول با Filesystem در حافظهٔ خصوصی اپ نوشته می‌شود
 * (که همیشه مجاز است)، بعد اینجا جریانی به MediaStore کپی و فایل
 * موقت پاک می‌شود. این‌طور هیچ‌وقت کل فایل در حافظهٔ رم نیست.
 */
@CapacitorPlugin(name = "MediaSaver")
public class MediaSaverPlugin extends Plugin {

    @PluginMethod
    public void saveToDownloads(PluginCall call) {
        String sourcePath = call.getString("sourcePath");
        String filename = call.getString("filename", "video.mp4");
        String mime = call.getString("mimeType", "video/mp4");

        if (sourcePath == null) {
            call.reject("sourcePath لازم است");
            return;
        }

        try {
            File src = resolve(sourcePath);
            if (!src.exists()) {
                call.reject("فایل مبدأ پیدا نشد: " + src.getAbsolutePath());
                return;
            }

            String uri = (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q)
                    ? saveViaMediaStore(src, filename, mime)
                    : saveLegacy(src, filename);

            //noinspection ResultOfMethodCallIgnored
            src.delete();

            JSObject ret = new JSObject();
            ret.put("uri", uri);
            ret.put("path", "Download/" + filename);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("ذخیره ناموفق بود: " + e.getMessage(), e);
        }
    }

    /** آیا این دستگاه از MediaStore استفاده می‌کند؟ (فقط برای نمایش) */
    @PluginMethod
    public void info(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("sdk", Build.VERSION.SDK_INT);
        ret.put("scopedStorage", Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q);
        call.resolve(ret);
    }

    private File resolve(String p) {
        Uri u = Uri.parse(p);
        String path = u.getPath();
        if ("file".equals(u.getScheme()) && path != null) return new File(path);
        return new File(p);
    }

    @RequiresApi(api = Build.VERSION_CODES.Q)
    private String saveViaMediaStore(File src, String filename, String mime) throws Exception {
        ContentResolver cr = getContext().getContentResolver();

        ContentValues v = new ContentValues();
        v.put(MediaStore.Downloads.DISPLAY_NAME, filename);
        v.put(MediaStore.Downloads.MIME_TYPE, mime);
        // تا پایان نوشتن، فایل برای بقیهٔ اپ‌ها نامرئی می‌ماند
        v.put(MediaStore.Downloads.IS_PENDING, 1);

        Uri item = cr.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, v);
        if (item == null) throw new Exception("ساخت رکورد در Downloads ناموفق بود");

        try (InputStream in = new FileInputStream(src);
             OutputStream out = cr.openOutputStream(item)) {
            if (out == null) throw new Exception("باز کردن مقصد برای نوشتن ناموفق بود");
            copy(in, out);
        }

        v.clear();
        v.put(MediaStore.Downloads.IS_PENDING, 0);
        cr.update(item, v, null, null);
        return item.toString();
    }

    /** اندروید ۹ و پایین‌تر: نوشتن مستقیم در پوشهٔ Downloads */
    private String saveLegacy(File src, String filename) throws Exception {
        File dir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS);
        if (!dir.exists() && !dir.mkdirs()) throw new Exception("ساخت پوشهٔ Downloads ناموفق بود");
        File dst = new File(dir, filename);
        try (InputStream in = new FileInputStream(src);
             OutputStream out = new FileOutputStream(dst)) {
            copy(in, out);
        }
        return Uri.fromFile(dst).toString();
    }

    private void copy(InputStream in, OutputStream out) throws Exception {
        byte[] buf = new byte[1 << 16];
        int n;
        while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
        out.flush();
    }
}
