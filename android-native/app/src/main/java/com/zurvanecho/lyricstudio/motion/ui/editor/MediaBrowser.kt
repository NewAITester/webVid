package com.zurvanecho.lyricstudio.motion.ui.editor

import android.content.ContentUris
import android.content.Context
import android.content.pm.PackageManager
import android.graphics.BitmapFactory
import android.media.MediaMetadataRetriever
import android.media.MediaPlayer
import android.net.Uri
import android.os.Build
import android.provider.MediaStore
import android.util.Size
import android.widget.VideoView
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Audiotrack
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Image
import androidx.compose.material.icons.filled.Movie
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.SelectAll
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.core.content.ContextCompat
import com.zurvanecho.lyricstudio.motion.render.MediaResolver
import com.zurvanecho.lyricstudio.motion.ui.theme.Alight
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/** یک رکورد رسانه از MediaStore دستگاه. */
data class MediaItem(
    val uri: String,
    val type: String, // "image" | "video" | "audio"
    val name: String,
    val durationMs: Long = 0,
    val width: Int = 0,
    val height: Int = 0,
    val dateAdded: Long = 0,
    val artist: String = "",
)

/** فهرست رسانه‌های دستگاه از MediaStore (بدون وابستگی خارجی). */
object MediaLibrary {
    /** مجوز لازم برای نوع رسانه در نسخهٔ اندروید فعلی. */
    fun permissionFor(context: Context, kind: String): String {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            return if (kind == "audio") android.Manifest.permission.READ_MEDIA_AUDIO
            else android.Manifest.permission.READ_MEDIA_IMAGES
        }
        return android.Manifest.permission.READ_EXTERNAL_STORAGE
    }

    /** دست‌کم یکی از مجوزهای مربوطه داده شده؟ (دسترسی جزئی هم قابل‌قبول است.) */
    fun hasPermission(context: Context, kind: String): Boolean {
        val perms = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (kind == "audio") listOf(android.Manifest.permission.READ_MEDIA_AUDIO)
            else listOf(
                android.Manifest.permission.READ_MEDIA_IMAGES,
                android.Manifest.permission.READ_MEDIA_VIDEO,
            )
        } else {
            listOf(android.Manifest.permission.READ_EXTERNAL_STORAGE)
        }
        return perms.any {
            ContextCompat.checkSelfPermission(context, it) == PackageManager.PERMISSION_GRANTED
        }
    }

    /** عکس و ویدیوها — تازه‌ترین اول، حداکثر ۲۰۰ مورد. kind: null همه، "image"، "video". */
    fun listVisual(context: Context, kind: String?): List<MediaItem> {
        val out = mutableListOf<MediaItem>()
        val cr = context.contentResolver
        if (kind == null || kind == "image") {
            val uri = MediaStore.Images.Media.EXTERNAL_CONTENT_URI
            val proj = arrayOf(
                MediaStore.Images.Media._ID,
                MediaStore.Images.Media.DISPLAY_NAME,
                MediaStore.Images.Media.DATE_ADDED,
                MediaStore.Images.Media.WIDTH,
                MediaStore.Images.Media.HEIGHT,
            )
            cr.query(uri, proj, null, null, "${MediaStore.Images.Media.DATE_ADDED} DESC")?.use { c ->
                val idC = c.getColumnIndexOrThrow(MediaStore.Images.Media._ID)
                val nameC = c.getColumnIndexOrThrow(MediaStore.Images.Media.DISPLAY_NAME)
                val dateC = c.getColumnIndexOrThrow(MediaStore.Images.Media.DATE_ADDED)
                val wC = c.getColumnIndexOrThrow(MediaStore.Images.Media.WIDTH)
                val hC = c.getColumnIndexOrThrow(MediaStore.Images.Media.HEIGHT)
                while (c.moveToNext()) {
                    out.add(
                        MediaItem(
                            uri = ContentUris.withAppendedId(uri, c.getLong(idC)).toString(),
                            type = "image",
                            name = c.getString(nameC) ?: "تصویر",
                            width = c.getInt(wC),
                            height = c.getInt(hC),
                            dateAdded = c.getLong(dateC),
                        ),
                    )
                }
            }
        }
        if (kind == null || kind == "video") {
            val uri = MediaStore.Video.Media.EXTERNAL_CONTENT_URI
            val proj = arrayOf(
                MediaStore.Video.Media._ID,
                MediaStore.Video.Media.DISPLAY_NAME,
                MediaStore.Video.Media.DATE_ADDED,
                MediaStore.Video.Media.DURATION,
                MediaStore.Video.Media.WIDTH,
                MediaStore.Video.Media.HEIGHT,
            )
            cr.query(uri, proj, null, null, "${MediaStore.Video.Media.DATE_ADDED} DESC")?.use { c ->
                val idC = c.getColumnIndexOrThrow(MediaStore.Video.Media._ID)
                val nameC = c.getColumnIndexOrThrow(MediaStore.Video.Media.DISPLAY_NAME)
                val dateC = c.getColumnIndexOrThrow(MediaStore.Video.Media.DATE_ADDED)
                val durC = c.getColumnIndexOrThrow(MediaStore.Video.Media.DURATION)
                val wC = c.getColumnIndexOrThrow(MediaStore.Video.Media.WIDTH)
                val hC = c.getColumnIndexOrThrow(MediaStore.Video.Media.HEIGHT)
                while (c.moveToNext()) {
                    out.add(
                        MediaItem(
                            uri = ContentUris.withAppendedId(uri, c.getLong(idC)).toString(),
                            type = "video",
                            name = c.getString(nameC) ?: "ویدیو",
                            durationMs = c.getLong(durC),
                            width = c.getInt(wC),
                            height = c.getInt(hC),
                            dateAdded = c.getLong(dateC),
                        ),
                    )
                }
            }
        }
        return out.sortedByDescending { it.dateAdded }.take(200)
    }

    /** فایل‌های صوتی — تازه‌ترین اول، حداکثر ۲۰۰ مورد. */
    fun listAudio(context: Context): List<MediaItem> {
        val out = mutableListOf<MediaItem>()
        val uri = MediaStore.Audio.Media.EXTERNAL_CONTENT_URI
        val proj = arrayOf(
            MediaStore.Audio.Media._ID,
            MediaStore.Audio.Media.DISPLAY_NAME,
            MediaStore.Audio.Media.DATE_ADDED,
            MediaStore.Audio.Media.DURATION,
            MediaStore.Audio.Media.ARTIST,
        )
        context.contentResolver.query(uri, proj, null, null, "${MediaStore.Audio.Media.DATE_ADDED} DESC")?.use { c ->
            val idC = c.getColumnIndexOrThrow(MediaStore.Audio.Media._ID)
            val nameC = c.getColumnIndexOrThrow(MediaStore.Audio.Media.DISPLAY_NAME)
            val dateC = c.getColumnIndexOrThrow(MediaStore.Audio.Media.DATE_ADDED)
            val durC = c.getColumnIndexOrThrow(MediaStore.Audio.Media.DURATION)
            val artC = c.getColumnIndexOrThrow(MediaStore.Audio.Media.ARTIST)
            while (c.moveToNext()) {
                val dur = c.getLong(durC)
                if (dur <= 0) continue
                out.add(
                    MediaItem(
                        uri = ContentUris.withAppendedId(uri, c.getLong(idC)).toString(),
                        type = "audio",
                        name = c.getString(nameC) ?: "صدا",
                        durationMs = dur,
                        dateAdded = c.getLong(dateC),
                        artist = c.getString(artC) ?: "",
                    ),
                )
            }
        }
        return out.take(200)
    }

    fun formatDuration(ms: Long): String {
        val s = ms / 1000
        return "${s / 60}:${"%02d".format(s % 60)}"
    }
}

