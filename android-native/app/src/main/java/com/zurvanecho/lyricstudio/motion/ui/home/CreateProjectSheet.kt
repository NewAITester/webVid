package com.zurvanecho.lyricstudio.motion.ui.home

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.zurvanecho.lyricstudio.motion.model.ASPECT_RATIOS
import com.zurvanecho.lyricstudio.motion.model.BG_COLORS
import com.zurvanecho.lyricstudio.motion.model.FRAME_RATES
import com.zurvanecho.lyricstudio.motion.model.Project
import com.zurvanecho.lyricstudio.motion.model.RESOLUTIONS
import com.zurvanecho.lyricstudio.motion.model.newProject
import com.zurvanecho.lyricstudio.motion.ui.theme.Alight
import com.zurvanecho.lyricstudio.motion.ui.theme.hexColor

/**
 * شیت «پروژهٔ تازه» — بازسازی create_project_fragment آلایت (از REA):
 * نام، نسبت تصویر (۱۶:۹، ۹:۱۶، ۴:۵، ۱:۱، ۴:۳)، رزولوشن، نرخ فریم، رنگ پس‌زمینه.
 * پروژه خالی ساخته می‌شود (بدون لایهٔ نمایشی) — کاربر خودش محتوا اضافه می‌کند.
 */
@Composable
fun CreateProjectSheet(
    onCreate: (Project) -> Unit,
    onCancel: () -> Unit,
) {
    var name by remember { mutableStateOf("") }
    var aspectIdx by remember { mutableIntStateOf(1) } // پیش‌فرض ۹:۱۶ (عمودی، مثل آلایت)
    var resolution by remember { mutableIntStateOf(720) }
    var fps by remember { mutableIntStateOf(30) }
    var bg by remember { mutableStateOf(BG_COLORS[0]) }

    val aspect = ASPECT_RATIOS[aspectIdx]
    // ابعاد نهایی: نسبت × رزولوشن (ضلع بزرگ = رزولوشن انتخاب‌شده)
    val (w, h) = run {
        val long = resolution
        val short = (resolution.toDouble() * minOf(aspect.w, aspect.h) / maxOf(aspect.w, aspect.h)).toInt()
        if (aspect.w >= aspect.h) long to short else short to long
    }

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 20.dp, vertical = 16.dp),
    ) {
        Text("پروژهٔ تازه", color = Alight.Text, fontWeight = FontWeight.Black, style = androidx.compose.material3.MaterialTheme.typography.titleLarge)
        Spacer(modifier = Modifier.height(16.dp))

        OutlinedTextField(
            value = name,
            onValueChange = { name = it },
            placeholder = { Text("نام پروژه", color = Alight.TextDim) },
            singleLine = true,
            colors = OutlinedTextFieldDefaults.colors(
                focusedTextColor = Alight.Text,
                unfocusedTextColor = Alight.Text,
                focusedBorderColor = Alight.Mint,
                unfocusedBorderColor = Alight.Surface2,
            ),
            modifier = Modifier.fillMaxWidth(),
        )
        Spacer(modifier = Modifier.height(16.dp))

        Text("نسبت تصویر", color = Alight.Text2, style = androidx.compose.material3.MaterialTheme.typography.labelLarge)
        Spacer(modifier = Modifier.height(8.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            ASPECT_RATIOS.forEachIndexed { i, a ->
                Chip(
                    label = a.label,
                    selected = i == aspectIdx,
                    onClick = { aspectIdx = i },
                )
            }
        }
        Spacer(modifier = Modifier.height(16.dp))

        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("رزولوشن", color = Alight.Text2, style = androidx.compose.material3.MaterialTheme.typography.labelLarge, modifier = Modifier.weight(1f))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                RESOLUTIONS.forEach { r ->
                    Chip(
                        label = "${r}p",
                        selected = r == resolution,
                        onClick = { resolution = r },
                    )
                }
            }
        }
        Spacer(modifier = Modifier.height(12.dp))

        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("نرخ فریم", color = Alight.Text2, style = androidx.compose.material3.MaterialTheme.typography.labelLarge, modifier = Modifier.weight(1f))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                FRAME_RATES.forEach { f ->
                    Chip(
                        label = "$f",
                        selected = f == fps,
                        onClick = { fps = f },
                    )
                }
            }
        }
        Spacer(modifier = Modifier.height(16.dp))

        Text("پس‌زمینه", color = Alight.Text2, style = androidx.compose.material3.MaterialTheme.typography.labelLarge)
        Spacer(modifier = Modifier.height(8.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            BG_COLORS.forEach { c ->
                Box(
                    modifier = Modifier
                        .size(36.dp)
                        .clip(CircleShape)
                        .background(hexColor(c))
                        .border(
                            width = if (c == bg) 2.dp else 1.dp,
                            color = if (c == bg) Alight.Mint else Alight.Surface2,
                            shape = CircleShape,
                        )
                        .clickable { bg = c },
                )
            }
        }
        Spacer(modifier = Modifier.height(8.dp))
        Text(
            "$w × $h • $fps فریم‌برثانیه",
            color = Alight.TextDim,
            style = androidx.compose.material3.MaterialTheme.typography.labelMedium,
        )
        Spacer(modifier = Modifier.height(20.dp))

        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Button(
                onClick = onCancel,
                colors = ButtonDefaults.buttonColors(containerColor = Alight.Surface2, contentColor = Alight.Text),
                modifier = Modifier.weight(1f),
            ) {
                Text("لغو")
            }
            Button(
                onClick = {
                    val finalName = name.trim().ifEmpty { "پروژهٔ تازه" }
                    onCreate(newProject(finalName, width = w, height = h, fps = fps, bg = bg))
                },
                colors = ButtonDefaults.buttonColors(containerColor = Alight.Mint, contentColor = Color.Black),
                modifier = Modifier.weight(1f),
            ) {
                Text("ساختن پروژه", fontWeight = FontWeight.Bold)
            }
        }
        Spacer(modifier = Modifier.height(8.dp))
    }
}

@Composable
private fun Chip(label: String, selected: Boolean, onClick: () -> Unit) {
    Box(
        modifier = Modifier
            .clip(RoundedCornerShape(8.dp))
            .background(if (selected) Alight.Mint else Alight.Surface1)
            .border(
                width = 1.dp,
                color = if (selected) Alight.Mint else Alight.Surface2,
                shape = RoundedCornerShape(8.dp),
            )
            .clickable { onClick() }
            .padding(horizontal = 14.dp, vertical = 8.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            label,
            color = if (selected) Color.Black else Alight.Text,
            fontWeight = if (selected) FontWeight.Bold else FontWeight.Normal,
            style = androidx.compose.material3.MaterialTheme.typography.labelLarge,
        )
    }
}
