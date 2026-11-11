package com.zurvanecho.lyricstudio.motion.ui.editor

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.AddCircle
import androidx.compose.material.icons.filled.AlignHorizontalCenter
import androidx.compose.material.icons.filled.AlignHorizontalLeft
import androidx.compose.material.icons.filled.AlignHorizontalRight
import androidx.compose.material.icons.filled.AlignVerticalBottom
import androidx.compose.material.icons.filled.AlignVerticalCenter
import androidx.compose.material.icons.filled.AlignVerticalTop
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Audiotrack
import androidx.compose.material.icons.filled.Bookmark
import androidx.compose.material.icons.filled.BookmarkBorder
import androidx.compose.material.icons.filled.Brush
import androidx.compose.material.icons.filled.Category
import androidx.compose.material.icons.filled.ChevronLeft
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.ContentPaste
import androidx.compose.material.icons.filled.Dashboard
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Fullscreen
import androidx.compose.material.icons.filled.GridOn
import androidx.compose.material.icons.filled.GroupWork
import androidx.compose.material.icons.filled.Image
import androidx.compose.material.icons.filled.Layers
import androidx.compose.material.icons.filled.LayersClear
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Redo
import androidx.compose.material.icons.filled.Schedule
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Share
import androidx.compose.material.icons.filled.SkipNext
import androidx.compose.material.icons.filled.SkipPrevious
import androidx.compose.material.icons.filled.TextFields
import androidx.compose.material.icons.filled.Timeline
import androidx.compose.material.icons.filled.Undo
import androidx.compose.material.icons.filled.Widgets
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Slider
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TextField
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableDoubleStateOf
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Stroke as DrawStroke
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import com.zurvanecho.lyricstudio.motion.audio.AudioPlayer
import com.zurvanecho.lyricstudio.motion.core.SHAPE_KINDS
import com.zurvanecho.lyricstudio.motion.core.SHAPE_NAMES_FA
import com.zurvanecho.lyricstudio.motion.core.layerTransform
import com.zurvanecho.lyricstudio.motion.core.valueAt
import com.zurvanecho.lyricstudio.motion.effects.EffectDef
import com.zurvanecho.lyricstudio.motion.effects.Effects
import com.zurvanecho.lyricstudio.motion.export.Exporter
import com.zurvanecho.lyricstudio.motion.export.exportPlan
import com.zurvanecho.lyricstudio.motion.importers.lrcToLayers
import com.zurvanecho.lyricstudio.motion.importers.parseLrc
import com.zurvanecho.lyricstudio.motion.model.AudioSpec
import com.zurvanecho.lyricstudio.motion.model.EffectRef
import com.zurvanecho.lyricstudio.motion.model.Keyframe
import com.zurvanecho.lyricstudio.motion.model.Layer
import com.zurvanecho.lyricstudio.motion.model.Project
import com.zurvanecho.lyricstudio.motion.model.ShapeSpec
import com.zurvanecho.lyricstudio.motion.model.Stroke
import com.zurvanecho.lyricstudio.motion.model.StrokePoint
import com.zurvanecho.lyricstudio.motion.model.TextSpec
import com.zurvanecho.lyricstudio.motion.model.Transform
import com.zurvanecho.lyricstudio.motion.model.demoProject
import com.zurvanecho.lyricstudio.motion.model.newLayer
import com.zurvanecho.lyricstudio.motion.model.uid
import com.zurvanecho.lyricstudio.motion.render.MediaResolver
import com.zurvanecho.lyricstudio.motion.ui.theme.Alight
import com.zurvanecho.lyricstudio.motion.ui.theme.hexColor
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlin.math.roundToInt

/**
 * ویرایشگر — همان چیدمان Alight: نوار بالا ۴۲dp، نوار پخش ۴۶dp،
 * صحنه + ریل ۵۰dp در لبهٔ راست، تایم‌لاین ۲۸۰dp پایین، دکمهٔ + ۷۳dp،
 * پاپ‌آپ افزودن (۵ تب + ستون quick-add، از activity_edit_addpopup دیکدشده)
 * و پنل المان ۲۰۰dp (برش/تقسیم/کپی، رنگ و پرکردن، ویرایش متن/شکل، صدا، دوربین).
 */

/** تبدیل مختصات محلی نقطه (نسبت به مرکز لایه) به مختصات پروژه. */
private fun pointToProject(tr: Transform, p: StrokePoint): Offset {
    val rot = kotlin.math.toRadians(tr.rotation)
    val c = kotlin.math.cos(rot)
    val s = kotlin.math.sin(rot)
    val sx = p.x * tr.scaleX
    val sy = p.y * tr.scaleY
    return Offset((tr.x + sx * c - sy * s).toFloat(), (tr.y + sx * s + sy * c).toFloat())
}

/** تبدیل مختصات پروژه به مختصات محلی نقطه (معکوس ترنسفورم لایه). */
private fun projectToPoint(tr: Transform, p: Offset): StrokePoint {
    val px = p.x.toDouble() - tr.x
    val py = p.y.toDouble() - tr.y
    val rot = kotlin.math.toRadians(tr.rotation)
    val c = kotlin.math.cos(rot)
    val s = kotlin.math.sin(rot)
    return StrokePoint(
        (px * c + py * s) / kotlin.math.max(0.01, tr.scaleX),
        (-px * s + py * c) / kotlin.math.max(0.01, tr.scaleY),
    )
}

/** زمان پروژه به شکل m:ss.ff (مثل editTimeView آلایت؛ ff شمارهٔ فریم است). */
private fun formatTime(t: Double, fps: Int): String {
    val m = (t / 60).toInt()
    val s = (t % 60).toInt()
    val f = ((t * fps) % fps).toInt()
    return "%d:%02d.%02d".format(m, s, f)
}

/** ساخت یک EffectRef از روی تعریف رجیستری + پارامترهای داده‌شده. */
private fun presetRef(id: String, overrides: Map<String, Double>): EffectRef? {
    val def = Effects.byId(id) ?: return null
    val params = def.params.filter { it.value.type == "n" }.mapValues { it.value.defNum } + overrides
    val tp = def.params.filter { it.value.type == "c" }.mapValues { it.value.defStr }
    return EffectRef(id = id, params = params, textParams = tp)
}

