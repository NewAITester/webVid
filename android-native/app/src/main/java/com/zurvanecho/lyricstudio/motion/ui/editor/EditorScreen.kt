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
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.AddCircle
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Audiotrack
import androidx.compose.material.icons.filled.Brush
import androidx.compose.material.icons.filled.Category
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Dashboard
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.GridOn
import androidx.compose.material.icons.filled.Image
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Redo
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
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Stroke as DrawStroke
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.zurvanecho.lyricstudio.motion.audio.AudioPlayer
import com.zurvanecho.lyricstudio.motion.core.SHAPE_KINDS
import com.zurvanecho.lyricstudio.motion.core.SHAPE_NAMES_FA
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

/**
 * ویرایشگر — همان چیدمان Alight: نوار بالا ۴۲dp، نوار پخش ۴۶dp،
 * صحنه + ریل ۵۰dp در لبهٔ راست، تایم‌لاین ۲۸۰dp پایین، دکمهٔ + ۷۳dp،
 * پاپ‌آپ افزودن (۵ تب + ستون quick-add، از activity_edit_addpopup دیکدشده)
 * و پنل المان ۲۰۰dp (برش/تقسیم/کپی، رنگ و پرکردن، ویرایش متن/شکل، صدا، دوربین).
 */
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

    fun update(p: Project) {
        project = p
        onSave(p)
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
            // نوار بالا — ۴۲dp
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
                Text(project.name, color = Alight.Text, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
                if (exporting) {
                    Text(
                        "${(exportProgress * 100).toInt()}٪",
                        color = Alight.Mint,
                        modifier = Modifier.padding(end = 8.dp),
                    )
                }
                IconButton(onClick = { startExport() }) {
                    Icon(Icons.Filled.Share, contentDescription = "خروجی", tint = Alight.Text)
                }
            }
            // نوار پخش — ۴۶dp
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(46.dp)
                    .background(Alight.Surface1),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceEvenly,
            ) {
                IconButton(onClick = {}) { Icon(Icons.Filled.Undo, null, tint = Alight.TextDim) }
                IconButton(onClick = {}) { Icon(Icons.Filled.Redo, null, tint = Alight.TextDim) }
                IconButton(onClick = { time = maxOf(0.0, time - 1.0 / 30.0) }) { Icon(Icons.Filled.SkipPrevious, null, tint = Alight.Text) }
                IconButton(onClick = { playing = !playing }) {
                    Icon(
                        if (playing) Icons.Filled.Pause else Icons.Filled.PlayArrow,
                        null, tint = Alight.Text, modifier = Modifier.size(30.dp),
                    )
                }
                IconButton(onClick = { time = minOf(project.duration, time + 1.0 / 30.0) }) { Icon(Icons.Filled.SkipNext, null, tint = Alight.Text) }
                IconButton(onClick = {}) { Icon(Icons.Filled.MoreVert, null, tint = Alight.TextDim) }
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
                onSelect = { selectedId = it },
                modifier = Modifier
                    .fillMaxWidth()
                    .height(280.dp),
            )
            // پنل بازرس — ۲۴۰dp (وقتی لایه‌ای انتخاب است)
            if (selected != null) {
                Inspector(
                    layer = selected,
                    time = time,
                    onChange = { changed ->
                        update(project.copy(layers = project.layers.map { if (it.id == changed.id) changed else it }))
                    },
                    onDelete = {
                        update(project.copy(layers = project.layers.filter { it.id != selectedId }))
                        selectedId = null
                    },
                    onClose = { selectedId = null },
                    onSplit = { splitSelected() },
                    onDuplicate = { duplicateSelected() },
                    onTrimStart = { trimSelected(true) },
                    onTrimEnd = { trimSelected(false) },
                    onGroup = {
                        // گروه‌کردن: لایهٔ انتخاب‌شده داخل یک گروه تازه می‌رود
                        val group = newLayer("group", "گروه", selected.start, selected.end).copy(
                            transform = selected.transform,
                            children = listOf(selected.copy(transform = Transform(x = 0.0, y = 0.0))),
                        )
                        update(project.copy(layers = project.layers.map { if (it.id == selected.id) group else it }))
                        selectedId = group.id
                    },
                    onUngroup = {
                        // باز کردن گروه: فرزندان با ترکیب ترنسفورم گروه جای آن می‌نشینند
                        val gt = selected.transform
                        val kids = selected.children.map { ch ->
                            val ct = ch.transform
                            ch.copy(transform = ct.copy(
                                x = ct.x + gt.x,
                                y = ct.y + gt.y,
                                rotation = ct.rotation + gt.rotation,
                                scaleX = ct.scaleX * gt.scaleX,
                                scaleY = ct.scaleY * gt.scaleY,
                                opacity = ct.opacity * gt.opacity,
                            ))
                        }
                        val idx = project.layers.indexOfFirst { it.id == selected.id }
                        val rest = project.layers.toMutableList()
                        rest.removeAt(idx)
                        rest.addAll(idx, kids)
                        update(project.copy(layers = rest))
                        selectedId = kids.firstOrNull()?.id
                    },
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(200.dp),
                )
            }
        }

        // دکمهٔ + شناور — ۷۳dp، بالای تایم‌لاین (و پنل المان اگر باز است)
        Box(
            modifier = Modifier
                .align(Alignment.BottomEnd)
                .padding(end = 16.dp, bottom = ((280 + if (selected != null) 200 else 0) + 16).dp)
                .size(73.dp)
                .clip(CircleShape)
                .background(Alight.Pink)
                .clickable { showAdd = true },
            contentAlignment = Alignment.Center,
        ) {
            Icon(Icons.Filled.Add, null, tint = Alight.Text, modifier = Modifier.size(36.dp))
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

@Composable
private fun Timeline(
    project: Project,
    time: Double,
    selectedId: String?,
    onSelect: (String?) -> Unit,
    modifier: Modifier = Modifier,
) {
    // ۱۰۰dp به ازای هر ثانیه — همان timeline_base_dp_per_sec آلایت
    val pxPerSec = 100.dp
    val scroll = rememberScrollState()
    val trackWidth = (project.duration * 100).dp
    val rows = project.layers.reversed()
    Column(
        modifier = modifier.background(Alight.Surface),
    ) {
        // خط‌کش زمان — سربرگ ۷۰dp ثابت، بقیه با همان اسکرول ردیف‌ها
        Row(modifier = Modifier.fillMaxWidth().height(28.dp)) {
            Spacer(modifier = Modifier.width(70.dp))
            Row(modifier = Modifier.weight(1f).horizontalScroll(scroll)) {
                for (s in 0..project.duration.toInt()) {
                    Box(modifier = Modifier.width(pxPerSec)) {
                        Text(
                            "%d:%02d".format(s / 60, s % 60),
                            color = Alight.TextDim,
                            style = androidx.compose.material3.MaterialTheme.typography.labelSmall,
                        )
                    }
                }
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
                        Box(
                            modifier = Modifier
                                .offset(x = (layer.start * 100).dp)
                                .width(((layer.end - layer.start) * 100).dp)
                                .fillMaxHeight()
                                .padding(vertical = 3.dp)
                                .clip(RoundedCornerShape(4.dp))
                                .background(color.copy(alpha = if (layer.id == selectedId) 1f else 0.75f)),
                        )
                        // نشانگرهای کی‌فریم (لوزی نعنایی) روی ردیف
                        val kfTimes = layer.keyframes.values.flatten().map { it.t }.distinct()
                        for (kt in kfTimes) {
                            Box(
                                modifier = Modifier
                                    .offset(x = (kt * 100).dp - 4.dp, y = 10.dp)
                                    .size(8.dp)
                                    .rotate(45f)
                                    .background(Alight.Mint, RoundedCornerShape(2.dp)),
                            )
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
    modifier: Modifier = Modifier,
) {
    val t = layer.transform
    val scroll = rememberScrollState()
    var textEditOpen by remember { mutableStateOf(false) }
    var textDraft by remember { mutableStateOf("") }
    var shapePickOpen by remember { mutableStateOf(false) }

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
        // ردیف ابزار ویرایش — ردیف اول پنل المان آلایت (fragment_element_edit)
        val inRange = time > layer.start && time < layer.end
        Row(
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            modifier = Modifier.padding(top = 4.dp),
        ) {
            PanelButton("برش ابتدا", inRange) { onTrimStart() }
            PanelButton("تقسیم", inRange) { onSplit() }
            PanelButton("برش انتها", inRange) { onTrimEnd() }
            PanelButton("کپی", true) { onDuplicate() }
        }
        // رنگ و پرکردن / ویرایشِ وابسته به نوع لایه (ردیف دوم و سوم پنل آلایت)
        when (layer.type) {
            "shape" -> {
                val spec = layer.shape
                ColorRow("پرکردن", spec?.fill) { c ->
                    if (spec != null) onChange(layer.copy(shape = spec.copy(fill = c)))
                }
                ColorRow("حاشیه", spec?.stroke) { c ->
                    if (spec != null) onChange(layer.copy(shape = spec.copy(stroke = c)))
                }
                if (spec != null) {
                    SliderRow("ضخامت حاشیه", spec.strokeWidth, 0.0..20.0, false, {}) {
                        onChange(layer.copy(shape = spec.copy(strokeWidth = it)))
                    }
                }
                Text(
                    "ویرایش شکل",
                    color = Alight.Mint,
                    modifier = Modifier.clickable { shapePickOpen = !shapePickOpen }.padding(vertical = 8.dp),
                )
                if (shapePickOpen) {
                    LazyVerticalGrid(
                        columns = GridCells.Fixed(4),
                        modifier = Modifier.height(140.dp),
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        items(SHAPE_KINDS) { kind ->
                            AddTile(SHAPE_NAMES_FA[kind] ?: kind, Alight.Pink) {
                                if (spec != null) onChange(layer.copy(shape = spec.copy(kind = kind)))
                                shapePickOpen = false
                            }
                        }
                    }
                }
            }
            "text" -> {
                val spec = layer.text
                ColorRow("رنگ متن", spec?.color) { c ->
                    if (spec != null) onChange(layer.copy(text = spec.copy(color = c)))
                }
                if (spec != null) {
                    SliderRow("اندازه", spec.size, 12.0..200.0, false, {}) {
                        onChange(layer.copy(text = spec.copy(size = it)))
                    }
                }
                Text(
                    "ویرایش متن",
                    color = Alight.Mint,
                    modifier = Modifier.clickable { textDraft = layer.text?.content ?: ""; textEditOpen = true }.padding(vertical = 8.dp),
                )
            }
            "audio" -> {
                val spec = layer.audio
                if (spec != null) {
                    SliderRow("صدا", spec.volume, 0.0..1.0, false, {}) {
                        onChange(layer.copy(audio = spec.copy(volume = it)))
                    }
                    SliderRow("محو شروع", spec.fadeIn, 0.0..3.0, false, {}) {
                        onChange(layer.copy(audio = spec.copy(fadeIn = it)))
                    }
                    SliderRow("محو پایان", spec.fadeOut, 0.0..3.0, false, {}) {
                        onChange(layer.copy(audio = spec.copy(fadeOut = it)))
                    }
                }
            }
            "camera" -> {
                val spec = layer.camera
                if (spec != null) {
                    SliderRow("بزرگنمایی", spec.zoom, 0.5..4.0, false, {}) {
                        onChange(layer.copy(camera = spec.copy(zoom = it)))
                    }
                }
            }
        }
        SliderRow("شفافیت", t.opacity, 0.0..1.0, hasKeyframe("opacity"), { toggleKeyframe("opacity", t.opacity) }) {
            onChange(layer.copy(transform = t.copy(opacity = it)))
        }
        SliderRow("مقیاس", t.scaleX, 0.1..3.0, hasKeyframe("scaleX"), { toggleKeyframe("scaleX", t.scaleX) }) {
            onChange(layer.copy(transform = t.copy(scaleX = it, scaleY = it)))
        }
        SliderRow("چرخش", t.rotation, -180.0..180.0, hasKeyframe("rotation"), { toggleKeyframe("rotation", t.rotation) }) {
            onChange(layer.copy(transform = t.copy(rotation = it)))
        }
        SliderRow("موقعیت X", t.x, 0.0..720.0, hasKeyframe("x"), { toggleKeyframe("x", t.x) }) {
            onChange(layer.copy(transform = t.copy(x = it)))
        }
        SliderRow("موقعیت Y", t.y, 0.0..1280.0, hasKeyframe("y"), { toggleKeyframe("y", t.y) }) {
            onChange(layer.copy(transform = t.copy(y = it)))
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
        // حالت ترکیب
        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(top = 8.dp)) {
            Text("ترکیب", color = Alight.Text2, modifier = Modifier.width(64.dp))
            for ((label, value) in listOf("عادی" to "normal", "ضرب" to "multiply", "صفحه" to "screen", "هم‌پوشانی" to "overlay")) {
                val active = layer.blend == value
                Box(
                    modifier = Modifier
                        .padding(end = 8.dp)
                        .clip(RoundedCornerShape(12.dp))
                        .background(if (active) Alight.Mint else Alight.Surface4)
                        .clickable { onChange(layer.copy(blend = value)) }
                        .padding(horizontal = 12.dp, vertical = 6.dp),
                ) {
                    Text(label, color = if (active) Color.Black else Alight.Text)
                }
            }
        }
        Spacer(modifier = Modifier.height(8.dp))
        // افکت‌ها (N3)
        EffectSection(layer, time, onChange)
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
) {
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
                        SliderRow(pd.label, shown, pd.min..pd.max, false, {}) { v ->
                            val next = layer.effects.toMutableList()
                            next[idx] = fx.copy(params = fx.params + (key to v))
                            onChange(layer.copy(effects = next))
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
    onChange: (Double) -> Unit,
) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Text(label, color = Alight.Text2, modifier = Modifier.width(64.dp))
        Slider(
            value = value.toFloat(),
            onValueChange = { onChange(it.toDouble()) },
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
