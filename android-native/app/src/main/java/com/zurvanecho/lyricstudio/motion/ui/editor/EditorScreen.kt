package com.zurvanecho.lyricstudio.motion.ui.editor

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
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
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.GridOn
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Redo
import androidx.compose.material.icons.filled.Share
import androidx.compose.material.icons.filled.SkipNext
import androidx.compose.material.icons.filled.SkipPrevious
import androidx.compose.material.icons.filled.Undo
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Slider
import androidx.compose.material3.Text
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.zurvanecho.lyricstudio.motion.audio.AudioPlayer
import com.zurvanecho.lyricstudio.motion.core.SHAPE_KINDS
import com.zurvanecho.lyricstudio.motion.core.SHAPE_NAMES_FA
import com.zurvanecho.lyricstudio.motion.core.valueAt
import com.zurvanecho.lyricstudio.motion.effects.EffectDef
import com.zurvanecho.lyricstudio.motion.effects.Effects
import com.zurvanecho.lyricstudio.motion.importers.lrcToLayers
import com.zurvanecho.lyricstudio.motion.importers.parseLrc
import com.zurvanecho.lyricstudio.motion.model.AudioSpec
import com.zurvanecho.lyricstudio.motion.model.EffectRef
import com.zurvanecho.lyricstudio.motion.model.Keyframe
import com.zurvanecho.lyricstudio.motion.model.Layer
import com.zurvanecho.lyricstudio.motion.model.Project
import com.zurvanecho.lyricstudio.motion.model.ShapeSpec
import com.zurvanecho.lyricstudio.motion.model.TextSpec
import com.zurvanecho.lyricstudio.motion.model.Transform
import com.zurvanecho.lyricstudio.motion.model.newLayer
import com.zurvanecho.lyricstudio.motion.ui.theme.Alight
import com.zurvanecho.lyricstudio.motion.ui.theme.hexColor
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * ویرایشگر — همان چیدمان Alight: نوار بالا ۴۲dp، نوار پخش ۴۶dp،
 * صحنه + ریل ۵۰dp در لبهٔ راست، تایم‌لاین ۲۸۰dp پایین، دکمهٔ + ۷۳dp،
 * شیت افزودن و پنل بازرس ۲۴۰dp (کی‌فریم، ماسک، ترکیب، گروه).
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
                IconButton(onClick = {}) {
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
                        .height(240.dp),
                )
            }
        }

        // دکمهٔ + شناور — ۷۳dp، بالای تایم‌لاین (و پنل بازرس اگر باز است)
        Box(
            modifier = Modifier
                .align(Alignment.BottomEnd)
                .padding(end = 16.dp, bottom = ((280 + if (selected != null) 240 else 0) + 16).dp)
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
    modifier: Modifier = Modifier,
) {
    val t = layer.transform
    val scroll = rememberScrollState()

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

@Composable
private fun AddSheet(
    onShape: (String, String) -> Unit,
    onText: () -> Unit,
    onImage: () -> Unit,
    onVideo: () -> Unit,
    onAudio: () -> Unit,
    onLrc: () -> Unit,
    onCamera: () -> Unit,
) {
    Column(modifier = Modifier.padding(16.dp)) {
        Text("افزودن", color = Alight.Text, fontWeight = FontWeight.Black)
        Spacer(modifier = Modifier.height(12.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            AddTile("متن", Alight.Text) { onText() }
            AddTile("تصویر", Alight.Blue) { onImage() }
            AddTile("ویدیو", Alight.Purple) { onVideo() }
            AddTile("دوربین", Alight.Orange) { onCamera() }
        }
        Spacer(modifier = Modifier.height(12.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            AddTile("صدا", Alight.Mint) { onAudio() }
            AddTile("شعر (LRC)", Alight.Yellow) { onLrc() }
        }
        Spacer(modifier = Modifier.height(16.dp))
        Text("شکل‌ها", color = Alight.Text2)
        Spacer(modifier = Modifier.height(8.dp))
        LazyVerticalGrid(
            columns = GridCells.Fixed(4),
            modifier = Modifier.height(280.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            items(SHAPE_KINDS) { kind ->
                AddTile(SHAPE_NAMES_FA[kind] ?: kind, Alight.Pink) { onShape(kind, "#F16586") }
            }
        }
        Spacer(modifier = Modifier.height(24.dp))
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
