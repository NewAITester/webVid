package com.zurvanecho.lyricstudio.motion.ui.home

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Menu
import androidx.compose.material.icons.filled.Movie
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.School
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.ScrollableTabRow
import androidx.compose.material3.Tab
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.zurvanecho.lyricstudio.motion.model.Project
import com.zurvanecho.lyricstudio.motion.ui.editor.ProjectPreview
import com.zurvanecho.lyricstudio.motion.ui.theme.Alight

/**
 * خانه — همان چیدمان Alight: نوار بالا ۵۷dp (منو | لوگوی وسط | آموزش + آواتار)،
 * تب‌ها (خانه/رتبه‌بندی/آموزش/پروژه‌ها/قالب‌ها)، شبکهٔ پروژه‌ها.
 * U1 (REA): دیگر پروژهٔ نمایشیِ اجباری نیست؛ خانهٔ خالی حالت خالی دارد و
 * کارت «نمونه» فقط با خواست کاربر نمونه را می‌سازد.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HomeScreen(
    projects: List<Project>,
    onOpen: (Project) -> Unit,
    onNew: (Project) -> Unit,
    onSample: () -> Unit,
    onDelete: (Project) -> Unit,
) {
    var tab by remember { mutableIntStateOf(0) }
    var showCreate by remember { mutableStateOf(false) }
    var deleteTarget by remember { mutableStateOf<Project?>(null) }
    val tabs = listOf("خانه", "رتبه‌بندی", "آموزش", "پروژه‌ها", "قالب‌ها")
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(Alight.SurfaceDeep),
    ) {
        // نوار بالا — ۵۷dp
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .height(57.dp)
                .background(Alight.Surface)
                .padding(horizontal = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            IconButton(onClick = {}) {
                Icon(Icons.Filled.Menu, contentDescription = "منو", tint = Alight.Text)
            }
            Spacer(modifier = Modifier.weight(1f))
            Text(
                "LyricStudio",
                color = Alight.Text,
                fontWeight = FontWeight.Black,
                style = androidx.compose.material3.MaterialTheme.typography.titleLarge,
            )
            Spacer(modifier = Modifier.weight(1f))
            IconButton(onClick = {}) {
                Icon(Icons.Filled.School, contentDescription = "آموزش", tint = Alight.Text2)
            }
            Box(
                modifier = Modifier
                    .size(32.dp)
                    .clip(CircleShape)
                    .background(Alight.Pink),
                contentAlignment = Alignment.Center,
            ) {
                Text("S", color = Alight.Text, fontWeight = FontWeight.Black)
            }
            Spacer(modifier = Modifier.width(4.dp))
        }
        ScrollableTabRow(
            selectedTabIndex = tab,
            containerColor = Alight.SurfaceDeep,
            contentColor = Alight.Text,
            edgePadding = 12.dp,
        ) {
            tabs.forEachIndexed { i, t ->
                Tab(
                    selected = tab == i,
                    onClick = { tab = i },
                    text = { Text(t, color = if (tab == i) Alight.Text else Alight.TextDim) },
                )
            }
        }
        if (projects.isEmpty()) {
            // حالت خالی — به‌جای پروژهٔ نمایشیِ اجباری
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(24.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.Center,
            ) {
                Icon(Icons.Filled.Movie, contentDescription = null, tint = Alight.TextDim, modifier = Modifier.size(64.dp))
                Spacer(modifier = Modifier.height(16.dp))
                Text("هنوز پروژه‌ای نداری", color = Alight.Text, fontWeight = FontWeight.Bold, style = androidx.compose.material3.MaterialTheme.typography.titleMedium)
                Spacer(modifier = Modifier.height(8.dp))
                Text(
                    "یه پروژهٔ تازه بساز و ویدیوت رو شروع کن — یا نمونه رو باز کن تا ببینی چی کار می‌کنه.",
                    color = Alight.TextDim,
                    style = androidx.compose.material3.MaterialTheme.typography.bodyMedium,
                )
                Spacer(modifier = Modifier.height(24.dp))
                Button(
                    onClick = { showCreate = true },
                    colors = ButtonDefaults.buttonColors(containerColor = Alight.Mint, contentColor = androidx.compose.ui.graphics.Color.Black),
                ) {
                    Icon(Icons.Filled.Add, contentDescription = null)
                    Spacer(modifier = Modifier.width(8.dp))
                    Text("ساختن اولین پروژه", fontWeight = FontWeight.Bold)
                }
                Spacer(modifier = Modifier.height(12.dp))
                TextButton(onClick = onSample) {
                    Text("باز کردن پروژهٔ نمونه", color = Alight.Mint)
                }
            }
        } else {
            LazyVerticalGrid(
                columns = GridCells.Fixed(2),
                contentPadding = PaddingValues(12.dp),
                horizontalArrangement = Arrangement.spacedBy(12.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp),
                modifier = Modifier.fillMaxSize(),
            ) {
                item {
                    // کارت «پروژهٔ تازه»
                    Column(
                        modifier = Modifier
                            .clip(RoundedCornerShape(10.dp))
                            .background(Alight.Surface1)
                            .clickable { showCreate = true }
                            .padding(bottom = 8.dp),
                    ) {
                        Box(
                            modifier = Modifier
                                .fillMaxWidth()
                                .aspectRatio(9f / 16f),
                            contentAlignment = Alignment.Center,
                        ) {
                            Icon(Icons.Filled.Add, contentDescription = null, tint = Alight.Pink, modifier = Modifier.size(48.dp))
                        }
                        Text(
                            "پروژهٔ تازه",
                            color = Alight.Text,
                            modifier = Modifier.padding(start = 8.dp, top = 4.dp),
                        )
                        Text(
                            "۹:۱۶ • ۳۰ فریم",
                            color = Alight.TextDim,
                            style = androidx.compose.material3.MaterialTheme.typography.labelMedium,
                            modifier = Modifier.padding(start = 8.dp),
                        )
                    }
                }
                items(projects) { p ->
                    ProjectCard(p, onOpen, onLongPress = { deleteTarget = p })
                }
            }
        }
    }
    // شیت ساخت پروژه
    if (showCreate) {
        ModalBottomSheet(
            onDismissRequest = { showCreate = false },
            sheetState = sheetState,
            containerColor = Alight.Surface,
        ) {
            CreateProjectSheet(
                onCreate = { p ->
                    showCreate = false
                    onNew(p)
                },
                onCancel = { showCreate = false },
            )
        }
    }
    // تأیید حذف
    deleteTarget?.let { p ->
        AlertDialog(
            onDismissRequest = { deleteTarget = null },
            title = { Text("حذف پروژه", color = Alight.Text) },
            text = { Text("«${p.name}» حذف شود؟", color = Alight.Text2) },
            confirmButton = {
                TextButton(onClick = { onDelete(p); deleteTarget = null }) {
                    Text("حذف", color = Alight.Pink)
                }
            },
            dismissButton = {
                TextButton(onClick = { deleteTarget = null }) {
                    Text("لغو", color = Alight.Text)
                }
            },
            containerColor = Alight.Surface,
        )
    }
}

@Composable
private fun ProjectCard(p: Project, onOpen: (Project) -> Unit, onLongPress: () -> Unit) {
    Column(
        modifier = Modifier
            .clip(RoundedCornerShape(10.dp))
            .background(Alight.Surface1)
            .combinedClickable(onClick = { onOpen(p) }, onLongClick = onLongPress)
            .padding(bottom = 8.dp),
    ) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .aspectRatio(9f / 16f)
                .clip(RoundedCornerShape(10.dp)),
        ) {
            ProjectPreview(project = p, time = 0.5, modifier = Modifier.fillMaxSize())
            Box(
                modifier = Modifier
                    .align(Alignment.Center)
                    .size(44.dp)
                    .clip(CircleShape)
                    .background(Alight.SurfaceDeep.copy(alpha = 0.55f)),
                contentAlignment = Alignment.Center,
            ) {
                Icon(Icons.Filled.PlayArrow, contentDescription = null, tint = Alight.Text, modifier = Modifier.size(28.dp))
            }
        }
        Text(
            p.name,
            color = Alight.Text,
            modifier = Modifier.padding(start = 8.dp, top = 6.dp),
        )
        Text(
            "${p.duration.toInt()} ثانیه • ${p.layers.size} لایه",
            color = Alight.TextDim,
            style = androidx.compose.material3.MaterialTheme.typography.labelMedium,
            modifier = Modifier.padding(start = 8.dp),
        )
    }
}