/** بندانگشتی رسانه‌ها با کش — loadThumbnail در اندروید ۱۰+، مسیر جایگزین در قدیمی‌ترها. */
class MediaThumbs(private val context: Context) {
    private val cache = object : LinkedHashMap<String, ImageBitmap>(32, 0.75f, true) {
        override fun removeEldestEntry(eldest: Map.Entry<String, ImageBitmap>): Boolean = size > 64
    }

    suspend fun thumb(item: MediaItem): ImageBitmap? = withContext(Dispatchers.IO) {
        cache[item.uri]?.let { return@withContext it }
        val bmp = try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                context.contentResolver.loadThumbnail(Uri.parse(item.uri), Size(240, 240), null)
            } else if (item.type == "video") {
                val r = MediaMetadataRetriever()
                try {
                    r.setDataSource(context, Uri.parse(item.uri))
                    r.getFrameAtTime(0)
                } finally {
                    r.release()
                }
            } else {
                val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
                context.contentResolver.openInputStream(Uri.parse(item.uri))?.use {
                    BitmapFactory.decodeStream(it, null, bounds)
                }
                var sample = 1
                while (bounds.outWidth / sample > 240 || bounds.outHeight / sample > 240) sample *= 2
                val opts = BitmapFactory.Options().apply { inSampleSize = sample }
                context.contentResolver.openInputStream(Uri.parse(item.uri))?.use {
                    BitmapFactory.decodeStream(it, null, opts)
                }
            }
        } catch (_: Exception) {
            null
        } ?: return@withContext null
        val img = bmp.asImageBitmap()
        cache[item.uri] = img
        img
    }
}

