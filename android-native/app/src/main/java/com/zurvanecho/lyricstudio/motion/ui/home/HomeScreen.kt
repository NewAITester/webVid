package com.zurvanecho.lyricstudio.motion.ui.home

import androidx.compose.foundation.ExperimentalFoundationApi
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
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Dashboard
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Folder
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.Menu
import androidx.compose.material.icons.filled.Movie
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.School
import androidx.compose.material.icons.filled.Star
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Divider
import androidx.compose.material3.DrawerValue
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.ModalDrawerSheet
import androidx.compose.material3.ModalNavigationDrawer
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.NavigationDrawerItem
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberDrawerState
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.zurvanecho.lyricstudio.motion.model.Project
import com.zurvanecho.lyricstudio.motion.model.newProject
import com.zurvanecho.lyricstudio.motion.ui.editor.ProjectPreview
import com.zurvanecho.lyricstudio.motion.ui.theme.Alight
import kotlinx.coroutines.launch

/**
 * خانه — همان چیدمان Alight (activity_home_screen.xml): نوار بالا ۵۷dp
 * (منو | لوگوی وسط | آموزش + آواتار ۴۰dp)، محتوای تب، نوار پایین ۷۲dp با
 * ۵ تب (خانه/رتبه‌بندی/آموزش/پروژه‌ها/قالب‌ها)، منوی کناری (NavigationView)،
 * شیت ساخت پروژه ۵۷۵dp. تب‌ها محتوای واقعی خودشان را دارند؛ رتبه‌بندی
 * آنلاینِ آلایت است و در نسخهٔ آزاد (بدون حساب) خالیِ صادقانه نشان داده
 * می‌شود، نه دکمهٔ مرده.
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
    onDeleteAll: () -> Unit,
) {
    var tab by remember { mutableIntStateOf(0) }
    var showCreate by remember { mutableStateOf(false) }
    var deleteTarget by remember { mutableStateOf<Project?>(null) }
    var confirmDeleteAll by remember { mutableStateOf(false) }
    var aboutOpen by remember { mutableStateOf(false) }
    val drawerState = rememberDrawerState(DrawerValue.Closed)
    val scope = rememberCoroutineScope()
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    val tabs = listOf(
        "خانه" to Icons.Filled.Home,
        "رتبه‌بندی" to Icons.Filled.Star,
        "آموزش" to Icons.Filled.School,
        "پروژه‌ها" to Icons.Filled.Folder,
        "قالب‌ها" to Icons.Filled.Dashboard,
    )
    fun closeDrawer() {
        scope.launch { drawerState.close() }
    }

    ModalNavigationDrawer(
        drawerState = drawerState,
        drawerContent = {
            ModalDrawerSheet(drawerContainerColor = Alight.Surface) {
                // سربرگ منو: آواتار + نام + «نسخهٔ آزاد، بدون حساب»
                Column(modifier = Modifier.padding(16.dp)) {
                    Box(
                        modifier = Modifier
                            .size(56.dp)
                            .clip(CircleShape)
                            .background(Alight.Pink),
                        contentAlignment = Alignment.Center,
                    ) {
                        Text("S", color = Alight.Text, fontWeight = FontWeight.Black, style = androidx.compose.material3.MaterialTheme.typography.titleLarge)
                    }
                    Spacer(modifier = Modifier.height(12.dp))
                    Text("spidy", color = Alight.Text, fontWeight = FontWeight.Bold, style = androidx.compose.material3.MaterialTheme.typography.titleMedium)
                    Text("نسخهٔ آزاد • بدون حساب", color = Alight.TextDim, style = androidx.compose.material3.MaterialTheme.typography.bodyMedium)
                }
                Divider(color = Alight.Surface4)
                NavigationDrawerItem(
                    label = { Text("پروژه‌ها", color = Alight.Text) },
                    selected = tab == 3,
                    onClick = { tab = 3; closeDrawer() },
                    icon = { Icon(Icons.Filled.Folder, null, tint = Alight.Text2) },
                )
                NavigationDrawerItem(
                    label = { Text("قالب‌ها", color = Alight.Text) },
                    selected = tab == 4,
                    onClick = { tab = 4; closeDrawer() },
                    icon = { Icon(Icons.Filled.Dashboard, null, tint = Alight.Text2) },
                )
                NavigationDrawerItem(
                    label = { Text("آموزش", color = Alight.Text) },
                    selected = tab == 2,
                    onClick = { tab = 2; closeDrawer() },
                    icon = { Icon(Icons.Filled.School, null, tint = Alight.Text2) },
                )
                NavigationDrawerItem(
                    label = { Text("درباره", color = Alight.Text) },
                    selected = false,
                    onClick = { aboutOpen = true; closeDrawer() },
                    icon = { Icon(Icons.Filled.Info, null, tint = Alight.Text2) },
                )
                NavigationDrawerItem(
                    label = { Text("حذف همهٔ پروژه‌ها", color = Alight.Red) },
                    selected = false,
                    onClick = { confirmDeleteAll = true; closeDrawer() },
                    icon = { Icon(Icons.Filled.Delete, null, tint = Alight.Red) },
                )
            }
        },
    ) {
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
                IconButton(onClick = { scope.launch { drawerState.open() } }) {
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
                IconButton(onClick = { tab = 2 }) {
                    Icon(Icons.Filled.School, contentDescription = "آموزش", tint = Alight.Text2)
                }
                Box(
                    modifier = Modifier
                        .size(40.dp)
                        .clip(CircleShape)
                        .background(Alight.Pink),
                    contentAlignment = Alignment.Center,
                ) {
                    Text("S", color = Alight.Text, fontWeight = FontWeight.Black)
                }
                Spacer(modifier = Modifier.width(4.dp))
            }
            // محتوای تب
            Box(modifier = Modifier.weight(1f)) {
                when (tab) {
                    0 -> HomeTab(projects, onOpen, onSample, onCreate = { showCreate = true })
                    1 -> RankingTab()
                    2 -> TutorialTab()
                    3 -> ProjectsTab(projects, onOpen, onCreate = { showCreate = true }, onSample = onSample, onDelete = { deleteTarget = it })
                    4 -> TemplatesTab(onNew, onSample)
                }
            }
            // نوار پایین — ۷۲dp، ۵ تب
            NavigationBar(
                modifier = Modifier.height(72.dp),
                containerColor = Alight.Surface,
            ) {
                tabs.forEachIndexed { i, (label, icon) ->
                    NavigationBarItem(
                        selected = tab == i,
                        onClick = { tab = i },
                        icon = { Icon(icon, null) },
                        label = { Text(label) },
                        colors = NavigationBarItemDefaults.colors(
                            selectedIconColor = Alight.Mint,
                            selectedTextColor = Alight.Mint,
                            unselectedIconColor = Alight.TextDim,
                            unselectedTextColor = Alight.TextDim,
                            indicatorColor = Alight.Surface4,
                        ),
                    )
                }
            }
        }
    }
    // شیت ساخت پروژه — ۵۷۵dp (مثل createProjectHolder آلایت)
    if (showCreate) {
        ModalBottomSheet(
            onDismissRequest = { showCreate = false },
            sheetState = sheetState,
            containerColor = Alight.Surface,
        ) {
            Box(modifier = Modifier.fillMaxWidth().height(575.dp)) {
                CreateProjectSheet(
                    onCreate = { p ->
                        showCreate = false
                        onNew(p)
                    },
                    onCancel = { showCreate = false },
                )
            }
        }
    }
    // تأیید حذف یک پروژه
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
    // تأیید حذف همهٔ پروژه‌ها
    if (confirmDeleteAll) {
        AlertDialog(
            onDismissRequest = { confirmDeleteAll = false },
            title = { Text("حذف همهٔ پروژه‌ها", color = Alight.Text) },
            text = { Text("همهٔ ${projects.size} پروژه حذف شوند؟ این کار برگشت ندارد.", color = Alight.Text2) },
            confirmButton = {
                TextButton(onClick = { onDeleteAll(); confirmDeleteAll = false }) {
                    Text("حذف همه", color = Alight.Pink)
                }
            },
            dismissButton = {
                TextButton(onClick = { confirmDeleteAll = false }) {
                    Text("لغو", color = Alight.Text)
                }
            },
            containerColor = Alight.Surface,
        )
    }
    // درباره
    if (aboutOpen) {
        AlertDialog(
            onDismissRequest = { aboutOpen = false },
            title = { Text("LyricStudio", color = Alight.Text) },
            text = { Text("نسخهٔ ۱٫۰٫۰ — کپی آزادِ Alight Motion؛ بدون حساب، بدون پرداخت، بدون واترمارک.", color = Alight.Text2) },
            confirmButton = {
                TextButton(onClick = { aboutOpen = false }) {
                    Text("باشه", color = Alight.Mint)
                }
            },
            containerColor = Alight.Surface,
        )
    }
}

/** تب خانه: کارت «ادامه بده» (آخرین پروژه) + میان‌برهای ساخت. */
@Composable
private fun HomeTab(projects: List<Project>, onOpen: (Project) -> Unit, onSample: () -> Unit, onCreate: () -> Unit) {
    if (projects.isEmpty()) {
        EmptyState(onCreate, onSample)
        return
    }
    val latest = projects.first()
    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(16.dp),
    ) {
        Text("ادامه بده", color = Alight.Text, fontWeight = FontWeight.Bold, style = androidx.compose.material3.MaterialTheme.typography.titleMedium)
        Spacer(modifier = Modifier.height(12.dp))
        // کارت بزرگ آخرین پروژه
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(10.dp))
                .background(Alight.Surface1)
                .clickable { onOpen(latest) }
                .padding(bottom = 8.dp),
        ) {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .aspectRatio(latest.width.toFloat() / latest.height.toFloat())
                    .clip(RoundedCornerShape(10.dp)),
            ) {
                ProjectPreview(project = latest, time = 0.5, modifier = Modifier.fillMaxSize())
                Box(
                    modifier = Modifier
                        .align(Alignment.Center)
                        .size(56.dp)
                        .clip(CircleShape)
                        .background(Alight.SurfaceDeep.copy(alpha = 0.55f)),
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(Icons.Filled.PlayArrow, contentDescription = null, tint = Alight.Text, modifier = Modifier.size(32.dp))
                }
            }
            Text(latest.name, color = Alight.Text, fontWeight = FontWeight.Bold, modifier = Modifier.padding(start = 8.dp, top = 6.dp))
            Text(
                "${latest.duration.toInt()} ثانیه • ${latest.layers.size} لایه",
                color = Alight.TextDim,
                style = androidx.compose.material3.MaterialTheme.typography.labelMedium,
                modifier = Modifier.padding(start = 8.dp),
            )
        }
        Spacer(modifier = Modifier.height(16.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Button(
                onClick = onCreate,
                colors = ButtonDefaults.buttonColors(containerColor = Alight.Mint, contentColor = Color.Black),
                modifier = Modifier.weight(1f),
            ) {
                Icon(Icons.Filled.Add, contentDescription = null)
                Spacer(modifier = Modifier.width(8.dp))
                Text("پروژهٔ تازه", fontWeight = FontWeight.Bold)
            }
            Button(
                onClick = onSample,
                colors = ButtonDefaults.buttonColors(containerColor = Alight.Surface4, contentColor = Alight.Text),
                modifier = Modifier.weight(1f),
            ) {
                Text("نمونه", fontWeight = FontWeight.Bold)
            }
        }
    }
}

