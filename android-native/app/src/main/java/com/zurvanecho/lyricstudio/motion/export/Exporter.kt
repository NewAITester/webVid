package com.zurvanecho.lyricstudio.motion.export

import android.content.Context
import android.graphics.Bitmap
import android.media.MediaCodec
import android.media.MediaCodecInfo
import android.media.MediaExtractor
import android.media.MediaFormat
import android.media.MediaMuxer
import android.net.Uri
import android.os.Build
import androidx.compose.ui.graphics.Canvas
import androidx.compose.ui.graphics.asAndroidBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.drawscope.CanvasDrawScope
import androidx.compose.ui.text.TextMeasurer
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.LayoutDirection
import com.zurvanecho.lyricstudio.motion.model.Project
import com.zurvanecho.lyricstudio.motion.render.MediaResolver
import com.zurvanecho.lyricstudio.motion.render.Renderer.renderFrame
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.isActive
import kotlinx.coroutines.withContext
import java.io.File
import java.nio.ByteBuffer
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

/**
 * خروجی ویدیو — پورت exportVideo از src/export/exporter.js نسخهٔ وب.
 *
 * چون renderFrame(t) تابع خالص زمان است، فریم‌ها پشت سر هم و بدون
 * پخش بی‌درنگ تولید می‌شوند؛ به هر سرعتی که سخت‌افزار بتواند انکود می‌کنیم.
 * تصویر: MediaCodec H.264 با ورودی Surface — صدا: دیکد → میکس → AAC.
 * خروجی: MP4 (MediaMuxer).
 *
 * جریان کار: (۱) انکود ویدیو و بافر کردن نمونه‌ها، (۲) میکس و انکود صدا،
 * (۳) افزودن هر دو ترک به مالتی‌پلکسر و نوشتن نمونه‌ها به‌ترتیب زمان.
 * بافر کردن نمونه‌ها یعنی برای ویدیوهای خیلی طولانی حافظهٔ بیشتری لازم است،
 * ولی منطق مالتی‌پلکس ساده و درست می‌ماند (ترک‌ها پیش از start اضافه می‌شوند).
 *
 * نکتهٔ مهم: رندر فریم‌ها با همان Renderer پیش‌نمایش انجام می‌شود
 * (CanvasDrawScope + TextMeasurer). TextMeasurer باید روی رشتهٔ UI ساخته
 * شده باشد (در EditorScreen با rememberTextMeasurer) و به اینجا پاس داده شود.
 */

class Exporter(private val context: Context) {

    /** نتیجهٔ خروجی. */
    data class Result(val file: File, val frames: Int, val seconds: Double, val sizeMB: Double)

    /** یک نمونهٔ انکودشده (کپی بایت‌ها + اطلاعات زمان‌بندی). */
    private data class Sample(val data: ByteArray, val info: MediaCodec.BufferInfo)