/** ۶ پریست آماده (ترکیب افکت‌های واقعی رجیستری) — مثل پریست‌های آلایت. */
private val PRESETS: List<Pair<String, List<EffectRef>>> = listOf(
    "سینمایی" to listOfNotNull(
        presetRef("brightness", mapOf("amount" to 0.1)),
        presetRef("contrast", mapOf("amount" to 0.25)),
        presetRef("saturation", mapOf("amount" to -0.1)),
    ),
    "سیاه‌سفید" to listOfNotNull(
        presetRef("grayscale", mapOf("amount" to 1.0)),
        presetRef("contrast", mapOf("amount" to 0.15)),
    ),
    "سپیا" to listOfNotNull(
        presetRef("sepia", mapOf("amount" to 1.0)),
        presetRef("contrast", mapOf("amount" to 0.1)),
        presetRef("brightness", mapOf("amount" to -0.05)),
    ),
    "زنده" to listOfNotNull(
        presetRef("saturation", mapOf("amount" to 0.4)),
        presetRef("contrast", mapOf("amount" to 0.15)),
        presetRef("brightness", mapOf("amount" to 0.05)),
    ),
    "سرد" to listOfNotNull(
        presetRef("temperature", mapOf("amt" to -40.0)),
        presetRef("saturation", mapOf("amount" to 0.1)),
    ),
    "گرم" to listOfNotNull(
        presetRef("temperature", mapOf("amt" to 40.0)),
        presetRef("saturation", mapOf("amount" to 0.15)),
    ),
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun EditorScreen(
    initial: Project,
    onSave: (Project) -> Unit,
    onClose: () -> Unit,
) {
    var project by remember { mutableStateOf(initial) }
    var time by remember { mutableDoubleStateOf(0.0) }
    var playing by remember { mutableStateOf(false) }
    var selectedId by remember { mutableStateOf<String?>(null) }
    var showAdd by remember { mutableStateOf(false) }
    // U3: حالت نقاشی (دست‌آزاد/وکتور) + ضربهٔ در حال کشیدن (مختصات پروژه)
    var drawMode by remember { mutableStateOf<String?>(null) }
    var drawPoints by remember { mutableStateOf<List<StrokePoint>>(emptyList()) }
    var drawWidthPx by remember { mutableStateOf(0f) }
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)

    val selected = project.layers.firstOrNull { it.id == selectedId }

    LaunchedEffect(playing) {
        while (playing) {
            delay(33)
            time += 1.0 / 30.0
            if (time >= project.duration) time = 0.0
        }
    }

    // K1: پشتهٔ undo/redo — اسنپ‌شات کامل پروژه (دیتاکلاس، حداکثر ۵۰).
    var undoStack by remember { mutableStateOf<List<Project>>(emptyList()) }
    var redoStack by remember { mutableStateOf<List<Project>>(emptyList()) }
    var copiedLayer by remember { mutableStateOf<Layer?>(null) }
    var showProjectSettings by remember { mutableStateOf(false) }
    var previewFullscreen by remember { mutableStateOf(false) }
    // K3b: ترک‌پد ویرایش نقطه — زیرپنل باز اینسپکتور و نقطهٔ انتخاب‌شده.
    var inspectorPanel by remember { mutableStateOf<String?>(null) }
    var pointStroke by remember { mutableStateOf(0) }
    var pointPoint by remember { mutableStateOf(0) }
    var pointWidthPx by remember { mutableStateOf(0f) }
    var meterLevel by remember { mutableFloatStateOf(0f) }
    // K2: حالت پایهٔ کشیدنِ در جریان (برای ثبت یک ورودی تاریخچه در پایان کشیدن).
    var pendingBase by remember { mutableStateOf<Project?>(null) }

    fun update(p: Project) {
        if (p == project) return
        // اگر کشیدنی در جریان بود، اول حالت پایه‌اش را ثبت کن.
        val base = pendingBase
        if (base != null) {
            pendingBase = null
            undoStack = (undoStack + base).takeLast(50)
        }
        undoStack = (undoStack + project).takeLast(50)
        redoStack = emptyList()
        project = p
        onSave(p)
    }

    fun undo() {
        val prev = undoStack.lastOrNull() ?: return
        pendingBase = null
        redoStack = redoStack + project
        undoStack = undoStack.dropLast(1)
        project = prev
        onSave(prev)
    }

    /** تغییر زنده بدون ثبت تاریخچه (کشیدن اسلایدر/نوار) — حالت پایه در
     *  اولین تغییر ذخیره می‌شود و در پایان کشیدن یک ورودی ثبت می‌کند. */
    fun preview(p: Project) {
        if (p == project) return
        if (pendingBase == null) pendingBase = project
        project = p
        onSave(p)
    }

    fun finishDrag() {
        val base = pendingBase ?: return
        pendingBase = null
        undoStack = (undoStack + base).takeLast(50)
        redoStack = emptyList()
    }

    fun redo() {
        val next = redoStack.lastOrNull() ?: return
        pendingBase = null
        undoStack = (undoStack + project).takeLast(50)
        redoStack = redoStack.dropLast(1)
        project = next
        onSave(next)
    }

    /** کپی لایهٔ انتخاب‌شده در حافظهٔ داخلی؛ چسباندن همان لایه با آی‌دی تازه. */
    fun copySelected() {
        val s = selected ?: return
        copiedLayer = s
    }

    fun pasteCopied() {
        val c = copiedLayer ?: return
        val copy = c.copy(id = uid(), name = c.name + " (کپی)")
        val idx = project.layers.indexOfFirst { it.id == selectedId }
        val rest = project.layers.toMutableList()
        if (idx >= 0) rest.add(idx + 1, copy) else rest.add(copy)
        update(project.copy(layers = rest))
        selectedId = copy.id
    }

    /** بوک‌مارک در زمان پخش: اگر نزدیکش هست حذف، وگرنه اضافه می‌شود. */
    fun toggleBookmark() {
        val near = project.bookmarks.firstOrNull { kotlin.math.abs(it - time) < 0.1 }
        update(
            project.copy(
                bookmarks = if (near != null) project.bookmarks - near else project.bookmarks + time,
            ),
        )
    }

    /** پرش زمان به بوک‌مارک/کی‌فریم قبلی یا بعدی لایهٔ انتخاب‌شده. */
    fun jumpCue(forward: Boolean) {
        val sel = selected
        // کی‌فریم‌های ترنسفورم زمانِ پروژه‌اند (مثل وب)؛ کی‌فریم zoom محلی است
        // و در پرش cue حساب نمی‌شود.
        val marks =
            (project.bookmarks + (sel?.keyframes?.filterKeys { it != "zoom" }?.values?.flatten()?.map { it.t } ?: emptyList()))
                .sorted()
        if (marks.isEmpty()) return
        val target =
            if (forward) marks.firstOrNull { it > time + 0.05 } else marks.lastOrNull { it < time - 0.05 }
        if (target != null) time = target
    }

    /** حذف لایهٔ انتخاب‌شده. */
    fun deleteSelected() {
        update(project.copy(layers = project.layers.filter { it.id != selectedId }))
        selectedId = null
    }

    /** گروه‌کردن: لایهٔ انتخاب‌شده داخل یک گروه تازه می‌رود. */
    fun groupSelected() {
        val s = selected ?: return
        val group =
            newLayer("group", "گروه", s.start, s.end).copy(
                transform = s.transform,
                children = listOf(s.copy(transform = Transform(x = 0.0, y = 0.0))),
            )
        update(project.copy(layers = project.layers.map { if (it.id == s.id) group else it }))
        selectedId = group.id
    }

    /** باز کردن گروه: فرزندان با ترکیب ترنسفورم گروه جای آن می‌نشینند. */
    fun ungroupSelected() {
        val s = selected ?: return
        val gt = s.transform
        val kids =
            s.children.map { ch ->
                val ct = ch.transform
                ch.copy(
                    transform =
                        ct.copy(
                            x = ct.x + gt.x,
                            y = ct.y + gt.y,
                            rotation = ct.rotation + gt.rotation,
                            scaleX = ct.scaleX * gt.scaleX,
                            scaleY = ct.scaleY * gt.scaleY,
                            opacity = ct.opacity * gt.opacity,
                        ),
                )
            }
        val idx = project.layers.indexOfFirst { it.id == s.id }
        val rest = project.layers.toMutableList()
        rest.removeAt(idx)
        rest.addAll(idx, kids)
        update(project.copy(layers = rest))
        selectedId = kids.firstOrNull()?.id
    }

    /** گروه و ماسک: لایهٔ انتخاب‌شده + لایهٔ زیرش در یک گروه؛ بالایی ماسک زیرین می‌شود. */
    fun groupAndMaskSelected() {
        val s = selected ?: return
        val idx = project.layers.indexOfFirst { it.id == s.id }
        if (idx <= 0) return
        val below = project.layers[idx - 1]
        val group =
            newLayer("group", "گروه و ماسک", minOf(s.start, below.start), maxOf(s.end, below.end)).copy(
                transform = s.transform,
                children =
                    listOf(
                        below.copy(transform = Transform(x = 0.0, y = 0.0)),
                        s.copy(transform = Transform(x = 0.0, y = 0.0), clip = "below"),
                    ),
            )
        val rest = project.layers.toMutableList()
        rest.removeAt(idx)
        rest[idx - 1] = group
        update(project.copy(layers = rest))
        selectedId = group.id
    }

    /** حذف از ماسک: پاک کردن clip لایهٔ انتخاب‌شده. */
    fun excludeFromMaskSelected() {
        val s = selected ?: return
        if (s.clip == "none") return
        update(project.copy(layers = project.layers.map { if (it.id == s.id) s.copy(clip = "none") else it }))
    }

    /** تراز لایهٔ انتخاب‌شده به لبه/مرکز صحنه. */
    fun alignSelected(mode: String) {
        val s = selected ?: return
        val hw = (s.shape?.w ?: 0.0) / 2.0
        val hh = (s.shape?.h ?: 0.0) / 2.0
        val nt =
            when (mode) {
                "left" -> s.transform.copy(x = hw)
                "centerH" -> s.transform.copy(x = project.width / 2.0)
                "right" -> s.transform.copy(x = project.width - hw)
                "top" -> s.transform.copy(y = hh)
                "centerV" -> s.transform.copy(y = project.height / 2.0)
                "bottom" -> s.transform.copy(y = project.height - hh)
                else -> return
            }
        update(project.copy(layers = project.layers.map { if (it.id == s.id) s.copy(transform = nt) else it }))
    }

    fun addLayer(layer: Layer) {
        update(project.copy(layers = project.layers + layer))
        selectedId = layer.id
        showAdd = false
    }

    /** ثبت ضربهٔ نقاشی: به لایهٔ draw انتخاب‌شده اضافه می‌شود یا لایهٔ تازه می‌سازد. */
    fun commitDraw(points: List<StrokePoint>) {
        if (points.size < 2) return
        val cx = project.width / 2.0
        val cy = project.height / 2.0
        val rel = points.map { StrokePoint(it.x - cx, it.y - cy) }
        val stroke = Stroke(color = "#FAFAFA", width = 5.0, points = rel)
        val existing = project.layers.firstOrNull { it.id == selectedId && it.type == "draw" }
        if (existing != null) {
            update(project.copy(layers = project.layers.map { if (it.id == existing.id) it.copy(strokes = it.strokes + stroke) else it }))
        } else {
            val layer = newLayer("draw", if (drawMode == "vector") "وکتور" else "دست‌آزاد", time, minOf(project.duration, time + 5.0)).copy(
                strokes = listOf(stroke),
                transform = Transform(x = cx, y = cy),
            )
            update(project.copy(layers = project.layers + layer))
            selectedId = layer.id
        }
        drawPoints = emptyList()
    }

    /** افزودن لایه‌های پروژهٔ نمایشی به‌صورت یک گروه (تب قالب‌ها / المان نمونه). */
    fun addDemoAsGroup(name: String) {
        val cx = project.width / 2.0
        val cy = project.height / 2.0
        val kids = demoProject().layers.map { dl ->
            dl.copy(id = uid(), transform = dl.transform.copy(x = dl.transform.x - cx, y = dl.transform.y - cy))
        }
        addLayer(
            newLayer("group", name, time, minOf(project.duration, time + 5.0)).copy(
                transform = Transform(x = cx, y = cy),
                children = kids,
            ),
        )
    }

    /** تقسیم لایهٔ انتخاب‌شده در زمان پخش (دو لایه پشت سر هم). */
    fun splitSelected() {
        val s = selected ?: return
        if (time <= s.start || time >= s.end) return
        val first = s.copy(end = time)
        val second = s.copy(id = uid(), start = time)
        val idx = project.layers.indexOfFirst { it.id == s.id }
        val rest = project.layers.toMutableList()
        rest[idx] = first
        rest.add(idx + 1, second)
        update(project.copy(layers = rest))
        selectedId = first.id
    }

    /** کپی لایهٔ انتخاب‌شده (بلافاصله بعد از خودش). */
    fun duplicateSelected() {
        val s = selected ?: return
        val copy = s.copy(id = uid(), name = s.name + " (کپی)")
        val idx = project.layers.indexOfFirst { it.id == s.id }
        val rest = project.layers.toMutableList()
        rest.add(idx + 1, copy)
        update(project.copy(layers = rest))
        selectedId = copy.id
    }

    /** برش ابتدا/انتهای لایهٔ انتخاب‌شده تا زمان پخش. */
    fun trimSelected(toStart: Boolean) {
        val s = selected ?: return
        if (time <= s.start || time >= s.end) return
        val changed = if (toStart) s.copy(start = time) else s.copy(end = time)
        update(project.copy(layers = project.layers.map { if (it.id == s.id) changed else it }))
    }

    // انتخاب رسانه از گالری — تصویر/ویدیو با src = URI
    val pickImage = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        if (uri != null) {
            addLayer(
                newLayer("image", "تصویر", time, minOf(project.duration, time + 5.0)).copy(
                    src = uri.toString(),
                    transform = Transform(x = 360.0, y = 640.0),
                ),
            )
        }
    }
    val pickVideo = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        if (uri != null) {
            addLayer(
                newLayer("video", "ویدیو", time, minOf(project.duration, time + 5.0)).copy(
                    src = uri.toString(),
                    transform = Transform(x = 360.0, y = 640.0),
                ),
            )
        }
    }

    // پخش صدا در پیش‌نمایش (N5) — با زمان پروژه همگام می‌شود
    val context = LocalContext.current
    val audioPlayer = remember { AudioPlayer(context) }
    DisposableEffect(Unit) { onDispose { audioPlayer.release() } }
    LaunchedEffect(time, playing, project) {
        audioPlayer.sync(project, time, playing)
    }

    // K1: سنج صدا — خواندن سطح Visualizer هنگام پخش (محو تدریجی بین خواندن‌ها).
    LaunchedEffect(playing) {
        while (playing) {
            meterLevel = maxOf(audioPlayer.currentLevel(), meterLevel * 0.85f)
            delay(50)
        }
        meterLevel = 0f
    }

    // خروجی MP4 (N6) — رندر فریم‌ها با همان Renderer پیش‌نمایش
    val measurer = rememberTextMeasurer()
    val mediaResolver = remember(context) { MediaResolver(context) }
    val exporter = remember(context) { Exporter(context) }
    var exporting by remember { mutableStateOf(false) }
    var exportProgress by remember { mutableDoubleStateOf(0.0) }
    var exportMsg by remember { mutableStateOf<String?>(null) }
    val exportScope = rememberCoroutineScope()
    fun startExport() {
        if (exporting) return
        exporting = true
        exportProgress = 0.0
        exportMsg = null
        exportScope.launch {
            try {
                val plan = exportPlan(project)
                val outFile = Exporter.defaultOutFile(context, "${project.name}.mp4")
                val result = exporter.exportVideo(project, plan, measurer, mediaResolver, outFile) { p ->
                    exportProgress = p
                }
                exportMsg = "خروجی آماده شد — ${result.frames} فریم، ${result.sizeMB} مگابایت"
                // اشتراک‌گذاری فایل
                val uri = androidx.core.content.FileProvider.getUriForFile(
                    context,
                    "com.zurvanecho.lyricstudio.motion.fileprovider",
                    result.file,
                )
                val share = android.content.Intent(android.content.Intent.ACTION_SEND).apply {
                    type = "video/mp4"
                    putExtra(android.content.Intent.EXTRA_STREAM, uri)
                    addFlags(android.content.Intent.FLAG_GRANT_READ_URI_PERMISSION)
                }
                context.startActivity(
                    android.content.Intent.createChooser(share, "اشتراک‌گذاری ویدیو"),
                )
            } catch (e: Exception) {
                exportMsg = "خروجی ناموفق بود: ${e.message ?: "خطا"}"
            } finally {
                exporting = false
            }
        }
    }

    // انتخاب فایل صوتی → لایهٔ audio
    val pickAudio = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        if (uri != null) {
            addLayer(
                newLayer("audio", "صدا", time, minOf(project.duration, time + 5.0)).copy(
                    src = uri.toString(),
                    audio = AudioSpec(),
                ),
            )
        }
    }
    // ایمپورت شعر LRC → لایه‌های متن زمان‌بندی‌شده
    val scope = rememberCoroutineScope()
    val pickLrc = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        if (uri != null) {
            scope.launch(Dispatchers.IO) {
                try {
                    val text = context.contentResolver.openInputStream(uri)?.bufferedReader()?.readText()
                    val result = parseLrc(text)
                    if (result.lines.isNotEmpty()) {
                        val layers = lrcToLayers(result.lines)
                        withContext(Dispatchers.Main) {
                            update(project.copy(layers = project.layers + layers))
                            selectedId = layers.firstOrNull()?.id
                            showAdd = false
                        }
                    }
                } catch (_: Exception) {
                    // فایل خراب — نادیده گرفته می‌شود
                }
            }
        }
    }

    Box(modifier = Modifier.fillMaxSize()) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .background(Alight.SurfaceDeep),
        ) {
            // نوار بالا — ۴۲dp (مثل activity_edit_navbar.xml: خروج، عنوان
            // قابل‌ویرایش، ساعت، تنظیمات پروژه، اشتراک)
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(42.dp)
                    .background(Alight.Surface),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                IconButton(onClick = onClose) {
                    Icon(Icons.Filled.ArrowBack, contentDescription = "بازگشت", tint = Alight.Text)
                }
                // عنوان قابل‌ویرایش (مثل SettingEditText آلایت) — با Done ثبت می‌شود.
                var titleEdit by remember { mutableStateOf(project.name) }
                LaunchedEffect(project.name) {
                    if (titleEdit != project.name) titleEdit = project.name
                }
                BasicTextField(
                    value = titleEdit,
                    onValueChange = { titleEdit = it },
                    singleLine = true,
                    textStyle =
                        TextStyle(
                            color = Alight.Text,
                            fontWeight = FontWeight.Bold,
                            fontSize = 16.sp,
                        ),
                    keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
                    keyboardActions =
                        KeyboardActions(onDone = { update(project.copy(name = titleEdit)) }),
                    modifier = Modifier.weight(1f),
                )
                if (exporting) {
                    Text(
                        "${(exportProgress * 100).toInt()}٪",
                        color = Alight.Mint,
                        modifier = Modifier.padding(end = 8.dp),
                    )
                }
                // editTimeView — زمان فعلی پروژه
                Text(
                    formatTime(time, project.fps),
                    color = Alight.Text2,
                    modifier = Modifier.padding(end = 8.dp),
                )
                IconButton(onClick = { showProjectSettings = true }) {
                    Icon(Icons.Filled.Settings, contentDescription = "تنظیمات پروژه", tint = Alight.Text)
                }
                IconButton(onClick = { startExport() }) {
                    Icon(Icons.Filled.Share, contentDescription = "خروجی", tint = Alight.Text)
                }
            }
            // نوار انتخاب — ۴۲dp (مثل selectOptionsBar آلایت)، فقط وقتی لایه‌ای انتخاب است
            if (selected != null) {
                Row(
                    modifier =
                        Modifier
                            .fillMaxWidth()
                            .height(42.dp)
                            .background(Alight.Surface1)
                            .horizontalScroll(rememberScrollState()),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        "۱ لایه انتخاب شده",
                        color = Alight.Text2,
                        modifier = Modifier.padding(start = 12.dp, end = 8.dp),
                    )
                    IconButton(onClick = { groupSelected() }) {
                        Icon(Icons.Filled.GroupWork, contentDescription = "گروه", tint = Alight.Text)
                    }
                    IconButton(onClick = { groupAndMaskSelected() }) {
                        Icon(Icons.Filled.Layers, contentDescription = "گروه و ماسک", tint = Alight.Text)
                    }
                    IconButton(onClick = { excludeFromMaskSelected() }) {
                        Icon(Icons.Filled.LayersClear, contentDescription = "حذف از ماسک", tint = Alight.Text)
                    }
                    IconButton(onClick = { deleteSelected() }) {
                        Icon(Icons.Filled.Delete, contentDescription = "حذف", tint = Alight.Text)
                    }
                    IconButton(onClick = { jumpCue(false) }) {
                        Icon(Icons.Filled.ChevronLeft, contentDescription = "قبلی", tint = Alight.Text)
                    }
                    IconButton(onClick = { alignSelected("left") }) {
                        Icon(Icons.Filled.AlignHorizontalLeft, contentDescription = "چپ", tint = Alight.Text)
                    }
                    IconButton(onClick = { alignSelected("centerH") }) {
                        Icon(Icons.Filled.AlignHorizontalCenter, contentDescription = "وسط افقی", tint = Alight.Text)
                    }
                    IconButton(onClick = { alignSelected("right") }) {
                        Icon(Icons.Filled.AlignHorizontalRight, contentDescription = "راست", tint = Alight.Text)
                    }
                    IconButton(onClick = { alignSelected("top") }) {
                        Icon(Icons.Filled.AlignVerticalTop, contentDescription = "بالا", tint = Alight.Text)
                    }
                    IconButton(onClick = { alignSelected("centerV") }) {
                        Icon(Icons.Filled.AlignVerticalCenter, contentDescription = "وسط عمودی", tint = Alight.Text)
                    }
                    IconButton(onClick = { alignSelected("bottom") }) {
                        Icon(Icons.Filled.AlignVerticalBottom, contentDescription = "پایین", tint = Alight.Text)
                    }
                    IconButton(onClick = { jumpCue(true) }) {
                        Icon(Icons.Filled.ChevronRight, contentDescription = "بعدی", tint = Alight.Text)
                    }
                    IconButton(onClick = { selectedId = null }) {
                        Icon(Icons.Filled.Close, contentDescription = "لغو", tint = Alight.Text)
                    }
                }
            }
            // صحنه + ریل راست ۵۰dp
            Row(modifier = Modifier.weight(1f)) {
                Box(
                    modifier = Modifier
                        .weight(1f)
                        .fillMaxHeight()
                        .padding(8.dp),
                    contentAlignment = Alignment.Center,
                ) {
                    ProjectPreview(project = project, time = time, modifier = Modifier.fillMaxSize())
                    // U2: پروژهٔ خالی — راهنما روی صحنه (به‌جای صفحهٔ خالیِ بی‌هدف)
                    if (project.layers.isEmpty()) {
                        Column(
                            horizontalAlignment = Alignment.CenterHorizontally,
                            modifier = Modifier
                                .align(Alignment.Center)
                                .padding(16.dp),
                        ) {
                            Icon(Icons.Filled.AddCircle, contentDescription = null, tint = Alight.Mint, modifier = Modifier.size(56.dp))
                            Spacer(modifier = Modifier.height(12.dp))
                            Text(
                                "پروژه خالیه",
                                color = Alight.Text,
                                fontWeight = FontWeight.Bold,
                                style = androidx.compose.material3.MaterialTheme.typography.titleMedium,
                            )
                            Spacer(modifier = Modifier.height(6.dp))
                            Text(
                                "دکمهٔ + پایین رو بزن و متن، شکل، عکس یا ویدیو اضافه کن",
                                color = Alight.Text2,
                                style = androidx.compose.material3.MaterialTheme.typography.bodyMedium,
                            )
                        }
                    }
                    // U3: حالت نقاشی — لایهٔ لمسی روی صحنه، هم‌اندازهٔ پیش‌نمایش
                    if (drawMode != null) {
                        Box(
                            modifier = Modifier
                                .fillMaxWidth()
                                .aspectRatio(project.width.toFloat() / project.height.toFloat())
                                .onSizeChanged { drawWidthPx = it.width.toFloat() }
                                .pointerInput(drawMode, drawWidthPx) {
                                    // مقیاس Double است چون StrokePoint مختصات Double می‌خواهد
                                    val scale = if (drawWidthPx > 0f) (drawWidthPx / project.width).toDouble() else 1.0
                                    if (drawMode == "vector") {
                                        // وکتور: هر ضربه یک نقطهٔ چندضلعی می‌گذارد
                                        detectTapGestures(onTap = { off ->
                                            drawPoints = drawPoints + StrokePoint(off.x / scale, off.y / scale)
                                        })
                                    } else {
                                        // دست‌آزاد: کشیدن = خط پیوسته
                                        detectDragGestures(
                                            onDragStart = { off ->
                                                drawPoints = listOf(StrokePoint(off.x / scale, off.y / scale))
                                            },
                                            onDrag = { change, _ ->
                                                drawPoints = drawPoints + StrokePoint(change.position.x / scale, change.position.y / scale)
                                            },
                                            onDragEnd = { commitDraw(drawPoints); drawMode = null },
                                            onDragCancel = { drawPoints = emptyList() },
                                        )
                                    }
                                },
                        ) {
                            if (drawPoints.size >= 2) {
                                Canvas(modifier = Modifier.fillMaxSize()) {
                                    val scale = if (drawWidthPx > 0f) drawWidthPx / project.width else 1f
                                    val path = Path()
                                    drawPoints.forEachIndexed { i, p ->
                                        val px = (p.x * scale).toFloat()
                                        val py = (p.y * scale).toFloat()
                                        if (i == 0) path.moveTo(px, py) else path.lineTo(px, py)
                                    }
                                    drawPath(path, color = Color.White, style = DrawStroke(width = 5f * scale))
                                }
                            }
                        }
                        // نوار تمام/لغو بالای صحنه
                        Row(
                            modifier = Modifier
                                .align(Alignment.TopCenter)
                                .padding(top = 8.dp)
                                .background(Alight.Surface4, RoundedCornerShape(20.dp))
                                .padding(horizontal = 4.dp, vertical = 2.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Text(
                                if (drawMode == "vector") "وکتور — نقطه بزن" else "دست‌آزاد",
                                color = Alight.Text2,
                                modifier = Modifier.padding(horizontal = 8.dp),
                            )
                            Text(
                                "تمام",
                                color = Alight.Mint,
                                fontWeight = FontWeight.Bold,
                                modifier = Modifier.clickable { commitDraw(drawPoints); drawMode = null }.padding(8.dp),
                            )
                            Text(
                                "لغو",
                                color = Alight.Text2,
                                modifier = Modifier.clickable { drawPoints = emptyList(); drawMode = null }.padding(8.dp),
                            )
                        }
                    }
                    // K3b: ترک‌پد ویرایش نقطه — کشیدن نقطه روی صحنه
                    // (مثل movePointTrackpad در fragment_edit_points2.xml آلایت)
                    val editLayer = selected
                    if (inspectorPanel == "points" && editLayer != null && editLayer.type == "draw" && editLayer.strokes.isNotEmpty()) {
                        val layerState = rememberUpdatedState(editLayer)
                        val timeState = rememberUpdatedState(time)
                        val projectState = rememberUpdatedState(project)
                        Box(
                            modifier = Modifier
                                .fillMaxWidth()
                                .aspectRatio(project.width.toFloat() / project.height.toFloat())
                                .onSizeChanged { pointWidthPx = it.width.toFloat() }
                                .pointerInput(editLayer.id, pointStroke, pointWidthPx) {
                                    var active = -1
                                    val scale = if (pointWidthPx > 0f) pointWidthPx / project.width else 1f
                                    val threshold = 24.dp.toPx()
                                    detectDragGestures(
                                        onDragStart = { off ->
                                            val layer = layerState.value
                                            val tr = layerTransform(layer, timeState.value)
                                            val st = layer.strokes.getOrNull(pointStroke) ?: return@detectDragGestures
                                            val nearest = st.points.mapIndexed { i, p ->
                                                i to (pointToProject(tr, p) * scale - off).getDistance()
                                            }.minByOrNull { it.second }
                                            if (nearest != null && nearest.second <= threshold) {
                                                active = nearest.first
                                                pointPoint = active
                                            } else {
                                                active = -1
                                            }
                                        },
                                        onDrag = { change, _ ->
                                            if (active < 0) return@detectDragGestures
                                            val cur = projectState.value.layers.firstOrNull { it.id == layerState.value.id }
                                                ?: return@detectDragGestures
                                            val tr = layerTransform(cur, timeState.value)
                                            val np = projectToPoint(tr, Offset(change.position.x / scale, change.position.y / scale))
                                            val stIdx = pointStroke.coerceIn(0, cur.strokes.size - 1)
                                            val strokes = cur.strokes.mapIndexed { si, s ->
                                                if (si != stIdx) s
                                                else s.copy(points = s.points.mapIndexed { pi, p -> if (pi == active) np else p })
                                            }
                                            val proj = projectState.value
                                            preview(proj.copy(layers = proj.layers.map { if (it.id == cur.id) cur.copy(strokes = strokes) else it }))
                                        },
                                        onDragEnd = {
                                            if (active >= 0) finishDrag()
                                            active = -1
                                        },
                                        onDragCancel = { active = -1 },
                                    )
                                },
                        ) {
                            Canvas(modifier = Modifier.fillMaxSize()) {
                                val layer = editLayer
                                val tr = layerTransform(layer, time)
                                val scale = if (pointWidthPx > 0f) pointWidthPx / project.width else 1f
                                // همهٔ خط‌ها؛ خط انتخاب‌شده سفید، بقیه کم‌رنگ
                                for ((si, st) in layer.strokes.withIndex()) {
                                    if (st.points.size < 2) continue
                                    val path = Path()
                                    st.points.forEachIndexed { i, p ->
                                        val o = pointToProject(tr, p) * scale
                                        if (i == 0) path.moveTo(o.x, o.y) else path.lineTo(o.x, o.y)
                                    }
                                    drawPath(
                                        path,
                                        color = if (si == pointStroke) Color.White else Alight.TextDim,
                                        style = DrawStroke(width = (if (si == pointStroke) 3f else 2f) * scale),
                                    )
                                }
                                // دستگیرهٔ نقطه‌ها روی خط انتخاب‌شده
                                val st = layer.strokes.getOrNull(pointStroke)
                                if (st != null) {
                                    for ((i, p) in st.points.withIndex()) {
                                        val o = pointToProject(tr, p) * scale
                                        drawCircle(color = Color.Black, radius = 8.dp.toPx(), center = o)
                                        drawCircle(
                                            color = if (i == pointPoint) Alight.Mint else Color.White,
                                            radius = 6.dp.toPx(),
                                            center = o,
                                        )
                                    }
                                }
                            }
                        }
                    }
                }
                Column(
                    modifier = Modifier
                        .width(50.dp)
                        .fillMaxHeight()
                        .background(Alight.Surface),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(4.dp),
                ) {
                    Spacer(modifier = Modifier.height(8.dp))
                    IconButton(onClick = {}) { Icon(Icons.Filled.GridOn, null, tint = Alight.Text2) }
                    IconButton(onClick = {}) { Icon(Icons.Filled.Close, null, tint = Alight.Text2) }
                }
            }
            // تایم‌لاین — ۲۸۰dp
            Timeline(
                project = project,
                time = time,
                selectedId = selectedId,
                onSelect = { selectedId = it; pointStroke = 0; pointPoint = 0 },
                onTimeChange = { time = it },
                onLayerChange = { changed ->
                    update(project.copy(layers = project.layers.map { if (it.id == changed.id) changed else it }))
                },
                onKeyframeChange = { layer, prop, oldT, newT ->
                    update(
                        project.copy(
                            layers = project.layers.map {
                                if (it.id != layer.id) it
                                else {
                                    val list = it.keyframes[prop].orEmpty()
                                    val next =
                                        list.map { kf ->
                                            if (kotlin.math.abs(kf.t - oldT) < 0.001) kf.copy(t = newT) else kf
                                        }.sortedBy { k -> k.t }
                                    it.copy(keyframes = it.keyframes + (prop to next))
                                }
                            },
                        ),
                    )
                },
                modifier = Modifier
                    .fillMaxWidth()
                    .height(280.dp),
            )
            // سنج صدا — ۲dp بالای نوار پخش (مثل levelMeterView آلایت)
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(2.dp)
                    .background(Alight.Surface1),
            ) {
                Box(
                    modifier =
                        Modifier
                            .fillMaxWidth(meterLevel.coerceIn(0f, 1f))
                            .fillMaxHeight()
                            .background(Alight.Mint),
                )
            }
            // نوار پخش — ۴۶dp (مثل activity_edit_playbar.xml: undo/redo،
            // عقب/جلو، پخش، کپی/چسباندن، بوک‌مارک، پیش‌نمایش تمام‌صفحه)
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(46.dp)
                    .background(Alight.Surface1),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceEvenly,
            ) {
                IconButton(onClick = { undo() }, enabled = undoStack.isNotEmpty()) {
                    Icon(
                        Icons.Filled.Undo,
                        null,
                        tint = if (undoStack.isNotEmpty()) Alight.Text else Alight.TextDim,
                    )
                }
                IconButton(onClick = { redo() }, enabled = redoStack.isNotEmpty()) {
                    Icon(
                        Icons.Filled.Redo,
                        null,
                        tint = if (redoStack.isNotEmpty()) Alight.Text else Alight.TextDim,
                    )
                }
                IconButton(onClick = { time = maxOf(0.0, time - 1.0 / 30.0) }) { Icon(Icons.Filled.SkipPrevious, null, tint = Alight.Text) }
                IconButton(onClick = { playing = !playing }) {
                    Icon(
                        if (playing) Icons.Filled.Pause else Icons.Filled.PlayArrow,
                        null, tint = Alight.Text, modifier = Modifier.size(30.dp),
                    )
                }
                IconButton(onClick = { time = minOf(project.duration, time + 1.0 / 30.0) }) { Icon(Icons.Filled.SkipNext, null, tint = Alight.Text) }
                IconButton(onClick = { copySelected() }, enabled = selected != null) {
                    Icon(
                        Icons.Filled.ContentCopy,
                        null,
                        tint = if (selected != null) Alight.Text else Alight.TextDim,
                    )
                }
                IconButton(onClick = { pasteCopied() }, enabled = copiedLayer != null) {
                    Icon(
                        Icons.Filled.ContentPaste,
                        null,
                        tint = if (copiedLayer != null) Alight.Text else Alight.TextDim,
                    )
                }
                IconButton(onClick = { toggleBookmark() }) {
                    val marked = project.bookmarks.any { kotlin.math.abs(it - time) < 0.1 }
                    Icon(
                        if (marked) Icons.Filled.Bookmark else Icons.Filled.BookmarkBorder,
                        null,
                        tint = if (marked) Alight.Mint else Alight.Text,
                    )
                }
                IconButton(onClick = { previewFullscreen = true }) {
                    Icon(Icons.Filled.Fullscreen, null, tint = Alight.Text)
                }
            }
            // نوار اطلاعات — ۴۶dp (مثل infoBarHolder آلایت)
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(46.dp)
                    .background(Alight.Surface1),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                if (selected == null) {
                    // حالت آیکون: زمان پروژه + آفست
                    Icon(
                        Icons.Filled.Schedule,
                        null,
                        tint = Alight.TextDim,
                        modifier = Modifier.padding(start = 12.dp),
                    )
                    Text(
                        formatTime(time, project.fps),
                        color = Alight.Text,
                        modifier = Modifier.padding(start = 8.dp),
                    )
                    Text(
                        "آفست 0:00.00",
                        color = Alight.Text2,
                        modifier = Modifier.padding(start = 16.dp),
                    )
                } else {
                    // حالت متن: شش مقدار لایهٔ انتخاب‌شده
                    val s = selected
                    val pairs =
                        listOf(
                            "X" to "%.0f".format(s.transform.x),
                            "Y" to "%.0f".format(s.transform.y),
                            "مقیاس" to "%.2f".format(s.transform.scaleX),
                            "چرخش" to "%.0f".format(s.transform.rotation),
                            "شفافیت" to "%.2f".format(s.transform.opacity),
                            "طول" to "%.1fث".format(s.end - s.start),
                        )
                    Row(
                        modifier =
                            Modifier
                                .horizontalScroll(rememberScrollState())
                                .padding(horizontal = 12.dp),
                    ) {
                        for ((label, value) in pairs) {
                            Column(modifier = Modifier.padding(end = 20.dp)) {
                                Text(
                                    label,
                                    color = Alight.TextDim,
                                    style = androidx.compose.material3.MaterialTheme.typography.labelSmall,
                                )
                                Text(
                                    value,
                                    color = Alight.Text,
                                    style = androidx.compose.material3.MaterialTheme.typography.labelMedium,
                                )
                            }
                        }
                    }
                }
            }
            // پنل بازرس — ۲۴۰dp (وقتی لایه‌ای انتخاب است)
            if (selected != null) {
                Inspector(
                    layer = selected,
                    time = time,
                    onChange = { changed ->
                        update(project.copy(layers = project.layers.map { if (it.id == changed.id) changed else it }))
                    },
                    onDelete = { deleteSelected() },
                    onClose = { selectedId = null },
                    onSplit = { splitSelected() },
                    onDuplicate = { duplicateSelected() },
                    onTrimStart = { trimSelected(true) },
                    onTrimEnd = { trimSelected(false) },
                    onGroup = { groupSelected() },
                    onUngroup = { ungroupSelected() },
                    onPreview = { changed ->
                        preview(project.copy(layers = project.layers.map { if (it.id == changed.id) changed else it }))
                    },
                    onFinish = { finishDrag() },
                    duration = project.duration,
                    projW = project.width,
                    projH = project.height,
                    onPanelChange = { inspectorPanel = it },
                    pointStroke = pointStroke,
                    pointPoint = pointPoint,
                    onPointSelect = { s, p -> pointStroke = s; pointPoint = p },
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(200.dp),
                )
            }
        }

        // دکمهٔ + شناور — ۷۳dp، بالای تایم‌لاین + نوار پخش + نوار اطلاعات
        // (و پنل المان اگر باز است)
        Box(
            modifier = Modifier
                .align(Alignment.BottomEnd)
                .padding(end = 16.dp, bottom = ((280 + 46 + 46 + if (selected != null) 200 else 0) + 16).dp)
                .size(73.dp)
                .clip(CircleShape)
                .background(Alight.Pink)
                .clickable { showAdd = true },
            contentAlignment = Alignment.Center,
        ) {
            Icon(Icons.Filled.Add, null, tint = Alight.Text, modifier = Modifier.size(36.dp))
        }
    }

    // K1: دیالوگ تنظیمات پروژه (نام، مدت، fps، رنگ پس‌زمینه)
    if (showProjectSettings) {
        var sName by remember { mutableStateOf(project.name) }
        var sDuration by remember { mutableStateOf(project.duration.toString()) }
        var sFps by remember { mutableStateOf(project.fps.toString()) }
        var sBg by remember { mutableStateOf(project.bg) }
        AlertDialog(
            onDismissRequest = { showProjectSettings = false },
            title = { Text("تنظیمات پروژه") },
            text = {
                Column {
                    OutlinedTextField(
                        value = sName,
                        onValueChange = { sName = it },
                        label = { Text("نام") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth(),
                    )
                    OutlinedTextField(
                        value = sDuration,
                        onValueChange = { sDuration = it },
                        label = { Text("مدت (ثانیه)") },
                        singleLine = true,
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                        modifier = Modifier.fillMaxWidth(),
                    )
                    OutlinedTextField(
                        value = sFps,
                        onValueChange = { sFps = it },
                        label = { Text("فریم بر ثانیه") },
                        singleLine = true,
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                        modifier = Modifier.fillMaxWidth(),
                    )
                    OutlinedTextField(
                        value = sBg,
                        onValueChange = { sBg = it },
                        label = { Text("رنگ پس‌زمینه (#RRGGBB)") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth(),
                    )
                }
            },
            confirmButton = {
                TextButton(onClick = {
                    val d = sDuration.toDoubleOrNull()?.coerceIn(1.0, 3600.0) ?: project.duration
                    val f = sFps.toIntOrNull()?.coerceIn(1, 120) ?: project.fps
                    update(project.copy(name = sName.ifBlank { project.name }, duration = d, fps = f, bg = sBg))
                    showProjectSettings = false
                }) { Text("تأیید") }
            },
            dismissButton = {
                TextButton(onClick = { showProjectSettings = false }) { Text("لغو") }
            },
        )
    }

    // K1: پیش‌نمایش تمام‌صفحه (مثل previewMode آلایت)
    if (previewFullscreen) {
        Dialog(
            onDismissRequest = { previewFullscreen = false },
            properties = DialogProperties(usePlatformDefaultWidth = false),
        ) {
            Box(
                modifier =
                    Modifier
                        .fillMaxSize()
                        .background(Color.Black)
                        .clickable { previewFullscreen = false },
                contentAlignment = Alignment.Center,
            ) {
                ProjectPreview(project = project, time = time, modifier = Modifier.fillMaxSize())
                IconButton(
                    onClick = { previewFullscreen = false },
                    modifier = Modifier.align(Alignment.TopEnd).padding(16.dp),
                ) {
                    Icon(Icons.Filled.Close, null, tint = Color.White)
                }
                IconButton(
                    onClick = { playing = !playing },
                    modifier = Modifier.align(Alignment.BottomCenter).padding(16.dp),
                ) {
                    Icon(
                        if (playing) Icons.Filled.Pause else Icons.Filled.PlayArrow,
                        null,
                        tint = Color.White,
                        modifier = Modifier.size(48.dp),
                    )
                }
            }
        }
    }

    if (showAdd) {
        ModalBottomSheet(
            onDismissRequest = { showAdd = false },
            sheetState = sheetState,
            containerColor = Alight.Surface,
        ) {
            AddSheet(
                onShape = { kind, fill ->
                    addLayer(
                        newLayer("shape", "شکل", time, minOf(project.duration, time + 5.0)).copy(
                            shape = ShapeSpec(kind = kind, fill = fill, w = 300.0, h = 300.0),
                            transform = Transform(x = 360.0, y = 640.0),
                        ),
                    )
                },
                onText = {
                    addLayer(
                        newLayer("text", "متن", time, minOf(project.duration, time + 5.0)).copy(
                            text = TextSpec(content = "متن تازه", weight = 700, size = 56.0, color = "#FAFAFA"),
                            transform = Transform(x = 360.0, y = 640.0),
                        ),
                    )
                },
                onImage = { pickImage.launch("image/*") },
                onVideo = { pickVideo.launch("video/*") },
                onAudio = { pickAudio.launch("audio/*") },
                onLrc = { pickLrc.launch("text/*") },
                onCamera = {
                    addLayer(
                        newLayer("camera", "دوربین", 0.0, project.duration).copy(
                            camera = com.zurvanecho.lyricstudio.motion.model.CameraSpec(zoom = 1.0),
                            transform = Transform(x = 360.0, y = 640.0),
                        ),
                    )
                },
                onNull = {
                    addLayer(newLayer("null", "نال", time, minOf(project.duration, time + 5.0)))
                },
                onEmptyGroup = {
                    addLayer(newLayer("group", "گروه خالی", time, minOf(project.duration, time + 5.0)))
                },
                onElements = { addDemoAsGroup("المان نمونه") },
                onTemplate = { addDemoAsGroup("قالب نمایش") },
                onFreehand = { drawMode = "freehand"; showAdd = false },
                onVector = { drawMode = "vector"; showAdd = false },
                onClose = { showAdd = false },
            )
        }
    }
}

/** وضعیت کشیدن نوار لایه (جابه‌جایی/برش ابتدا/برش انتها). */
private data class BarDrag(
    val layerId: String,
    val mode: String,
    val start0: Double,
    val end0: Double,
    val dxSec: Double,
)

@Composable
private fun Timeline(
    project: Project,
    time: Double,
    selectedId: String?,
    onSelect: (String?) -> Unit,
    onTimeChange: (Double) -> Unit,
    onLayerChange: (Layer) -> Unit,
    onKeyframeChange: (layer: Layer, prop: String, oldT: Double, newT: Double) -> Unit,
    modifier: Modifier = Modifier,
) {
    // ۱۰۰dp به ازای هر ثانیه — همان timeline_base_dp_per_sec آلایت
    val pxPerSec = 100.dp
    val density = LocalDensity.current
    val scroll = rememberScrollState()
    val trackWidth = (project.duration * 100).dp
    val rows = project.layers.reversed()
    val frame = 1.0 / project.fps
    val dpPerSecPx = with(density) { pxPerSec.toPx() }
    fun snap(v: Double): Double = (v / frame).roundToInt().toDouble() * frame

    var barDrag by remember { mutableStateOf<BarDrag?>(null) }
    // کشیدن لوزی کی‌فریم: (layerId, prop, t0) + جابه‌جایی انباشته (ثانیه)
    var kfDrag by remember { mutableStateOf<Triple<String, String, Double>?>(null) }
    var kfDx by remember { mutableDoubleStateOf(0.0) }

    /** بازهٔ نوار لایه در پایان کشیدن (با جابه‌جاییِ انباشته). */
    fun rangeOf(d: BarDrag): Pair<Double, Double> =
        when (d.mode) {
            "move" -> {
                val len = d.end0 - d.start0
                val ns = (d.start0 + d.dxSec).coerceIn(0.0, project.duration - len)
                ns to ns + len
            }
            "trimStart" -> (d.start0 + d.dxSec).coerceIn(0.0, d.end0 - frame) to d.end0
            "trimEnd" -> d.start0 to (d.end0 + d.dxSec).coerceIn(d.start0 + frame, project.duration)
            else -> d.start0 to d.end0
        }

    /** بازهٔ نمایشی نوار لایه (حین کشیدن، پیش‌نمایش جابه‌جایی). */
    fun dispRange(layer: Layer): Pair<Double, Double> {
        val d = barDrag
        return if (d != null && d.layerId == layer.id) rangeOf(d) else layer.start to layer.end
    }

    Column(
        modifier = modifier.background(Alight.Surface),
    ) {
        // خط‌کش زمان — ضربه/کشیدن = جابه‌جایی زمان پخش (playheadTouchZone آلایت)
        Row(modifier = Modifier.fillMaxWidth().height(28.dp)) {
            Spacer(modifier = Modifier.width(70.dp))
            Box(
                modifier =
                    Modifier
                        .weight(1f)
                        .fillMaxHeight()
                        .horizontalScroll(scroll)
                        .pointerInput(dpPerSecPx, project.duration) {
                            detectTapGestures(onTap = { off ->
                                onTimeChange((off.x / dpPerSecPx).toDouble().coerceIn(0.0, project.duration))
                            })
                        }
                        .pointerInput(dpPerSecPx, project.duration) {
                            detectDragGestures(
                                onDragStart = { off ->
                                    onTimeChange((off.x / dpPerSecPx).toDouble().coerceIn(0.0, project.duration))
                                },
                                onDrag = { change, _ ->
                                    onTimeChange((change.position.x / dpPerSecPx).toDouble().coerceIn(0.0, project.duration))
                                },
                            )
                        },
            ) {
                Row {
                    for (s in 0..project.duration.toInt()) {
                        Box(modifier = Modifier.width(pxPerSec)) {
                            Text(
                                "%d:%02d".format(s / 60, s % 60),
                                color = Alight.TextDim,
                                style = androidx.compose.material3.MaterialTheme.typography.labelSmall,
                            )
                            // K1: بوک‌مارک‌ها — لوزی نعنایی روی خط‌کش
                            for (b in project.bookmarks) {
                                if (b >= s && b < s + 1) {
                                    Box(
                                        modifier =
                                            Modifier
                                                .offset(x = ((b - s) * 100).dp - 3.dp, y = 16.dp)
                                                .size(6.dp)
                                                .rotate(45f)
                                                .background(Alight.Mint),
                                    )
                                }
                            }
                        }
                    }
                }
                // خط پخش روی خط‌کش
                Box(
                    modifier =
                        Modifier
                            .offset(x = (time * 100).dp)
                            .width(2.dp)
                            .fillMaxHeight()
                            .background(Alight.Red),
                )
            }
        }
        // ردیف‌ها — سربرگ نام ثابت، بلوک‌ها اسکرول‌پذیر
        Row(modifier = Modifier.fillMaxWidth().weight(1f)) {
            Column(modifier = Modifier.width(70.dp)) {
                for (layer in rows) {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(28.dp)
                            .clickable { onSelect(layer.id) },
                        contentAlignment = Alignment.CenterStart,
                    ) {
                        Text(
                            layer.name,
                            color = if (layer.id == selectedId) Alight.Mint else Alight.Text2,
                            style = androidx.compose.material3.MaterialTheme.typography.labelSmall,
                            modifier = Modifier.padding(start = 8.dp),
                        )
                    }
                }
            }
            Column(
                modifier = Modifier
                    .weight(1f)
                    .horizontalScroll(scroll),
            ) {
                for (layer in rows) {
                    Box(
                        modifier = Modifier
                            .width(trackWidth)
                            .height(28.dp)
                            .clickable { onSelect(layer.id) },
                    ) {
                        val color = when (layer.type) {
                            "shape" -> Alight.Pink
                            "text" -> Alight.Mint
                            "audio" -> Alight.Yellow
                            "image", "video" -> Alight.Blue
                            "group" -> Alight.Purple
                            "camera" -> Alight.Orange
                            else -> Alight.Surface4
                        }
                        val (dispStart, dispEnd) = dispRange(layer)
                        Box(
                            modifier = Modifier
                                .offset(x = (dispStart * 100).dp)
                                .width(((dispEnd - dispStart) * 100).dp)
                                .fillMaxHeight()
                                .padding(vertical = 3.dp)
                                .clip(RoundedCornerShape(4.dp))
                                .background(color.copy(alpha = if (layer.id == selectedId) 1f else 0.75f))
                                .pointerInput(layer.id, dpPerSecPx) {
                                    detectDragGestures(
                                        onDragStart = { off ->
                                            onSelect(layer.id)
                                            val zone = when {
                                                off.x < 16.dp.toPx() -> "trimStart"
                                                off.x > size.width.toFloat() - 16.dp.toPx() -> "trimEnd"
                                                else -> "move"
                                            }
                                            barDrag = BarDrag(layer.id, zone, layer.start, layer.end, 0.0)
                                        },
                                        onDrag = { _, dragAmount ->
                                            val d = barDrag ?: return@detectDragGestures
                                            barDrag = d.copy(dxSec = d.dxSec + (dragAmount.x / dpPerSecPx).toDouble())
                                        },
                                        onDragEnd = {
                                            val d = barDrag ?: return@detectDragGestures
                                            val (ns, ne) = rangeOf(d)
                                            onLayerChange(layer.copy(start = snap(ns), end = snap(ne)))
                                            barDrag = null
                                        },
                                        onDragCancel = { barDrag = null },
                                    )
                                },
                        )
                        // نشانگرهای کی‌فریم (لوزی نعنایی) روی ردیف — لایهٔ انتخاب‌شده قابل‌کشیدن است
                        for ((prop, list) in layer.keyframes) {
                            if (prop == "zoom") continue
                            for (kf in list) {
                                val isSel = layer.id == selectedId
                                val kd = kfDrag
                                val dragging = isSel && kd != null && kd.first == layer.id &&
                                    kd.second == prop &&
                                    kotlin.math.abs(kf.t - kd.third) < 0.001
                                val drawT = if (dragging) kf.t + kfDx else kf.t
                                Box(
                                    modifier = Modifier
                                        .offset(x = (drawT * 100).dp - 10.dp, y = 4.dp)
                                        .size(20.dp)
                                        .then(
                                            if (isSel) {
                                                Modifier.pointerInput(layer.id, prop, kf.t, dpPerSecPx) {
                                                    detectDragGestures(
                                                        onDragStart = {
                                                            kfDrag = Triple(layer.id, prop, kf.t)
                                                            kfDx = 0.0
                                                        },
                                                        onDrag = { _, dragAmount ->
                                                            kfDx += (dragAmount.x / dpPerSecPx).toDouble()
                                                        },
                                                        onDragEnd = {
                                                            val nt = snap(
                                                                (kf.t + kfDx).coerceIn(layer.start, layer.end),
                                                            )
                                                            onKeyframeChange(layer, prop, kf.t, nt)
                                                            kfDrag = null
                                                            kfDx = 0.0
                                                        },
                                                        onDragCancel = {
                                                            kfDrag = null
                                                            kfDx = 0.0
                                                        },
                                                    )
                                                }
                                            } else {
                                                Modifier
                                            },
                                        ),
                                    contentAlignment = Alignment.Center,
                                ) {
                                    Box(
                                        modifier = Modifier
                                            .size(8.dp)
                                            .rotate(45f)
                                            .background(Alight.Mint, RoundedCornerShape(2.dp)),
                                    )
                                }
                            }
                        }
                        // خط پخش
                        Box(
                            modifier = Modifier
                                .offset(x = (time * 100).dp)
                                .width(2.dp)
                                .fillMaxHeight()
                                .background(Alight.Red),
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun Inspector(
    layer: Layer,
    time: Double,
    onChange: (Layer) -> Unit,
    onDelete: () -> Unit,
    onClose: () -> Unit,
    onGroup: () -> Unit,
    onUngroup: () -> Unit,
    onSplit: () -> Unit,
    onDuplicate: () -> Unit,
    onTrimStart: () -> Unit,
    onTrimEnd: () -> Unit,
    onPreview: ((Layer) -> Unit)? = null,
    onFinish: (() -> Unit)? = null,
    duration: Double = 10.0,
    projW: Int = 720,
    projH: Int = 1280,
    onPanelChange: ((String?) -> Unit)? = null,
    pointStroke: Int = 0,
    pointPoint: Int = 0,
    onPointSelect: ((Int, Int) -> Unit)? = null,
    modifier: Modifier = Modifier,
) {
    val t = layer.transform

    // زیرپنل باز پنل المان (null = فقط ردیف دکمه‌ها)
    var panel by remember { mutableStateOf<String?>(null) }

    fun togglePanel(name: String) {
        panel = if (panel == name) null else name
        onPanelChange?.invoke(panel)
    }

    /** تغییر زندهٔ اسلایدر (بدون تاریخچه)؛ پایان کشیدن یک ورودی ثبت می‌کند. */
    fun sc(changed: Layer) {
        if (onPreview != null) onPreview(changed) else onChange(changed)
    }

    fun fin() {
        onFinish?.invoke()
    }
    val scroll = rememberScrollState()
    var textEditOpen by remember { mutableStateOf(false) }
    var textDraft by remember { mutableStateOf("") }

    /** تغییر/حذف کی‌فریم یک ویژگی در زمان فعلی. */
    fun toggleKeyframe(prop: String, value: Double) {
        val list = layer.keyframes[prop].orEmpty()
        val existing = list.firstOrNull { kotlin.math.abs(it.t - time) < 0.05 }
        val next = if (existing != null) {
            list.filter { it !== existing }
        } else {
            (list + Keyframe(t = time, value = value)).sortedBy { it.t }
        }
        onChange(layer.copy(keyframes = layer.keyframes + (prop to next)))
    }

    fun hasKeyframe(prop: String) =
        layer.keyframes[prop].orEmpty().any { kotlin.math.abs(it.t - time) < 0.05 }

    Column(
        modifier = modifier
            .background(Alight.Surface1)
            .verticalScroll(scroll)
            .padding(horizontal = 16.dp, vertical = 8.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(layer.name, color = Alight.Text, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
            if (layer.type == "group") {
                Text("باز کردن گروه", color = Alight.Mint, modifier = Modifier.clickable { onUngroup() }.padding(8.dp))
            } else {
                Text("گروه", color = Alight.Mint, modifier = Modifier.clickable { onGroup() }.padding(8.dp))
            }
            IconButton(onClick = onDelete) { Icon(Icons.Filled.Delete, null, tint = Alight.Red) }
            IconButton(onClick = onClose) { Icon(Icons.Filled.Close, null, tint = Alight.Text2) }
        }
        // ردیف اول پنل المان آلایت (fragment_element_edit) — ۳۸dp:
        // سرعت، برش ابتدا، تقسیم، برش انتها، جابه‌جایی، صدا
        val inRange = time > layer.start && time < layer.end
        Row(
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            modifier = Modifier.padding(top = 4.dp),
        ) {
            PanelButton("سرعت", true) { togglePanel("speed") }
            PanelButton("برش ابتدا", inRange) { onTrimStart() }
            PanelButton("تقسیم", inRange) { onSplit() }
            PanelButton("برش انتها", inRange) { onTrimEnd() }
            PanelButton("← جابه‌جا", layer.start > 0.0) {
                val ns = maxOf(0.0, layer.start - 0.5)
                onChange(layer.copy(start = ns, end = layer.end - (layer.start - ns)))
            }
            PanelButton("جابه‌جا →", layer.end < duration) {
                val ne = minOf(duration, layer.end + 0.5)
                onChange(layer.copy(start = layer.start + (ne - layer.end), end = ne))
            }
            PanelButton("صدا", true) { togglePanel("volume") }
        }
        // ردیف دوم — ۵۷dp: رنگ و پرکردن، حاشیه و سایه، ترکیب و شفافیت
        Row(
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            modifier = Modifier.padding(top = 8.dp),
        ) {
            PanelButton("رنگ و پرکردن", true) { togglePanel("color") }
            PanelButton("حاشیه و سایه", true) { togglePanel("border") }
            PanelButton("ترکیب و شفافیت", true) { togglePanel("blend") }
        }
        // ردیف سوم — ۵۷dp: جابه‌جایی و ترنسفورم، ویرایشِ نوع لایه، پریست‌ها، افکت‌ها
        Row(
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            modifier = Modifier.padding(top = 8.dp),
        ) {
            PanelButton("جابه‌جایی", true) { togglePanel("move") }
            when (layer.type) {
                "draw" -> PanelButton("ویرایش نقطه‌ها", true) { togglePanel("points") }
                "text" -> PanelButton("ویرایش متن", true) { togglePanel("text") }
                "camera" -> PanelButton("دوربین", true) { togglePanel("camera") }
                "shape" -> PanelButton("ویرایش شکل", true) { togglePanel("shape") }
                "audio" -> PanelButton("صدا", true) { togglePanel("volume") }
                else -> PanelButton("ویرایش", true) { togglePanel("move") }
            }
            PanelButton("پریست‌ها", true) { togglePanel("presets") }
            PanelButton("افکت‌ها", true) { togglePanel("effects") }
        }
        // زیرپنل باز (دکمه، پنل مربوطش را باز می‌کند مثل آلایت)
        when (panel) {
            "speed" -> {
                // سرعت/ریتایم — مثل fragment_speed_keyframe.xml آلایت
                Row(
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    modifier = Modifier.padding(top = 8.dp),
                ) {
                    Text(
                        "سرعت",
                        color = Alight.Text2,
                        modifier = Modifier.width(64.dp).align(Alignment.CenterVertically),
                    )
                    PanelButton("−شروع", layer.start > 0.0) { onChange(layer.copy(start = maxOf(0.0, layer.start - 0.5))) }
                    PanelButton("+شروع", layer.end - layer.start > 0.6) { onChange(layer.copy(start = minOf(layer.end - 0.1, layer.start + 0.5))) }
                    PanelButton("−پایان", layer.end - layer.start > 0.6) { onChange(layer.copy(end = maxOf(layer.start + 0.1, layer.end - 0.5))) }
                    PanelButton("+پایان", true) { onChange(layer.copy(end = layer.end + 0.5)) }
                }
                SliderRow("ضریب", layer.speed, 0.25..4.0, false, {}, onFinish = { fin() }) { v ->
                    // اسنپ به مقدارهای آلایت (۰٫۲۵/۰٫۵/۰٫۷۵/۱/۲/۳/۴)؛
                    // طول نوار به همان نسبت عوض می‌شود (طول رسانه ثابت می‌ماند).
                    val snapped = listOf(0.25, 0.5, 0.75, 1.0, 2.0, 3.0, 4.0).minByOrNull { kotlin.math.abs(it - v) } ?: v
                    val mediaLen = (layer.end - layer.start) * layer.speed
                    sc(layer.copy(speed = snapped, end = layer.start + mediaLen / snapped))
                }
            }
            "volume" -> {
                val spec = layer.audio
                if (spec != null) {
                    // مثل fragment_volume_edit.xml: اسلایدر بلندی + مقدار
                    SliderRow("بلندی", spec.volume, 0.0..1.0, false, {}, onFinish = { fin() }) {
                        sc(layer.copy(audio = spec.copy(volume = it)))
                    }
                    SliderRow("محو شروع", spec.fadeIn, 0.0..3.0, false, {}, onFinish = { fin() }) {
                        sc(layer.copy(audio = spec.copy(fadeIn = it)))
                    }
                    SliderRow("محو پایان", spec.fadeOut, 0.0..3.0, false, {}, onFinish = { fin() }) {
                        sc(layer.copy(audio = spec.copy(fadeOut = it)))
                    }
                } else {
                    Text("این لایه صدا ندارد", color = Alight.Text2, modifier = Modifier.padding(top = 8.dp))
                }
            }
            "color" -> {
                val spec = layer.shape
                val tspec = layer.text
                if (spec != null) {
                    ColorRow("پرکردن", spec.fill) { c -> onChange(layer.copy(shape = spec.copy(fill = c))) }
                }
                if (tspec != null) {
                    ColorRow("رنگ متن", tspec.color) { c -> onChange(layer.copy(text = tspec.copy(color = c))) }
                }
                if (spec == null && tspec == null) {
                    Text("این لایه رنگ ندارد", color = Alight.Text2, modifier = Modifier.padding(top = 8.dp))
                }
            }
            "border" -> {
                val spec = layer.shape
                if (spec != null) {
                    ColorRow("حاشیه", spec.stroke) { c -> onChange(layer.copy(shape = spec.copy(stroke = c))) }
                    SliderRow("ضخامت حاشیه", spec.strokeWidth, 0.0..20.0, false, {}, onFinish = { fin() }) {
                        sc(layer.copy(shape = spec.copy(strokeWidth = it)))
                    }
                } else {
                    Text("این لایه حاشیه ندارد", color = Alight.Text2, modifier = Modifier.padding(top = 8.dp))
                }
            }
            "blend" -> {
                // مثل fragment_blending_opacity.xml: لیست حالت‌ها + اسلایدر شفافیت
                val modes = listOf(
                    "عادی" to "normal", "ضرب" to "multiply", "صفحه" to "screen",
                    "هم‌پوشانی" to "overlay", "تیره" to "darken", "روشن" to "lighten",
                    "تفاضل" to "difference", "حذف" to "exclusion",
                )
                Row(
                    modifier = Modifier.horizontalScroll(rememberScrollState()).padding(top = 8.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    for ((label, value) in modes) {
                        val active = layer.blend == value
                        Box(
                            modifier = Modifier
                                .clip(RoundedCornerShape(12.dp))
                                .background(if (active) Alight.Mint else Alight.Surface4)
                                .clickable { onChange(layer.copy(blend = value)) }
                                .padding(horizontal = 12.dp, vertical = 6.dp),
                        ) {
                            Text(label, color = if (active) Color.Black else Alight.Text)
                        }
                    }
                }
                SliderRow("شفافیت", t.opacity, 0.0..1.0, hasKeyframe("opacity"), { toggleKeyframe("opacity", t.opacity) }, onFinish = { fin() }) {
                    sc(layer.copy(transform = t.copy(opacity = it)))
                }
            }
            "move" -> {
                SliderRow("شفافیت", t.opacity, 0.0..1.0, hasKeyframe("opacity"), { toggleKeyframe("opacity", t.opacity) }, onFinish = { fin() }) {
                    sc(layer.copy(transform = t.copy(opacity = it)))
                }
                SliderRow("مقیاس", t.scaleX, 0.1..3.0, hasKeyframe("scaleX"), { toggleKeyframe("scaleX", t.scaleX) }, onFinish = { fin() }) {
                    sc(layer.copy(transform = t.copy(scaleX = it, scaleY = it)))
                }
                SliderRow("چرخش", t.rotation, -180.0..180.0, hasKeyframe("rotation"), { toggleKeyframe("rotation", t.rotation) }, onFinish = { fin() }) {
                    sc(layer.copy(transform = t.copy(rotation = it)))
                }
                SliderRow("موقعیت X", t.x, 0.0..projW.toDouble(), hasKeyframe("x"), { toggleKeyframe("x", t.x) }, onFinish = { fin() }) {
                    sc(layer.copy(transform = t.copy(x = it)))
                }
                SliderRow("موقعیت Y", t.y, 0.0..projH.toDouble(), hasKeyframe("y"), { toggleKeyframe("y", t.y) }, onFinish = { fin() }) {
                    sc(layer.copy(transform = t.copy(y = it)))
                }
                // ماسک (clip)
                Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(top = 8.dp)) {
                    Text("ماسک", color = Alight.Text2, modifier = Modifier.width(64.dp))
                    for ((label, value) in listOf("هیچ" to "none", "زیرین" to "below", "برعکس" to "belowInv")) {
                        val active = layer.clip == value
                        Box(
                            modifier = Modifier
                                .padding(end = 8.dp)
                                .clip(RoundedCornerShape(12.dp))
                                .background(if (active) Alight.Mint else Alight.Surface4)
                                .clickable { onChange(layer.copy(clip = value)) }
                                .padding(horizontal = 12.dp, vertical = 6.dp),
                        ) {
                            Text(label, color = if (active) Color.Black else Alight.Text)
                        }
                    }
                }
            }
            "text" -> {
                val spec = layer.text
                if (spec != null) {
                    ColorRow("رنگ متن", spec.color) { c -> onChange(layer.copy(text = spec.copy(color = c))) }
                    SliderRow("اندازه", spec.size, 12.0..200.0, false, {}, onFinish = { fin() }) {
                        sc(layer.copy(text = spec.copy(size = it)))
                    }
                    Text(
                        "ویرایش متن",
                        color = Alight.Mint,
                        modifier = Modifier.clickable { textDraft = layer.text?.content ?: ""; textEditOpen = true }.padding(vertical = 8.dp),
                    )
                }
            }
            "camera" -> {
                val spec = layer.camera
                if (spec != null) {
                    SliderRow("بزرگنمایی", spec.zoom, 0.5..4.0, false, {}, onFinish = { fin() }) {
                        sc(layer.copy(camera = spec.copy(zoom = it)))
                    }
                }
            }
            "shape" -> {
                val spec = layer.shape
                if (spec != null) {
                    LazyVerticalGrid(
                        columns = GridCells.Fixed(4),
                        modifier = Modifier.height(140.dp),
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        items(SHAPE_KINDS) { kind ->
                            AddTile(SHAPE_NAMES_FA[kind] ?: kind, Alight.Pink) {
                                onChange(layer.copy(shape = spec.copy(kind = kind)))
                            }
                        }
                    }
                }
            }
            "points" -> {
                // ویرایش نقطه‌ها (مثل fragment_edit_points2، بدون ترک‌پد صحنه در این قدم)
                if (layer.type == "draw" && layer.strokes.isNotEmpty()) {
                    // نقطهٔ انتخاب‌شده در EditorScreen نگه داشته می‌شود تا
                    // ترک‌پد صحنه و این پنل یک انتخاب مشترک داشته باشند.
                    val strokeIdx = pointStroke
                    val pointIdx = pointPoint
                    val st = layer.strokes[strokeIdx.coerceIn(0, layer.strokes.size - 1)]
                    val pts = st.points
                    val sel = pts.getOrNull(pointIdx.coerceIn(0, maxOf(0, pts.size - 1)))
                    Row(
                        modifier = Modifier.horizontalScroll(rememberScrollState()).padding(top = 8.dp),
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        for (i in layer.strokes.indices) {
                            PanelButton("خط ${i + 1}", i == strokeIdx) { onPointSelect?.invoke(i, 0) }
                        }
                    }
                    Row(
                        modifier = Modifier.horizontalScroll(rememberScrollState()).padding(top = 8.dp),
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        for (i in pts.indices) {
                            PanelButton("${i + 1}", i == pointIdx) { onPointSelect?.invoke(strokeIdx, i) }
                        }
                    }
                    if (sel != null) {
                        SliderRow("نقطه X", sel.x, (-projW / 2.0)..(projW / 2.0), false, {}, onFinish = { fin() }) { v ->
                            val np = pts.mapIndexed { pi, p -> if (pi == pointIdx) p.copy(x = v) else p }
                            sc(layer.copy(strokes = layer.strokes.mapIndexed { si, s -> if (si == strokeIdx) s.copy(points = np) else s }))
                        }
                        SliderRow("نقطه Y", sel.y, (-projH / 2.0)..(projH / 2.0), false, {}, onFinish = { fin() }) { v ->
                            val np = pts.mapIndexed { pi, p -> if (pi == pointIdx) p.copy(y = v) else p }
                            sc(layer.copy(strokes = layer.strokes.mapIndexed { si, s -> if (si == strokeIdx) s.copy(points = np) else s }))
                        }
                    }
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.padding(top = 8.dp)) {
                        PanelButton("＋ نقطه", pts.size >= 2) {
                            val i = pointIdx.coerceIn(0, pts.size - 1)
                            val a = pts[i]
                            val b = pts.getOrNull(i + 1) ?: StrokePoint(a.x + 10.0, a.y + 10.0)
                            val mid = StrokePoint((a.x + b.x) / 2.0, (a.y + b.y) / 2.0)
                            val np = pts.toMutableList().apply { add(i + 1, mid) }
                            onChange(layer.copy(strokes = layer.strokes.mapIndexed { si, s -> if (si == strokeIdx) s.copy(points = np) else s }))
                            onPointSelect?.invoke(strokeIdx, i + 1)
                        }
                        PanelButton("− نقطه", pts.size > 2) {
                            val np = pts.toMutableList().apply { removeAt(pointIdx.coerceIn(0, pts.size - 1)) }
                            onChange(layer.copy(strokes = layer.strokes.mapIndexed { si, s -> if (si == strokeIdx) s.copy(points = np) else s }))
                            onPointSelect?.invoke(strokeIdx, maxOf(0, pointIdx - 1))
                        }
                    }
                } else {
                    Text("این لایه نقطه ندارد", color = Alight.Text2, modifier = Modifier.padding(top = 8.dp))
                }
            }
            "presets" -> {
                Row(
                    modifier = Modifier.horizontalScroll(rememberScrollState()).padding(top = 8.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    for ((name, refs) in PRESETS) {
                        PanelButton(name, true) {
                            onChange(layer.copy(effects = layer.effects + refs))
                        }
                    }
                }
            }
            "effects" -> {
                EffectSection(layer, time, onChange, onPreview, onFinish)
            }
            null -> {}
        }
    }

    if (textEditOpen) {
        AlertDialog(
            onDismissRequest = { textEditOpen = false },
            title = { Text("ویرایش متن", color = Alight.Text) },
            text = {
                TextField(
                    value = textDraft,
                    onValueChange = { textDraft = it },
                    modifier = Modifier.fillMaxWidth(),
                )
            },
            confirmButton = {
                TextButton(onClick = {
                    val spec = layer.text
                    if (spec != null) onChange(layer.copy(text = spec.copy(content = textDraft)))
                    textEditOpen = false
                }) { Text("ذخیره", color = Alight.Mint) }
            },
            dismissButton = {
                TextButton(onClick = { textEditOpen = false }) { Text("لغو", color = Alight.Text2) }
            },
            containerColor = Alight.Surface1,
        )
    }
}

/** بخش افکت‌های لایه: فهرست افکت‌های اعمال‌شده + اسلایدر پارامترها + افزودن افکت. */
@Composable
private fun EffectSection(
    layer: Layer,
    time: Double,
    onChange: (Layer) -> Unit,
    onPreview: ((Layer) -> Unit)? = null,
    onFinish: (() -> Unit)? = null,
) {
    /** تغییر زندهٔ اسلایدر (بدون تاریخچه)؛ پایان کشیدن یک ورودی ثبت می‌کند. */
    fun sc(changed: Layer) {
        if (onPreview != null) onPreview(changed) else onChange(changed)
    }

    fun fin() {
        onFinish?.invoke()
    }
    var pickerOpen by remember { mutableStateOf(false) }

    Column {
        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(top = 4.dp)) {
            Text("افکت‌ها", color = Alight.Text, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
            Text(
                "＋ افزودن",
                color = Alight.Mint,
                modifier = Modifier.clickable { pickerOpen = true }.padding(8.dp),
            )
        }
        for ((idx, fx) in layer.effects.withIndex()) {
            val def = Effects.byId(fx.id) ?: continue
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    def.name,
                    color = if (fx.enabled) Alight.Text else Alight.Text2,
                    modifier = Modifier.weight(1f).clickable {
                        val next = layer.effects.toMutableList()
                        next[idx] = fx.copy(enabled = !fx.enabled)
                        onChange(layer.copy(effects = next))
                    },
                )
                IconButton(onClick = {
                    onChange(layer.copy(effects = layer.effects.filterIndexed { i, _ -> i != idx }))
                }) {
                    Icon(Icons.Filled.Delete, null, tint = Alight.Text2)
                }
            }
            if (fx.enabled) {
                for ((key, pd) in def.params) {
                    if (pd.type == "n") {
                        val cur = fx.params[key] ?: pd.defNum
                        // پارامتر عددی با کی‌فریم (همان effectParamsAt وب)
                        val kfList = fx.keyframes[key].orEmpty()
                        val shown = if (kfList.isNotEmpty()) valueAt(kfList, time, cur) else cur
                        SliderRow(pd.label, shown, pd.min..pd.max, false, {}, onFinish = { fin() }) { v ->
                            val next = layer.effects.toMutableList()
                            next[idx] = fx.copy(params = fx.params + (key to v))
                            sc(layer.copy(effects = next))
                        }
                    } else if (pd.type == "c") {
                        val cur = fx.textParams[key] ?: pd.defStr
                        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(top = 4.dp)) {
                            Text(pd.label, color = Alight.Text2, modifier = Modifier.width(64.dp))
                            for (sw in listOf("#FFFFFF", "#000000", "#F16586", "#E01445", "#00FFA8", "#69FC97", "#F9DE66", "#4A9EFF", "#9B7BFF")) {
                                val active = cur.equals(sw, ignoreCase = true)
                                Box(
                                    modifier = Modifier
                                        .padding(end = 6.dp)
                                        .size(if (active) 26.dp else 22.dp)
                                        .clip(CircleShape)
                                        .background(hexColor(sw))
                                        .border(if (active) 2.dp else 1.dp, if (active) Alight.Mint else Alight.Surface4, CircleShape)
                                        .clickable {
                                            val next = layer.effects.toMutableList()
                                            next[idx] = fx.copy(textParams = fx.textParams + (key to sw))
                                            onChange(layer.copy(effects = next))
                                        },
                                )
                            }
                        }
                    }
                }
            }
        }
    }

    if (pickerOpen) {
        EffectPicker(
            onPick = { id ->
                val def = Effects.byId(id) ?: return@EffectPicker
                val params = def.params.filter { it.value.type == "n" }.mapValues { it.value.defNum }
                val tp = def.params.filter { it.value.type == "c" }.mapValues { it.value.defStr }
                onChange(layer.copy(effects = layer.effects + EffectRef(id = id, params = params, textParams = tp)))
                pickerOpen = false
            },
            onClose = { pickerOpen = false },
        )
    }
}

/** انتخاب‌کنندهٔ افکت: فهرست ۲۹۱ افکت دسته‌بندی‌شده. */
@Composable
private fun EffectPicker(
    onPick: (String) -> Unit,
    onClose: () -> Unit,
) {
    val scroll = rememberScrollState()
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Color(0xCC0C0D13))
            .clickable { onClose() },
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(scroll)
                .padding(16.dp),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("افزودن افکت", color = Alight.Text, fontWeight = FontWeight.Bold, fontSize = 18.sp, modifier = Modifier.weight(1f))
                IconButton(onClick = onClose) { Icon(Icons.Filled.Close, null, tint = Alight.Text) }
            }
            for (cat in Effects.CATS) {
                Text(cat, color = Alight.Mint, fontWeight = FontWeight.Bold, modifier = Modifier.padding(top = 12.dp, bottom = 4.dp))
                val items = Effects.byCat(cat)
                // شبکهٔ ۳ ستونه با FlowRow
                var row = mutableListOf<EffectDef>()
                for (fx in items) {
                    row.add(fx)
                    if (row.size == 3) {
                        EffectChipRow(row, onPick)
                        row = mutableListOf()
                    }
                }
                if (row.isNotEmpty()) EffectChipRow(row, onPick)
            }
            Spacer(modifier = Modifier.height(24.dp))
        }
    }
}

@Composable
private fun EffectChipRow(row: List<EffectDef>, onPick: (String) -> Unit) {
    Row(modifier = Modifier.fillMaxWidth().padding(bottom = 6.dp)) {
        for (fx in row) {
            Box(
                modifier = Modifier
                    .weight(1f)
                    .padding(end = 6.dp)
                    .clip(RoundedCornerShape(8.dp))
                    .background(Alight.Surface4)
                    .clickable { onPick(fx.id) }
                    .padding(horizontal = 8.dp, vertical = 10.dp),
            ) {
                Text(fx.name, color = Alight.Text, fontSize = 13.sp)
            }
        }
        // پر کردن ستون‌های خالی
        repeat(3 - row.size) { Spacer(modifier = Modifier.weight(1f).padding(end = 6.dp)) }
    }
}

/** دکمهٔ کوچک ردیف ابزار پنل المان (برش/تقسیم/کپی). */
@Composable
private fun PanelButton(label: String, enabled: Boolean, onClick: () -> Unit) {
    Box(
        modifier = Modifier
            .clip(RoundedCornerShape(6.dp))
            .background(if (enabled) Alight.Surface4 else Alight.Surface)
            .clickable(enabled = enabled, onClick = onClick)
            .padding(horizontal = 12.dp, vertical = 8.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(label, color = if (enabled) Alight.Text else Alight.TextDim)
    }
}

/** ردیف سوئیچ رنگ (پرکردن/حاشیه/رنگ متن) — همان swatchهای EffectSection. */
@Composable
private fun ColorRow(label: String, selected: String?, onPick: (String) -> Unit) {
    Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(top = 4.dp)) {
        Text(label, color = Alight.Text2, modifier = Modifier.width(64.dp))
        for (sw in listOf("#FFFFFF", "#000000", "#F16586", "#E01445", "#00FFA8", "#69FC97", "#F9DE66", "#4A9EFF", "#9B7BFF")) {
            val active = selected.equals(sw, ignoreCase = true)
            Box(
                modifier = Modifier
                    .padding(end = 6.dp)
                    .size(if (active) 26.dp else 22.dp)
                    .clip(CircleShape)
                    .background(hexColor(sw))
                    .border(if (active) 2.dp else 1.dp, if (active) Alight.Mint else Alight.Surface4, CircleShape)
                    .clickable { onPick(sw) },
            )
        }
    }
}

@Composable
private fun SliderRow(
    label: String,
    value: Double,
    range: ClosedFloatingPointRange<Double>,
    hasKf: Boolean,
    onKf: () -> Unit,
    // ترتیب مهم: onChange باید آخرین پارامتر باشد تا لامبدای دنباله‌ای
    // در فراخوانی‌ها به آن بچسبد، نه به onFinish.
    onFinish: () -> Unit = {},
    onChange: (Double) -> Unit,
) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Text(label, color = Alight.Text2, modifier = Modifier.width(64.dp))
        Slider(
            value = value.toFloat(),
            onValueChange = { onChange(it.toDouble()) },
            onValueChangeFinished = onFinish,
            valueRange = range.start.toFloat()..range.endInclusive.toFloat(),
            modifier = Modifier.weight(1f),
        )
        Text("%.2f".format(value), color = Alight.Text, modifier = Modifier.width(48.dp))
        // دکمهٔ کی‌فریم (لوزی) — نعنایی یعنی در این زمان کی‌فریم دارد
        Box(
            modifier = Modifier
                .size(28.dp)
                .clickable { onKf() },
            contentAlignment = Alignment.Center,
        ) {
            Box(
                modifier = Modifier
                    .size(10.dp)
                    .rotate(45f)
                    .background(if (hasKf) Alight.Mint else Alight.Surface4, RoundedCornerShape(2.dp)),
            )
        }
    }
}

