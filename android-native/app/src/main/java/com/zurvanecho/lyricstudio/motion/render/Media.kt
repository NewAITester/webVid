package com.zurvanecho.lyricstudio.motion.render

import android.content.Context
import android.graphics.BitmapFactory
import android.media.MediaMetadataRetriever
import android.net.Uri
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import kotlin.math.roundToLong

/**
 * بارگذاری رسانه برای پیش‌نمایش: تصویر از فایل/URI و فریم ویدیو در زمان t.
 * بدون وابستگی خارجی (بدون Coil)؛ کش ساده با سقف، تا پیش‌نمایش روان بماند.
 */
class MediaResolver(private val context: Context) {
    private val imageCache = object : LinkedHashMap<String, ImageBitmap>(16, 0.75f, true) {
        override fun removeEldestEntry(eldest: Map.Entry<String, ImageBitmap>): Boolean = size > 32
    }
    private val frameCache = object : LinkedHashMap<String, ImageBitmap>(16, 0.75f, true) {
        override fun removeEldestEntry(eldest: Map.Entry<String, ImageBitmap>): Boolean = size > 32
    }

    /** تصویر لایه (src = مسیر فایل یا content:// URI) یا null. */
    fun image(src: String?): ImageBitmap? {
        if (src.isNullOrEmpty()) return null
        imageCache[src]?.let { return it }
        return try {
            val bmp = if (src.startsWith("content://") || src.startsWith("file://")) {
                context.contentResolver.openInputStream(Uri.parse(src))?.use { BitmapFactory.decodeStream(it) }
            } else {
                BitmapFactory.decodeFile(src)
            } ?: return null
            val img = bmp.asImageBitmap()
            imageCache[src] = img
            img
        } catch (_: Exception) {
            null
        }
    }

    /** فریم ویدیو در زمان t (ثانیه، نسبت به شروع لایه) — با باکت ۱/۳۰ ثانیه کش می‌شود. */
    fun videoFrame(src: String?, tSec: Double): ImageBitmap? {
        if (src.isNullOrEmpty()) return null
        val bucket = (tSec * 30.0).roundToLong()
        val key = "$src@$bucket"
        frameCache[key]?.let { return it }
        return try {
            val r = MediaMetadataRetriever()
            try {
                if (src.startsWith("content://") || src.startsWith("file://")) {
                    r.setDataSource(context, Uri.parse(src))
                } else {
                    r.setDataSource(src)
                }
                val bmp = r.getFrameAtTime((tSec * 1_000_000).roundToLong(), MediaMetadataRetriever.OPTION_CLOSEST)
                    ?: return null
                val img = bmp.asImageBitmap()
                frameCache[key] = img
                img
            } finally {
                r.release()
            }
        } catch (_: Exception) {
            null
        }
    }

    fun clear() {
        imageCache.clear()
        frameCache.clear()
    }
}