    /**
     * خروجی کامل پروژه به MP4.
     * @param onProgress پیشرفت ۰ تا ۱ (روی رشتهٔ فراخواننده صدا می‌شود).
     */
    suspend fun exportVideo(
        project: Project,
        plan: ExportPlan,
        measurer: TextMeasurer,
        media: MediaResolver?,
        outFile: File,
        onProgress: (Double) -> Unit = {},
    ): Result = withContext(Dispatchers.Default) {
        // ── ۱) ویدیو: رندر فریم‌ها + انکود H.264 ──
        val (videoSamples, videoFormat) = encodeVideo(project, plan, measurer, media) { p ->
            onProgress(p * 0.7)
        }
        // ── ۲) صدا: دیکد → میکس → AAC ──
        val clips = audioSchedule(project, plan.from, plan.to)
        var audioSamples: List<Sample>? = null
        var audioFormat: MediaFormat? = null
        if (clips.isNotEmpty()) {
            val mixed = mixAudio(clips, plan.seconds)
            if (mixed != null) {
                val (pcm, sampleRate, channels) = mixed
                val (samples, format) = encodeAudio(pcm, sampleRate, channels)
                audioSamples = samples
                audioFormat = format
            }
        }
        onProgress(0.85)
        // ── ۳) مالتی‌پلکس: افزودن ترک‌ها، بعد نوشتن نمونه‌ها به‌ترتیب زمان ──
        val muxer = MediaMuxer(outFile.absolutePath, MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4)
        val videoTrack = muxer.addTrack(videoFormat)
        val audioTrack = audioFormat?.let { muxer.addTrack(it) } ?: -1
        muxer.start()
        // نمونه‌ها را به‌ترتیب زمان‌بندی (pts) می‌نویسیم
        val all = mutableListOf<Pair<Long, Pair<Int, Sample>>>()
        for (s in videoSamples) all.add(s.info.presentationTimeUs to (videoTrack to s))
        if (audioSamples != null) {
            for (s in audioSamples) all.add(s.info.presentationTimeUs to (audioTrack to s))
        }
        all.sortBy { it.first }
        for ((_, pair) in all) {
            val (track, sample) = pair
            if (track < 0) continue
            val buf = ByteBuffer.wrap(sample.data)
            muxer.writeSampleData(track, buf, sample.info)
        }
        muxer.stop()
        muxer.release()
        onProgress(1.0)
        val sizeMB = (outFile.length() / 1024.0 / 1024.0 * 10).roundToInt() / 10.0
        Result(outFile, plan.frames, plan.seconds, sizeMB)
    }