/** تب رتبه‌بندی: آنلاینِ آلایت است؛ در نسخهٔ آزاد صادقانه خالی نشان داده می‌شود. */
@Composable
private fun RankingTab() {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Icon(Icons.Filled.Star, contentDescription = null, tint = Alight.TextDim, modifier = Modifier.size(64.dp))
        Spacer(modifier = Modifier.height(16.dp))
        Text("رتبه‌بندی", color = Alight.Text, fontWeight = FontWeight.Bold, style = androidx.compose.material3.MaterialTheme.typography.titleMedium)
        Spacer(modifier = Modifier.height(8.dp))
        Text(
            "رتبه‌بندی سازنده‌ها آنلاین است و به حساب آلایت نیاز دارد؛ در LyricStudio (نسخهٔ آزاد، بدون حساب) در دسترس نیست.",
            color = Alight.TextDim,
            style = androidx.compose.material3.MaterialTheme.typography.bodyMedium,
        )
    }
}

/** تب آموزش: راهنمای محلیِ قدم‌به‌قدم (به‌جای ویدیوهای آنلاین آلایت). */
@Composable
private fun TutorialTab() {
    val steps = listOf(
        "ساخت اولین پروژه" to "دکمهٔ + پایین را بزن، نام و نسبت تصویر را انتخاب کن و «ساخت» را بزن.",
        "افزودن متن و شکل" to "در ویرایشگر، + را بزن و «متن» یا «شکل» را انتخاب کن؛ بعد روی صحنه بکش.",
        "افکت‌ها" to "لایه را انتخاب کن، «افکت‌ها» را باز کن، یک افکت اضافه کن و پارامترش را با اسلایدر بکش.",
        "کی‌فریم" to "روی اسلایدر ترنسفورم، دکمهٔ لوزی را بزن تا کی‌فریم ساخته شود؛ بعد زمان را جلو ببر و مقدار تازه بده.",
        "سرعت" to "در پنل المان، «سرعت» را باز کن؛ ضریب ۰٫۲۵ تا ۴× با اسنپ‌های آلایت، و دکمه‌های کش‌دادن دو سر نوار.",
        "خروجی" to "دکمهٔ اشتراک‌گذاری بالای ویرایشگر را بزن تا ویدیو به‌صورت MP4 خروجی گرفته شود.",
    )
    LazyColumn(
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
        modifier = Modifier.fillMaxSize(),
    ) {
        items(steps) { (title, body) ->
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(10.dp))
                    .background(Alight.Surface1)
                    .padding(16.dp),
            ) {
                Text(title, color = Alight.Text, fontWeight = FontWeight.Bold, style = androidx.compose.material3.MaterialTheme.typography.titleMedium)
                Spacer(modifier = Modifier.height(4.dp))
                Text(body, color = Alight.Text2, style = androidx.compose.material3.MaterialTheme.typography.bodyMedium)
            }
        }
    }
}

