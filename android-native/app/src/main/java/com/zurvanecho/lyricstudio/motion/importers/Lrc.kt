package com.zurvanecho.lyricstudio.motion.importers

import com.zurvanecho.lyricstudio.motion.model.Layer
import com.zurvanecho.lyricstudio.motion.model.TextSpec
import com.zurvanecho.lyricstudio.motion.model.WordTiming
import com.zurvanecho.lyricstudio.motion.model.newLayer
import com.zurvanecho.lyricstudio.motion.model.uid

/**
 * ایمپورت شعر LRC — پورت src/importers/lrc.js نسخهٔ وب.
 *
 * هم LRC ساده ([mm:ss.xx]متن) و هم LRC پیشرفته با برچسب کلمه
 * ([mm:ss.xx]<mm:ss.xx>کلمه <mm:ss.xx>کلمه) را می‌خواند؛
 * [offset:ms] و برچسب‌های متا ([ti:]/[ar:]/[al:]/[by:]) هم پشتیبانی می‌شوند.
 */

data class LrcWord(val t: Double, val text: String)
data class LrcLine(val start: Double, val end: Double, val text: String, val words: List<LrcWord>)
data class LrcResult(val meta: Map<String, String>, val lines: List<LrcLine>)

private val TAG = Regex("""\[(\d{1,2}):(\d{1,2})(?:[.:](\d{1,3}))?\]""")
private val WORD_TAG = Regex("""<(\d{1,2}):(\d{1,2})(?:[.:](\d{1,3}))?>""")
private val META = Regex("""^\[(ti|ar|al|by|offset):([^\]]*)\]""")
private val LEADING_TAGS = Regex("""^(\[\d{1,2}:\d{1,2}(?:[.:]\d{1,3})?\])+""")

private fun toSec(m: String, s: String, frac: String?): Double {
    val f = when {
        frac == null -> 0.0
        frac.length == 1 -> frac.toDouble() / 10.0
        frac.length == 2 -> frac.toDouble() / 100.0
        else -> frac.toDouble() / 1000.0
    }
    return m.toDouble() * 60 + s.toDouble() + f
}

/**
 * تجزیهٔ متن LRC → {meta, lines:[{start, end, text, words}]}.
 * زمان‌ها ثانیه‌اند؛ end هر خط = شروع خط بعد (خط آخر: آخرین کلمه + ۲ ثانیه).
 */
fun parseLrc(text: String?): LrcResult {
    val meta = mutableMapOf<String, String>()
    val lines = mutableListOf<LrcLine>()
    var offset = 0.0
    for (raw in (text ?: "").split(Regex("\\r?\\n"))) {
        val line = raw.trim()
        if (line.isEmpty()) continue
        val metaM = META.find(line)
        if (metaM != null) {
            val (key, value) = metaM.destructured
            if (key == "offset") offset = (value.toDoubleOrNull() ?: 0.0) / 1000.0
            else meta[key] = value.trim()
            continue
        }
        val tags = TAG.findAll(line).toList()
        if (tags.isEmpty()) continue
        val first = tags[0]
        val start = toSec(first.groupValues[1], first.groupValues[2], first.groupValues[3].ifEmpty { null }) + offset
        var rest = line.substring(first.range.last + 1)
        // برچسب‌های زمانیِ اضافه در ابتدای خط (چند زمان برای یک متن) نادیده گرفته می‌شوند
        rest = rest.replace(LEADING_TAGS, "").trim()
        val words = mutableListOf<LrcWord>()
        val wtags = WORD_TAG.findAll(rest).toList()
        if (wtags.isNotEmpty()) {
            for (i in wtags.indices) {
                val wt = wtags[i]
                val wStart = wt.range.last + 1
                val wEnd = if (i + 1 < wtags.size) wtags[i + 1].range.first else rest.length
                val wtext = rest.substring(wStart, wEnd).trim()
                if (wtext.isEmpty()) continue
                words.add(
                    LrcWord(
                        toSec(wt.groupValues[1], wt.groupValues[2], wt.groupValues[3].ifEmpty { null }) + offset,
                        wtext,
                    ),
                )
            }
        }
        val textOut = if (words.isNotEmpty()) {
            words.joinToString(" ") { it.text }
        } else {
            rest.replace(Regex("<[^>]*>"), "").trim()
        }
        if (textOut.isEmpty()) continue
        lines.add(LrcLine(start, 0.0, textOut, words))
    }
    val sorted = lines.sortedBy { it.start }
    val out = sorted.mapIndexed { i, ln ->
        val next = sorted.getOrNull(i + 1)
        val lastWord = if (ln.words.isNotEmpty()) ln.words.last().t else ln.start
        ln.copy(end = next?.start ?: (lastWord + 2.0))
    }
    return LrcResult(meta, out)
}

/**
 * خط‌های شعر → لایه‌های متن (یکی برای هر خط، با زمان‌بندی خودش).
 * زمان‌بندی کلمه‌ها روی layer.text.words می‌ماند تا کارائوکهٔ آینده از آن استفاده کند.
 */
fun lrcToLayers(lines: List<LrcLine>, x: Double = 360.0, y: Double = 640.0): List<Layer> {
    return lines.map { ln ->
        val name = if (ln.text.length > 18) ln.text.take(18) + "…" else ln.text
        newLayer("text", name, ln.start, ln.end).copy(
            text = TextSpec(
                content = ln.text,
                weight = 700,
                size = 64.0,
                color = "#FAFAFA",
                align = "center",
                lineHeight = 1.4,
                words = ln.words.map { w ->
                    WordTiming(
                        t = ((w.t - ln.start) * 100).toInt() / 100.0,
                        text = w.text,
                    )
                },
            ),
            transform = com.zurvanecho.lyricstudio.motion.model.Transform(x = x, y = y),
        )
    }
}

/** ساخت شناسهٔ یکتا برای لایه‌های LRC (همان uid وب). */
fun lrcLayerId(): String = uid()