/**
 * پاپ‌آپ افزودن — از activity_edit_addpopup دیکدشده (۲۵۱dp):
 * ردیف ۵ تب ۵۸dp (شکل/رسانه/صدا/ابژه/قالب‌ها) + ستون quick-add ۵۸dp
 * (دست‌آزاد/وکتور/متن + بستن ۵۰dp)؛ محتوای هر تب زیر تب‌ها.
 */
@Composable
private fun AddSheet(
    onShape: (String, String) -> Unit,
    onText: () -> Unit,
    onImage: () -> Unit,
    onVideo: () -> Unit,
    onAudio: () -> Unit,
    onLrc: () -> Unit,
    onCamera: () -> Unit,
    onNull: () -> Unit,
    onEmptyGroup: () -> Unit,
    onElements: () -> Unit,
    onTemplate: () -> Unit,
    onFreehand: () -> Unit,
    onVector: () -> Unit,
    onClose: () -> Unit,
) {
    var tab by remember { mutableStateOf("shape") }
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .height(251.dp)
            .background(Alight.Surface9),
    ) {
        Column(modifier = Modifier.weight(1f)) {
            // ردیف تب‌ها — ۵۸dp
            Row(modifier = Modifier.fillMaxWidth().height(58.dp)) {
                AddTab("shape", "شکل", Icons.Filled.Category, tab) { tab = it }
                AddTab("media", "رسانه", Icons.Filled.Image, tab) { tab = it }
                AddTab("audio", "صدا", Icons.Filled.Audiotrack, tab) { tab = it }
                AddTab("object", "ابژه", Icons.Filled.Widgets, tab) { tab = it }
                AddTab("templates", "قالب‌ها", Icons.Filled.Dashboard, tab) { tab = it }
            }
            // محتوای تب — ۱۹۳dp
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .weight(1f)
                    .background(Alight.Surface9)
                    .padding(9.dp),
            ) {
                when (tab) {
                    "shape" -> LazyVerticalGrid(
                        columns = GridCells.Fixed(4),
                        modifier = Modifier.fillMaxSize(),
                        horizontalArrangement = Arrangement.spacedBy(9.dp),
                        verticalArrangement = Arrangement.spacedBy(9.dp),
                    ) {
                        items(SHAPE_KINDS) { kind ->
                            AddTile(SHAPE_NAMES_FA[kind] ?: kind, Alight.Pink) { onShape(kind, "#F16586") }
                        }
                    }
                    "media" -> Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        AddTile("تصویر", Alight.Blue) { onImage() }
                        AddTile("ویدیو", Alight.Purple) { onVideo() }
                        Text(
                            "از گالری دستگاه\nانتخاب می‌شود",
                            color = Alight.Text2,
                            modifier = Modifier.padding(start = 4.dp),
                        )
                    }
                    "audio" -> Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        AddTile("صدا", Alight.Mint) { onAudio() }
                        AddTile("شعر (LRC)", Alight.Yellow) { onLrc() }
                    }
                    "object" -> Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                            AddTile("دوربین", Alight.Orange) { onCamera() }
                            AddTile("نال", Alight.Surface6) { onNull() }
                        }
                        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                            AddTile("گروه خالی", Alight.Green) { onEmptyGroup() }
                            AddTile("المان نمونه", Alight.Purple) { onElements() }
                        }
                    }
                    "templates" -> Column {
                        Text("قالب نمایش", color = Alight.Text, fontWeight = FontWeight.Bold)
                        Text("۴ لایه • ۱۰ ثانیه — حلقه، عنوان، زیرنویس", color = Alight.Text2)
                        Spacer(modifier = Modifier.height(8.dp))
                        Text(
                            "افزودن به پروژه",
                            color = Alight.Mint,
                            fontWeight = FontWeight.Bold,
                            modifier = Modifier
                                .clip(RoundedCornerShape(8.dp))
                                .background(Alight.Surface4)
                                .clickable { onTemplate() }
                                .padding(horizontal = 16.dp, vertical = 10.dp),
                        )
                    }
                }
            }
        }
        // جداکنندهٔ ۱dp بین تب‌ها و ستون quick-add
        Box(modifier = Modifier.width(1.dp).fillMaxHeight().background(Alight.Surface))
        // ستون quick-add — ۵۸dp
        Column(modifier = Modifier.width(58.dp).fillMaxHeight()) {
            QuickTile("دست‌آزاد", Icons.Filled.Brush, Modifier.weight(1f)) { onFreehand() }
            QuickTile("وکتور", Icons.Filled.Timeline, Modifier.weight(1f)) { onVector() }
            QuickTile("متن", Icons.Filled.TextFields, Modifier.height(58.dp)) { onText() }
            QuickTile("بستن", Icons.Filled.Close, Modifier.height(50.dp)) { onClose() }
        }
    }
}

