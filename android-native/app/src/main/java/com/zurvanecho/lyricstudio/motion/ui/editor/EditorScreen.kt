package com.zurvanecho.lyricstudio.motion.ui.editor

import androidx.compose.foundation.background
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
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
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
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableDoubleStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.zurvanecho.lyricstudio.motion.model.Layer
import com.zurvanecho.lyricstudio.motion.model.Project
import com.zurvanecho.lyricstudio.motion.model.ShapeSpec
import com.zurvanecho.lyricstudio.motion.model.TextSpec
import com.zurvanecho.lyricstudio.motion.model.Transform
import com.zurvanecho.lyricstudio.motion.model.newLayer
import com.zurvanecho.lyricstudio.motion.ui.theme.Alight
import kotlinx.coroutines.delay

/**
 * ویرایشگر — همان چیدمان Alight: نوار بالا ۴۲dp، نوار پخش ۴۶dp،
 * صحنه + ریل ۵۰dp در لبهٔ راست، تایم‌لاین ۲۸۰dp پایین، دکمهٔ + ۷۳dp،
 * شیت افزودن ۲۵۱dp و پنل پایین ۲۰۰dp.
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
            // پنل بازرس — ۲۰۰dp (وقتی لایه‌ای انتخاب است)
            if (selected != null) {
                Inspector(
                    layer = selected,
                    onChange = { changed ->
                        update(project.copy(layers = project.layers.map { if (it.id == changed.id) changed else it }))
                    },
                    onDelete = {
                        update(project.copy(layers = project.layers.filter { it.id != selectedId }))
                        selectedId = null
                    },
                    onClose = { selectedId = null },
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(200.dp),
                )
            }
        }

        // دکمهٔ + شناور — ۷۳dp، بالای تایم‌لاین (و پنل بازرس اگر باز است)
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
    onChange: (Layer) -> Unit,
    onDelete: () -> Unit,
    onClose: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val t = layer.transform
    Column(
        modifier = modifier
            .background(Alight.Surface1)
            .padding(horizontal = 16.dp, vertical = 8.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(layer.name, color = Alight.Text, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
            IconButton(onClick = onDelete) { Icon(Icons.Filled.Delete, null, tint = Alight.Red) }
            IconButton(onClick = onClose) { Icon(Icons.Filled.Close, null, tint = Alight.Text2) }
        }
        SliderRow("شفافیت", t.opacity, 0.0..1.0) { onChange(layer.copy(transform = t.copy(opacity = it))) }
        SliderRow("مقیاس", t.scaleX, 0.1..3.0) {
            onChange(layer.copy(transform = t.copy(scaleX = it, scaleY = it)))
        }
        SliderRow("چرخش", t.rotation, -180.0..180.0) { onChange(layer.copy(transform = t.copy(rotation = it))) }
    }
}

@Composable
private fun SliderRow(label: String, value: Double, range: ClosedFloatingPointRange<Double>, onChange: (Double) -> Unit) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Text(label, color = Alight.Text2, modifier = Modifier.width(64.dp))
        Slider(
            value = value.toFloat(),
            onValueChange = { onChange(it.toDouble()) },
            valueRange = range.start.toFloat()..range.endInclusive.toFloat(),
            modifier = Modifier.weight(1f),
        )
        Text("%.2f".format(value), color = Alight.Text, modifier = Modifier.width(48.dp))
    }
}

@Composable
private fun AddSheet(onShape: (String, String) -> Unit, onText: () -> Unit) {
    Column(modifier = Modifier.padding(16.dp)) {
        Text("افزودن", color = Alight.Text, fontWeight = FontWeight.Black)
        Spacer(modifier = Modifier.height(12.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            AddTile("مستطیل", Alight.Pink) { onShape("rect", "#F16586") }
            AddTile("دایره", Alight.Mint) { onShape("ellipse", "#00FFA8") }
            AddTile("حلقه", Alight.Yellow) { onShape("ring", "#F9DE66") }
            AddTile("متن", Alight.Text) { onText() }
        }
        Spacer(modifier = Modifier.height(24.dp))
    }
}

@Composable
private fun AddTile(label: String, color: androidx.compose.ui.graphics.Color, onClick: () -> Unit) {
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