/** تب پروژه‌ها: شبکهٔ پروژه‌ها + کارت ساخت تازه. */
@Composable
private fun ProjectsTab(projects: List<Project>, onOpen: (Project) -> Unit, onCreate: () -> Unit, onSample: () -> Unit, onDelete: (Project) -> Unit) {
    if (projects.isEmpty()) {
        EmptyState(onCreate, onSample)
        return
    }
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
                    .clickable { onCreate() }
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
            ProjectCard(p, onOpen, onLongPress = { onDelete(p) })
        }
    }
}

/** تب قالب‌ها: قالب‌های محلی (نسبت تصویر) + پروژهٔ نمونه. */
@Composable
private fun TemplatesTab(onNew: (Project) -> Unit, onSample: () -> Unit) {
    val templates = listOf(
        Triple("عمودی", 720, 1280),
        Triple("افقی", 1280, 720),
        Triple("مربع", 1080, 1080),
    )
    LazyVerticalGrid(
        columns = GridCells.Fixed(2),
        contentPadding = PaddingValues(12.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
        modifier = Modifier.fillMaxSize(),
    ) {
        items(templates) { (name, w, h) ->
            Column(
                modifier = Modifier
                    .clip(RoundedCornerShape(10.dp))
                    .background(Alight.Surface1)
                    .clickable { onNew(newProject("قالب $name", width = w, height = h)) }
                    .padding(bottom = 8.dp),
            ) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .aspectRatio(w.toFloat() / h.toFloat())
                        .background(Alight.Surface4),
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(Icons.Filled.Dashboard, contentDescription = null, tint = Alight.Mint, modifier = Modifier.size(40.dp))
                }
                Text("قالب $name", color = Alight.Text, modifier = Modifier.padding(start = 8.dp, top = 6.dp))
                Text(
                    "$w×$h • خالی",
                    color = Alight.TextDim,
                    style = androidx.compose.material3.MaterialTheme.typography.labelMedium,
                    modifier = Modifier.padding(start = 8.dp),
                )
            }
        }
        item {
            Column(
                modifier = Modifier
                    .clip(RoundedCornerShape(10.dp))
                    .background(Alight.Surface1)
                    .clickable { onSample() }
                    .padding(bottom = 8.dp),
            ) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .aspectRatio(9f / 16f)
                        .background(Alight.Surface4),
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(Icons.Filled.Movie, contentDescription = null, tint = Alight.Pink, modifier = Modifier.size(40.dp))
                }
                Text("نمونه (نمایش)", color = Alight.Text, modifier = Modifier.padding(start = 8.dp, top = 6.dp))
                Text(
                    "۱۰ ثانیه • ۴ لایه",
                    color = Alight.TextDim,
                    style = androidx.compose.material3.MaterialTheme.typography.labelMedium,
                    modifier = Modifier.padding(start = 8.dp),
                )
            }
        }
    }
}

/** حالت خالی خانه/پروژه‌ها — به‌جای پروژهٔ نمایشیِ اجباری. */
@Composable
private fun EmptyState(onCreate: () -> Unit, onSample: () -> Unit) {
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
            onClick = onCreate,
            colors = ButtonDefaults.buttonColors(containerColor = Alight.Mint, contentColor = Color.Black),
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
}

@OptIn(ExperimentalFoundationApi::class)
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