/** یک تب پاپ‌آپ افزودن: آیکون + برچسب ۹sp؛ فعال = نعنایی. */
@Composable
private fun RowScope.AddTab(id: String, label: String, icon: ImageVector, current: String, onPick: (String) -> Unit) {
    val active = id == current
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Bottom,
        modifier = Modifier
            .weight(1f)
            .fillMaxHeight()
            .clickable { onPick(id) }
            .padding(bottom = 1.dp),
    ) {
        Icon(icon, contentDescription = label, tint = if (active) Alight.Mint else Alight.Text, modifier = Modifier.size(22.dp))
        Text(label, color = if (active) Alight.Mint else Alight.Text, fontWeight = FontWeight.Bold, fontSize = 9.sp)
    }
}

/** یک خانهٔ ستون quick-add پاپ‌آپ افزودن (۵۸dp عرض). */
@Composable
private fun QuickTile(label: String, icon: ImageVector, modifier: Modifier, onClick: () -> Unit) {
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Bottom,
        modifier = modifier
            .fillMaxWidth()
            .clickable { onClick() },
    ) {
        Icon(icon, contentDescription = label, tint = Alight.Text, modifier = Modifier.size(22.dp))
        Text(label, color = Alight.Text, fontWeight = FontWeight.Bold, fontSize = 9.sp, modifier = Modifier.padding(bottom = 1.dp))
    }
}

@Composable
private fun AddTile(label: String, color: Color, onClick: () -> Unit) {
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        modifier = Modifier.clickable { onClick() },
    ) {
        Box(
            modifier = Modifier
                .size(58.dp)
                .clip(RoundedCornerShape(10.dp))
                .background(color.copy(alpha = 0.25f)),
            contentAlignment = Alignment.Center,
        ) {
            Box(modifier = Modifier.size(28.dp).background(color, RoundedCornerShape(6.dp)))
        }
        Spacer(modifier = Modifier.height(4.dp))
        Text(label, color = Alight.Text2)
    }
}