/** مجوز رسانه برای مرورگرها: (داده شده؟، درخواست). */
@Composable
private fun rememberMediaPermission(kind: String): Pair<Boolean, () -> Unit> {
    val context = LocalContext.current
    var granted by remember { mutableStateOf(MediaLibrary.hasPermission(context, kind)) }
    val launcher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) {
        granted = MediaLibrary.hasPermission(context, kind)
    }
    val request = { launcher.launch(MediaLibrary.permissionFor(context, kind)) }
    return granted to request
}

/** چیپ کوچک فیلتر مرورگر رسانه (فعال = نعنایی). */
@Composable
private fun BrowserChip(label: String, active: Boolean, onClick: () -> Unit) {
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

/** مرورگر رسانه — مثل activity_mediabrowser_4_0 آلایت: نوار عنوان ۴۴dp
 *  (بستن + نام آلبوم + حالت چندتایی)، پیش‌نمایش مورد انتخاب‌شده با
 *  نوار اطلاعات ۳۰dp و نوار کنترل ۵۵dp (پخش ویدیو + افزودن)، و شبکهٔ
 *  بندانگشتی‌ها از MediaStore. */
@Composable
fun MediaBrowser(
    initialFilter: String?,
    mediaResolver: MediaResolver,
    onAdd: (List<MediaItem>) -> Unit,
    onSystemPick: (String) -> Unit,
    onClose: () -> Unit,
) {
    val context = LocalContext.current
    val (granted, requestPermission) = rememberMediaPermission("visual")
    val thumbs = remember(context) { MediaThumbs(context) }
    var filter by remember { mutableStateOf(initialFilter) }
    var items by remember { mutableStateOf<List<MediaItem>>(emptyList()) }
    var loading by remember { mutableStateOf(false) }
    var selected by remember { mutableStateOf<MediaItem?>(null) }
    var multi by remember { mutableStateOf(false) }
    var multiSel by remember { mutableStateOf<List<MediaItem>>(emptyList()) }
    var playingVideo by remember { mutableStateOf(false) }

    LaunchedEffect(filter, granted) {
        if (!granted) {
            items = emptyList()
            return@LaunchedEffect
        }
        loading = true
        val list = withContext(Dispatchers.IO) { MediaLibrary.listVisual(context, filter) }
        items = list
        loading = false
        if (selected != null && list.none { it.uri == selected!!.uri }) selected = null
    }

    /** پیش‌نمایش مورد انتخاب‌شده (تصویر کامل یا فریم اول ویدیو) — روی IO بارگذاری می‌شود. */
    var previewBmp by remember { mutableStateOf<ImageBitmap?>(null) }
    LaunchedEffect(selected?.uri, selected?.type) {
        previewBmp = null
        val sel = selected ?: return@LaunchedEffect
        previewBmp = withContext(Dispatchers.IO) {
            if (sel.type == "video") mediaResolver.videoFrame(sel.uri, 0.0)
            else mediaResolver.image(sel.uri)
        }
    }

    fun pick(item: MediaItem) {
        selected = item
        playingVideo = false
        if (multi && multiSel.none { it.uri == item.uri }) multiSel = multiSel + item
    }

    fun confirmAdd() {
        val list = if (multi && multiSel.isNotEmpty()) multiSel else selected?.let { listOf(it) }
        if (!list.isNullOrEmpty()) onAdd(list)
    }

    Dialog(
        onDismissRequest = onClose,
        properties = DialogProperties(usePlatformDefaultWidth = false),
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .background(Alight.SurfaceDeep),
        ) {
            // نوار عنوان — ۴۴dp
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(44.dp)
                    .background(Alight.Surface)
                    .padding(horizontal = 4.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                IconButton(onClick = onClose) {
                    Icon(Icons.Filled.Close, null, tint = Alight.Text)
                }
                Text(
                    "همهٔ رسانه‌ها",
                    color = Alight.Text,
                    fontWeight = FontWeight.Bold,
                    modifier = Modifier.weight(1f),
                )
                IconButton(onClick = {
                    multi = !multi
                    if (!multi) multiSel = emptyList()
                }) {
                    Icon(Icons.Filled.SelectAll, null, tint = if (multi) Alight.Mint else Alight.Text2)
                }
            }
            // فیلتر تصویر/ویدیو
            Row(
                modifier = Modifier
                    .horizontalScroll(rememberScrollState())
                    .padding(horizontal = 12.dp, vertical = 8.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                BrowserChip("همه", filter == null) { filter = null }
                BrowserChip("تصویر", filter == "image") { filter = "image" }
                BrowserChip("ویدیو", filter == "video") { filter = "video" }
            }
            if (!granted) {
                // درخواست دسترسی به رسانه (مثل storageAccessHolder آلایت)
                Column(modifier = Modifier.padding(16.dp)) {
                    Text(
                        "برای دیدن عکس و ویدیوهای دستگاه، دسترسی به رسانه‌ها لازم است.",
                        color = Alight.Text2,
                    )
                    Button(
                        onClick = requestPermission,
                        colors = ButtonDefaults.buttonColors(containerColor = Alight.Mint, contentColor = Color.Black),
                        modifier = Modifier.padding(top = 12.dp),
                    ) {
                        Text("اجازه دادن", fontWeight = FontWeight.Bold)
                    }
                    TextButton(onClick = { onSystemPick(filter ?: "image") }) {
                        Text("انتخاب از سیستم", color = Alight.Mint)
                    }
                }
            } else {
                // پیش‌نمایش مورد انتخاب‌شده
                val sel = selected
                if (sel != null) {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(220.dp)
                            .background(Alight.Surface1),
                        contentAlignment = Alignment.Center,
                    ) {
                        if (playingVideo && sel.type == "video") {
                            AndroidView(
                                factory = { ctx ->
                                    VideoView(ctx).apply {
                                        setVideoURI(Uri.parse(sel.uri))
                                        setOnCompletionListener { playingVideo = false }
                                        start()
                                    }
                                },
                                onRelease = { it.stopPlayback() },
                                modifier = Modifier.fillMaxSize(),
                            )
                        } else if (previewBmp != null) {
                            Image(
                                previewBmp!!,
                                null,
                                modifier = Modifier.fillMaxSize(),
                                contentScale = ContentScale.Fit,
                            )
                        } else {
                            CircularProgressIndicator(color = Alight.Mint)
                        }
                    }
                    // نوار اطلاعات — ۳۰dp
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(30.dp)
                            .padding(horizontal = 12.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text(
                            sel.name,
                            color = Alight.Text,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                            modifier = Modifier.weight(1f),
                        )
                        if (sel.width > 0) {
                            Text("${sel.width}×${sel.height}", color = Alight.Text2)
                        }
                        if (sel.durationMs > 0) {
                            Text(
                                MediaLibrary.formatDuration(sel.durationMs),
                                color = Alight.Text2,
                                modifier = Modifier.padding(start = 8.dp),
                            )
                        }
                    }
                    // نوار کنترل — ۵۵dp
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(55.dp)
                            .background(Alight.Surface)
                            .padding(horizontal = 12.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        if (sel.type == "video") {
                            IconButton(onClick = { playingVideo = !playingVideo }) {
                                Icon(
                                    if (playingVideo) Icons.Filled.Pause else Icons.Filled.PlayArrow,
                                    null,
                                    tint = Alight.Text,
                                )
                            }
                        }
                        Text(
                            if (multi) "چندتایی: ${multiSel.size} مورد" else "",
                            color = Alight.Text2,
                            modifier = Modifier.weight(1f),
                        )
                        Button(
                            onClick = { confirmAdd() },
                            colors = ButtonDefaults.buttonColors(containerColor = Alight.Mint, contentColor = Color.Black),
                        ) {
                            Text("افزودن", fontWeight = FontWeight.Bold)
                        }
                    }
                }
                // شبکهٔ بندانگشتی‌ها
                if (loading) {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .weight(1f),
                        contentAlignment = Alignment.Center,
                    ) {
                        CircularProgressIndicator(color = Alight.Mint)
                    }
                } else if (items.isEmpty()) {
                    Column(modifier = Modifier.padding(16.dp)) {
                        Text("رسانه‌ای پیدا نشد", color = Alight.TextDim)
                        TextButton(onClick = { onSystemPick(filter ?: "image") }) {
                            Text("انتخاب از سیستم", color = Alight.Mint)
                        }
                    }
                } else {
                    LazyVerticalGrid(
                        columns = GridCells.Fixed(3),
                        contentPadding = PaddingValues(12.dp),
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp),
                        modifier = Modifier
                            .fillMaxSize()
                            .weight(1f),
                    ) {
                        items(items, key = { it.uri }) { item ->
                            MediaTile(
                                item = item,
                                thumbs = thumbs,
                                selected = selected?.uri == item.uri,
                                checked = multiSel.any { it.uri == item.uri },
                                onClick = { pick(item) },
                            )
                        }
                    }
                }
            }
        }
    }
}

