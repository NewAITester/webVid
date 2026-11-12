package com.zurvanecho.lyricstudio.motion.ui.editor

import java.io.File
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.Slider
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import com.zurvanecho.lyricstudio.motion.export.ExportPlan
import com.zurvanecho.lyricstudio.motion.export.exportPlan
import com.zurvanecho.lyricstudio.motion.model.Project
import com.zurvanecho.lyricstudio.motion.ui.theme.Alight
import kotlin.math.roundToInt

/** چیپ گزینهٔ خروجی (فعال = نعنایی). */
@Composable
private fun ExportChip(label: String, active: Boolean, onClick: () -> Unit) {
    Box(
        modifier = Modifier
            .clip(RoundedCornerShape(16.dp))
            .background(if (active) Alight.Mint else Alight.Surface4)
            .clickable { onClick() }
            .padding(horizontal = 14.dp, vertical = 8.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(label, color = if (active) Color.Black else Alight.Text)
    }
}

/**
 * پیش‌نمایش خروجی — مثل activity_export_preview آلایت: نوار عنوان ۴۲dp،
 * پیش‌نمایش ویدیو با پخش و نوار جابه‌جایی ۶۲dp، فهرست گزینه‌های خروجی
 * (رزولوشن/فریم/کیفیت/فرمت + برآورد حجم)، و دکمه‌های پایین ۵۷dp
 * (خروجی / اشتراک‌گذاری / بستن) با حالت «در حال آماده‌سازی».
 */
@Composable
fun ExportDialog(
    project: Project,
    time: Double,
    playing: Boolean,
    onPlayPause: () -> Unit,
    onSeek: (Double) -> Unit,
    exporting: Boolean,
    exportProgress: Double,
    exportMsg: String?,
    exportedFile: File?,
    onExport: (ExportPlan) -> Unit,
    onShare: (File) -> Unit,
    onClose: () -> Unit,
) {
    var resIdx by remember { mutableStateOf(0) } // 0 = اندازهٔ پروژه، 1 = 1080 در ضلع بلند
    var fpsIdx by remember { mutableStateOf(when (project.fps) { 24 -> 0; 60 -> 2; else -> 1 }) }
    var qualityIdx by remember { mutableStateOf(0) } // 0 = بالا، 1 = متوسط، 2 = پایین

    val (w, h) = if (resIdx == 0) {
        project.width to project.height
    } else if (project.width >= project.height) {
        1080 to (1080.0 * project.height / project.width).roundToInt()
    } else {
        (1080.0 * project.width / project.height).roundToInt() to 1080
    }
    val fps = listOf(24, 30, 60)[fpsIdx]
    val bitrate = listOf(12.0, 8.0, 5.0)[qualityIdx]
    val plan = exportPlan(project, fps = fps, width = w, height = h, bitrateMbps = bitrate)
    val scroll = rememberScrollState()

    Dialog(
        onDismissRequest = onClose,
        properties = DialogProperties(usePlatformDefaultWidth = false),
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .background(Alight.SurfaceDeep),
        ) {
            // نوار عنوان — ۴۲dp
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(42.dp)
                    .background(Alight.Surface)
                    .padding(horizontal = 4.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                IconButton(onClick = onClose) {
                    Icon(Icons.Filled.Close, null, tint = Alight.Text)
                }
                Text(
                    "پیش‌نمایش خروجی",
                    color = Alight.Text,
                    fontWeight = FontWeight.Bold,
                    modifier = Modifier.weight(1f),
                )
                Text(project.name, color = Alight.Text2)
            }
            Column(
                modifier = Modifier
                    .weight(1f)
                    .verticalScroll(scroll)
                    .padding(12.dp),
            ) {
                // پیش‌نمایش ویدیو
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .aspectRatio(project.width.toFloat() / project.height.toFloat())
                        .clip(RoundedCornerShape(10.dp))
                        .background(Alight.Surface1),
                ) {
                    ProjectPreview(project = project, time = time, modifier = Modifier.fillMaxSize())
                }
                // نوار پایین پیش‌نمایش — ۶۲dp: پخش + جابه‌جایی + ساعت
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(62.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    IconButton(
                        onClick = onPlayPause,
                        modifier = Modifier.padding(end = 4.dp),
                    ) {
                        Icon(
                            if (playing) Icons.Filled.Pause else Icons.Filled.PlayArrow,
                            null,
                            tint = Alight.Text,
                        )
                    }
                    Slider(
                        value = time.toFloat().coerceIn(0f, project.duration.toFloat()),
                        onValueChange = { onSeek(it.toDouble()) },
                        valueRange = 0f..project.duration.toFloat(),
                        modifier = Modifier.weight(1f),
                    )
                    Text(
                        formatTime(time, project.fps),
                        color = Alight.Text2,
                        modifier = Modifier.padding(start = 8.dp),
                    )
                }
                // گزینه‌های خروجی
                Text("رزولوشن", color = Alight.Text, fontWeight = FontWeight.Bold, modifier = Modifier.padding(top = 8.dp))
                Row(
                    modifier = Modifier
                        .horizontalScroll(rememberScrollState())
                        .padding(top = 8.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    ExportChip("${project.width}×${project.height}", resIdx == 0) { resIdx = 0 }
                    ExportChip("${w}×${h} (1080)", resIdx == 1) { resIdx = 1 }
                }
                Text("نرخ فریم", color = Alight.Text, fontWeight = FontWeight.Bold, modifier = Modifier.padding(top = 12.dp))
                Row(
                    modifier = Modifier
                        .horizontalScroll(rememberScrollState())
                        .padding(top = 8.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    for ((i, f) in listOf(24, 30, 60).withIndex()) {
                        ExportChip("$f فریم", fpsIdx == i) { fpsIdx = i }
                    }
                }
                Text("کیفیت", color = Alight.Text, fontWeight = FontWeight.Bold, modifier = Modifier.padding(top = 12.dp))
                Row(
                    modifier = Modifier
                        .horizontalScroll(rememberScrollState())
                        .padding(top = 8.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    for ((i, q) in listOf("بالا", "متوسط", "پایین").withIndex()) {
                        ExportChip(q, qualityIdx == i) { qualityIdx = i }
                    }
                }
                Text(
                    "فرمت: MP4 — H.264 + AAC",
                    color = Alight.Text2,
                    modifier = Modifier.padding(top = 12.dp),
                )
                Text(
                    "${project.duration.toInt()} ثانیه • ${plan.frames} فریم • حدود ${plan.estMB} مگابایت",
                    color = Alight.Text2,
                    fontSize = 13.sp,
                    modifier = Modifier.padding(top = 4.dp),
                )
                Spacer(modifier = Modifier.height(16.dp))
            }
            // دکمه‌های پایین — ۵۷dp
            when {
                exporting -> {
                    // حالت «در حال آماده‌سازی» (مثل loadingProgressHolder آلایت)
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .background(Alight.Surface)
                            .padding(16.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                    ) {
                        CircularProgressIndicator(color = Alight.Mint)
                        Text(
                            "در حال آماده‌سازی…",
                            color = Alight.Text,
                            modifier = Modifier.padding(top = 12.dp),
                        )
                        LinearProgressIndicator(
                            progress = { exportProgress.toFloat().coerceIn(0f, 1f) },
                            color = Alight.Mint,
                            trackColor = Alight.Surface4,
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(top = 12.dp),
                        )
                        Text(
                            "${(exportProgress * 100).toInt()}٪",
                            color = Alight.Text2,
                            modifier = Modifier.padding(top = 8.dp),
                        )
                    }
                }
                exportedFile != null -> {
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .background(Alight.Surface)
                            .padding(12.dp),
                    ) {
                        Text(exportMsg ?: "خروجی آماده شد", color = Alight.Text)
                        Row(
                            horizontalArrangement = Arrangement.spacedBy(12.dp),
                            modifier = Modifier.padding(top = 12.dp),
                        ) {
                            Button(
                                onClick = { onShare(exportedFile) },
                                colors = ButtonDefaults.buttonColors(containerColor = Alight.Mint, contentColor = Color.Black),
                                modifier = Modifier.weight(1f),
                            ) {
                                Text("اشتراک‌گذاری", fontWeight = FontWeight.Bold)
                            }
                            TextButton(
                                onClick = onClose,
                                modifier = Modifier.weight(1f),
                            ) {
                                Text("بستن", color = Alight.Text)
                            }
                        }
                    }
                }
                else -> {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(57.dp)
                            .background(Alight.Surface)
                            .padding(horizontal = 12.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        if (exportMsg != null) {
                            Text(exportMsg, color = Alight.Text2, modifier = Modifier.weight(1f))
                        } else {
                            Spacer(modifier = Modifier.weight(1f))
                        }
                        Button(
                            onClick = { onExport(plan) },
                            colors = ButtonDefaults.buttonColors(containerColor = Alight.Mint, contentColor = Color.Black),
                        ) {
                            Text("خروجی", fontWeight = FontWeight.Bold)
                        }
                        TextButton(onClick = onClose) {
                            Text("بستن", color = Alight.Text)
                        }
                    }
                }
            }
        }
    }
}