    /** رندر فریم‌ها و انکود H.264؛ (نمونه‌ها، فرمت خروجی) را برمی‌گرداند. */
    private suspend fun encodeVideo(
        project: Project,
        plan: ExportPlan,
        measurer: TextMeasurer,
        media: MediaResolver?,
        onProgress: (Double) -> Unit,
    ): Pair<List<Sample>, MediaFormat> = withContext(Dispatchers.Default) {
        val videoFormat = MediaFormat.createVideoFormat(MediaFormat.MIMETYPE_VIDEO_AVC, plan.width, plan.height).apply {
            setInteger(MediaFormat.KEY_COLOR_FORMAT, MediaCodecInfo.CodecCapabilities.COLOR_FormatSurface)
            setInteger(MediaFormat.KEY_BIT_RATE, plan.bitrate)
            setInteger(MediaFormat.KEY_FRAME_RATE, plan.fps)
            setInteger(MediaFormat.KEY_I_FRAME_INTERVAL, 1)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                setInteger(MediaFormat.KEY_PROFILE, MediaCodecInfo.CodecProfileLevel.AVCProfileHigh)
                setInteger(MediaFormat.KEY_LEVEL, MediaCodecInfo.CodecProfileLevel.AVCLevel31)
            }
        }
        val encoder = MediaCodec.createEncoderByType(MediaFormat.MIMETYPE_VIDEO_AVC)
        encoder.configure(videoFormat, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE)
        val inputSurface = encoder.createInputSurface()
        encoder.start()
        val samples = mutableListOf<Sample>()
        var outFormat: MediaFormat? = null
        val info = MediaCodec.BufferInfo()
        try {
            for (i in 0 until plan.frames) {
                if (!isActive) break
                val t = plan.from + i.toDouble() / plan.fps
                val bmp = renderFrameToBitmap(project, t, measurer, media, plan.width, plan.height)
                val surfaceCanvas = inputSurface.lockCanvas(null)
                try {
                    surfaceCanvas.drawBitmap(bmp.asAndroidBitmap(), 0f, 0f, null)
                } finally {
                    inputSurface.unlockCanvasAndPost(surfaceCanvas)
                }
                bmp.asAndroidBitmap().recycle()
                // تخلیهٔ خروجی انکودر تا اینجا
                drainToList(encoder, samples, { outFormat = it }, info)
                onProgress((i + 1).toDouble() / plan.frames)
            }
            encoder.signalEndOfInputStream()
            drainToList(encoder, samples, { outFormat = it }, info, endOfStream = true)
        } finally {
            encoder.stop()
            encoder.release()
            inputSurface.release()
        }
        val format = outFormat ?: videoFormat
        samples to format
    }

    /** رندر یک فریم پروژه به بیت‌مپ (همان Renderer پیش‌نمایش، بدون UI). */
    private fun renderFrameToBitmap(
        project: Project,
        t: Double,
        measurer: TextMeasurer,
        media: MediaResolver?,
        width: Int,
        height: Int,
    ): androidx.compose.ui.graphics.ImageBitmap {
        val bmp = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
        val imageBitmap = bmp.asImageBitmap()
        // Canvas کامپوز فقط ImageBitmap می‌گیرد (نه Bitmap اندروید) —
        // asImageBitmap همان پیکسل‌ها را می‌پیچد، پس رندر روی بیت‌مپ اصلی می‌نشیند
        val canvas = Canvas(imageBitmap)
        val drawScope = CanvasDrawScope()
        val size = androidx.compose.ui.geometry.Size(width.toFloat(), height.toFloat())
        drawScope.draw(Density(1f), LayoutDirection.Ltr, canvas, size) {
            renderFrame(project, t, measurer, media)
        }
        return imageBitmap
    }

    /** تخلیهٔ خروجی انکودر به فهرست نمونه‌ها (کپی بایت‌ها). */
    private fun drainToList(
        encoder: MediaCodec,
        out: MutableList<Sample>,
        onFormat: (MediaFormat) -> Unit,
        info: MediaCodec.BufferInfo,
        endOfStream: Boolean = false,
    ) {
        while (true) {
            val outIndex = encoder.dequeueOutputBuffer(info, if (endOfStream) 10000 else 0)
            if (outIndex == MediaCodec.INFO_TRY_AGAIN_LATER) break
            if (outIndex == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED) {
                onFormat(encoder.outputFormat)
                continue
            }
            if (outIndex < 0) continue
            val outBuffer = encoder.getOutputBuffer(outIndex)
            if (outBuffer != null && info.size > 0) {
                val data = ByteArray(info.size)
                outBuffer.position(info.offset)
                outBuffer.limit(info.offset + info.size)
                outBuffer.get(data)
                // کپی اطلاعات (چون BufferInfo بازیافت می‌شود)
                val copy = MediaCodec.BufferInfo()
                copy.set(0, data.size, info.presentationTimeUs, info.flags)
                out.add(Sample(data, copy))
            }
            encoder.releaseOutputBuffer(outIndex, false)
            if (info.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM != 0) break
        }
    }

    /**
     * میکس صدا: دیکد هر کلیپ به PCM (۴۴٫۱kHz استریو)، اعمال بلندی + محو،
     * جمع روی بافر خروجی. برمی‌گرداند (pcm, sampleRate, channels) یا null.
     */
    private fun mixAudio(clips: List<AudioClip>, durationSec: Double): Triple<ShortArray, Int, Int>? {
        val sampleRate = 44100
        val channels = 2
        val totalFrames = (durationSec * sampleRate).roundToInt()
        if (totalFrames <= 0) return null
        val out = FloatArray(totalFrames * channels)
        for (clip in clips) {
            val pcm = decodeToPcm(clip.src, sampleRate, channels) ?: continue
            val startFrame = (clip.start * sampleRate).roundToInt()
            val offsetFrames = (clip.offset * sampleRate).roundToInt()
            val clipFrames = min(pcm.size / channels, (clip.duration * sampleRate).roundToInt())
            // بلندی + محو ورود/خروج خطی — همان فرمول audioVolumeAt نسخهٔ وب
            val layerDur = max(0.01, clip.layerEnd - clip.layerStart)
            for (f in 0 until clipFrames) {
                val dstIdx = startFrame + f
                if (dstIdx >= totalFrames) break
                val srcIdx = offsetFrames + f
                if (srcIdx * channels >= pcm.size) break
                val local = clip.offset + f.toDouble() / sampleRate
                var k = 1.0f
                if (clip.fadeIn > 0 && local < clip.fadeIn) k = min(k, (local / clip.fadeIn).toFloat())
                if (clip.fadeOut > 0 && local > layerDur - clip.fadeOut) {
                    k = min(k, ((layerDur - local) / clip.fadeOut).toFloat())
                }
                val vol = (clip.volume * k).toFloat().coerceIn(0f, 1f)
                for (ch in 0 until channels) {
                    val s = pcm[srcIdx * channels + ch] / 32768f
                    out[dstIdx * channels + ch] += s * vol
                }
            }
        }
        val pcmOut = ShortArray(totalFrames * channels)
        for (i in pcmOut.indices) {
            pcmOut[i] = (out[i].coerceIn(-1f, 1f) * 32767f).toInt().toShort()
        }
        return Triple(pcmOut, sampleRate, channels)
    }

    /** دیکد یک فایل صوتی به PCM ۱۶بیتی (sampleRate و channels داده‌شده؛ resample خطی). */
    private fun decodeToPcm(src: String, targetRate: Int, targetChannels: Int): ShortArray? {
        val extractor = MediaExtractor()
        try {
            extractor.setDataSource(context, Uri.parse(src), null)
        } catch (_: Exception) {
            extractor.release()
            return null
        }
        var trackIdx = -1
        var format: MediaFormat? = null
        for (i in 0 until extractor.trackCount) {
            val f = extractor.getTrackFormat(i)
            val mime = f.getString(MediaFormat.KEY_MIME) ?: ""
            if (mime.startsWith("audio/")) {
                trackIdx = i
                format = f
                break
            }
        }
        if (trackIdx < 0 || format == null) {
            extractor.release()
            return null
        }
        extractor.selectTrack(trackIdx)
        val srcRate = format.getInteger(MediaFormat.KEY_SAMPLE_RATE)
        val srcChannels = format.getInteger(MediaFormat.KEY_CHANNEL_COUNT)
        val mime = format.getString(MediaFormat.KEY_MIME) ?: return null
        val decoder = MediaCodec.createDecoderByType(mime)
        decoder.configure(format, null, null, 0)
        decoder.start()
        val pcm = mutableListOf<Short>()
        val info = MediaCodec.BufferInfo()
        var sawInputEos = false
        var sawOutputEos = false
        val timeoutUs = 10000L
        while (!sawOutputEos) {
            if (!sawInputEos) {
                val inIdx = decoder.dequeueInputBuffer(timeoutUs)
                if (inIdx >= 0) {
                    val inBuf = decoder.getInputBuffer(inIdx)!!
                    val sampleSize = extractor.readSampleData(inBuf, 0)
                    if (sampleSize < 0) {
                        decoder.queueInputBuffer(inIdx, 0, 0, 0, MediaCodec.BUFFER_FLAG_END_OF_STREAM)
                        sawInputEos = true
                    } else {
                        decoder.queueInputBuffer(inIdx, 0, sampleSize, extractor.sampleTime, 0)
                        extractor.advance()
                    }
                }
            }
            val outIdx = decoder.dequeueOutputBuffer(info, timeoutUs)
            if (outIdx >= 0) {
                val outBuf = decoder.getOutputBuffer(outIdx)!!
                if (info.size > 0) {
                    val bytes = ByteArray(info.size)
                    outBuf.position(info.offset)
                    outBuf.limit(info.offset + info.size)
                    outBuf.get(bytes)
                    val shorts = ShortArray(bytes.size / 2)
                    for (i in shorts.indices) {
                        shorts[i] = ((bytes[i * 2 + 1].toInt() shl 8) or (bytes[i * 2].toInt() and 0xFF)).toShort()
                    }
                    pcm.addAll(resample(shorts, srcRate, srcChannels, targetRate, targetChannels).toList())
                }
                decoder.releaseOutputBuffer(outIdx, false)
                if (info.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM != 0) sawOutputEos = true
            }
        }
        decoder.stop()
        decoder.release()
        extractor.release()
        return pcm.toShortArray()
    }

    /** Resample خطی: نرخ و کانال را به هدف می‌رساند (استریو با تکرار کانال). */
    private fun resample(input: ShortArray, srcRate: Int, srcChannels: Int, dstRate: Int, dstChannels: Int): ShortArray {
        if (srcRate == dstRate && srcChannels == dstChannels) return input
        val srcFrames = input.size / srcChannels
        if (srcFrames == 0) return ShortArray(0)
        val dstFrames = (srcFrames.toDouble() * dstRate / srcRate).roundToInt()
        val out = ShortArray(dstFrames * dstChannels)
        for (f in 0 until dstFrames) {
            val srcPos = f.toDouble() * srcRate / dstRate
            val i0 = srcPos.toInt().coerceIn(0, srcFrames - 1)
            val i1 = min(i0 + 1, srcFrames - 1)
            val frac = (srcPos - i0).toFloat()
            for (ch in 0 until dstChannels) {
                val sc = min(ch, srcChannels - 1)
                val s0 = input[i0 * srcChannels + sc].toFloat()
                val s1 = input[i1 * srcChannels + sc].toFloat()
                out[f * dstChannels + ch] = (s0 + (s1 - s0) * frac).toInt().toShort()
            }
        }
        return out
    }

    /** انکود PCM به AAC؛ (نمونه‌ها، فرمت خروجی) را برمی‌گرداند. */
    private fun encodeAudio(pcm: ShortArray, sampleRate: Int, channels: Int): Pair<List<Sample>, MediaFormat> {
        val format = MediaFormat.createAudioFormat(MediaFormat.MIMETYPE_AUDIO_AAC, sampleRate, channels).apply {
            setInteger(MediaFormat.KEY_BIT_RATE, 128_000)
            setInteger(MediaFormat.KEY_AAC_PROFILE, MediaCodecInfo.CodecProfileLevel.AACObjectLC)
            setInteger(MediaFormat.KEY_MAX_INPUT_SIZE, 16384)
        }
        val encoder = MediaCodec.createEncoderByType(MediaFormat.MIMETYPE_AUDIO_AAC)
        encoder.configure(format, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE)
        encoder.start()
        val samples = mutableListOf<Sample>()
        var outFormat: MediaFormat? = null
        val info = MediaCodec.BufferInfo()
        val frameSize = 1024 // AAC: ۱۰۲۴ نمونه در هر فریم
        var pos = 0
        var ptsUs = 0L
        try {
            while (pos < pcm.size) {
                val inIdx = encoder.dequeueInputBuffer(10000)
                if (inIdx >= 0) {
                    val inBuf = encoder.getInputBuffer(inIdx)!!
                    inBuf.clear()
                    val n = min(frameSize * channels, pcm.size - pos)
                    val bytes = ByteArray(n * 2)
                    for (i in 0 until n) {
                        val s = pcm[pos + i].toInt()
                        bytes[i * 2] = (s and 0xFF).toByte()
                        bytes[i * 2 + 1] = ((s shr 8) and 0xFF).toByte()
                    }
                    inBuf.put(bytes)
                    val flags = if (pos + n >= pcm.size) MediaCodec.BUFFER_FLAG_END_OF_STREAM else 0
                    encoder.queueInputBuffer(inIdx, 0, bytes.size, ptsUs, flags)
                    ptsUs += (n / channels).toLong() * 1_000_000L / sampleRate
                    pos += n
                }
                drainToList(encoder, samples, { outFormat = it }, info)
            }
            drainToList(encoder, samples, { outFormat = it }, info, endOfStream = true)
        } finally {
            try { encoder.stop() } catch (_: Exception) { }
            encoder.release()
        }
        return samples to (outFormat ?: format)
    }

    companion object {
        /** پوشهٔ خروجی پیش‌فرض (داخل حافظهٔ برنامه). */
        fun defaultOutFile(context: Context, name: String): File {
            val dir = File(context.getExternalFilesDir(null), "exports")
            if (!dir.exists()) dir.mkdirs()
            return File(dir, name)
        }
    }
}