/** یک کاشی شبکهٔ رسانه با بندانگشتی (بارگذاری تنبل + کش). */
@Composable
private fun MediaTile(
    item: MediaItem,
    thumbs: MediaThumbs,
    selected: Boolean,
    checked: Boolean,
    onClick: () -> Unit,
) {
    var bmp by remember { mutableStateOf<ImageBitmap?>(null) }
    LaunchedEffect(item.uri) { bmp = thumbs.thumb(item) }
    Box(
        modifier = Modifier
            .aspectRatio(1f)
            .clip(RoundedCornerShape(8.dp))
            .background(Alight.Surface4)
            .border(
                if (selected || checked) 2.dp else 0.dp,
                if (selected || checked) Alight.Mint else Color.Transparent,
                RoundedCornerShape(8.dp),
            )
            .clickable { onClick() },
    ) {
        if (bmp != null) {
            Image(bmp!!, null, modifier = Modifier.fillMaxSize(), contentScale = ContentScale.Crop)
        } else {
            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Icon(
                    if (item.type == "video") Icons.Filled.Movie else Icons.Filled.Image,
                    null,
                    tint = Alight.TextDim,
                )
            }
        }
        if (item.type == "video" && item.durationMs > 0) {
            Text(
                MediaLibrary.formatDuration(item.durationMs),
                color = Color.White,
                fontSize = 11.sp,
                modifier = Modifier
                    .align(Alignment.BottomEnd)
                    .background(Color(0x80000000))
                    .padding(horizontal = 4.dp, vertical = 2.dp),
            )
        }
        if (checked) {
            Icon(
                Icons.Filled.CheckCircle,
                null,
                tint = Alight.Mint,
                modifier = Modifier
                    .align(Alignment.TopEnd)
                    .padding(4.dp),
            )
        }
    }
}

/** مرورگر صدا — مثل AudioBrowserActivity آلایت: فهرست فایل‌های صوتی
 *  دستگاه از MediaStore با پیش‌نمایش پخش و دکمهٔ افزودن. */
@Composable
fun AudioBrowser(
    onAdd: (MediaItem) -> Unit,
    onSystemPick: () -> Unit,
    onClose: () -> Unit,
) {
    val context = LocalContext.current
    val (granted, requestPermission) = rememberMediaPermission("audio")
    var items by remember { mutableStateOf<List<MediaItem>>(emptyList()) }
    var loading by remember { mutableStateOf(false) }
    var selected by remember { mutableStateOf<MediaItem?>(null) }
    var playingUri by remember { mutableStateOf<String?>(null) }

    val player = remember { MediaPlayer() }
    DisposableEffect(Unit) {
        onDispose {
            try {
                player.release()
            } catch (_: Exception) {
            }
        }
    }

    fun playAudio(item: MediaItem) {
        try {
            player.reset()
            player.setDataSource(context, Uri.parse(item.uri))
            player.setOnPreparedListener { it.start() }
            player.setOnCompletionListener { playingUri = null }
            player.prepareAsync()
            playingUri = item.uri
        } catch (_: Exception) {
            playingUri = null
        }
    }

    fun stopAudio() {
        try {
            if (player.isPlaying) player.stop()
        } catch (_: Exception) {
        }
        playingUri = null
    }

    LaunchedEffect(granted) {
        if (!granted) {
            items = emptyList()
            return@LaunchedEffect
        }
        loading = true
        items = withContext(Dispatchers.IO) { MediaLibrary.listAudio(context) }
        loading = false
    }

    Dialog(
        onDismissRequest = { stopAudio(); onClose() },
        properties = DialogProperties(usePlatformDefaultWidth = false),
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .background(Alight.SurfaceDeep),
        ) {
            // نوار عنوان — ۴۴dp
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(44.dp)
                    .background(Alight.Surface)
                    .padding(horizontal = 4.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                IconButton(onClick = { stopAudio(); onClose() }) {
                    Icon(Icons.Filled.Close, null, tint = Alight.Text)
                }
                Text(
                    "مرورگر صدا",
                    color = Alight.Text,
                    fontWeight = FontWeight.Bold,
                    modifier = Modifier.weight(1f),
                )
                Icon(
                    Icons.Filled.Audiotrack,
                    null,
                    tint = Alight.Text2,
                    modifier = Modifier.padding(end = 12.dp),
                )
            }
            if (!granted) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Text(
                        "برای دیدن فایل‌های صوتی دستگاه، دسترسی به صدا لازم است.",
                        color = Alight.Text2,
                    )
                    Button(
                        onClick = requestPermission,
                        colors = ButtonDefaults.buttonColors(containerColor = Alight.Mint, contentColor = Color.Black),
                        modifier = Modifier.padding(top = 12.dp),
                    ) {
                        Text("اجازه دادن", fontWeight = FontWeight.Bold)
                    }
                    TextButton(onClick = onSystemPick) {
                        Text("انتخاب از سیستم", color = Alight.Mint)
                    }
                }
            } else if (loading) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .weight(1f),
                    contentAlignment = Alignment.Center,
                ) {
                    CircularProgressIndicator(color = Alight.Mint)
                }
            } else if (items.isEmpty()) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Text("فایل صوتی پیدا نشد", color = Alight.TextDim)
                    TextButton(onClick = onSystemPick) {
                        Text("انتخاب از سیستم", color = Alight.Mint)
                    }
                }
            } else {
                LazyColumn(modifier = Modifier.weight(1f)) {
                    items(items, key = { it.uri }) { item ->
                        val isSelected = selected?.uri == item.uri
                        val isPlaying = playingUri == item.uri
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clickable {
                                    selected = item
                                    if (isPlaying) stopAudio() else playAudio(item)
                                }
                                .background(if (isSelected) Alight.Surface1 else Color.Transparent)
                                .padding(horizontal = 12.dp, vertical = 10.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Icon(
                                if (isPlaying) Icons.Filled.Pause else Icons.Filled.PlayArrow,
                                null,
                                tint = if (isSelected) Alight.Mint else Alight.Text2,
                            )
                            Column(modifier = Modifier
                                .weight(1f)
                                .padding(start = 12.dp)) {
                                Text(
                                    item.name,
                                    color = Alight.Text,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis,
                                )
                                Text(
                                    (if (item.artist.isBlank()) "صدا" else item.artist) +
                                        " • " + MediaLibrary.formatDuration(item.durationMs),
                                    color = Alight.Text2,
                                    fontSize = 12.sp,
                                )
                            }
                            if (isSelected) {
                                Icon(Icons.Filled.CheckCircle, null, tint = Alight.Mint)
                            }
                        }
                    }
                }
                // نوار افزودن
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(55.dp)
                        .background(Alight.Surface)
                        .padding(horizontal = 12.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        selected?.name ?: "یک فایل صوتی انتخاب کنید",
                        color = Alight.Text2,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.weight(1f),
                    )
                    Button(
                        onClick = {
                            val sel = selected ?: return@Button
                            stopAudio()
                            onAdd(sel)
                        },
                        enabled = selected != null,
                        colors = ButtonDefaults.buttonColors(containerColor = Alight.Mint, contentColor = Color.Black),
                    ) {
                        Text("افزودن", fontWeight = FontWeight.Bold)
                    }
                }
            }
        }
    }
}
