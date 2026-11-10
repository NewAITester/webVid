package com.zurvanecho.lyricstudio.motion.ui.editor

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.rememberTextMeasurer
import com.zurvanecho.lyricstudio.motion.model.Project
import com.zurvanecho.lyricstudio.motion.render.MediaResolver
import com.zurvanecho.lyricstudio.motion.render.Renderer.renderFrame

/**
 * پیش‌نمایش پروژه روی Canvas — ترکیب‌کنندهٔ کامل (Renderer.renderFrame):
 * کی‌فریم و easing، هر ۲۱ شکل، مدیا، ماسک، گروه، تکرارکننده، فیلتر رنگ و دوربین.
 * همان ریاضی نسخهٔ وب، تا پروژه‌های وب و نیتیو یکسان رندر شوند.
 */
@Composable
fun ProjectPreview(project: Project, time: Double, modifier: Modifier = Modifier) {
    val measurer = rememberTextMeasurer()
    val context = LocalContext.current
    val media = remember(context) { MediaResolver(context) }
    val aspect = remember(project.width, project.height) {
        project.width.toFloat() / project.height.toFloat()
    }
    Canvas(
        modifier = modifier
            .fillMaxWidth()
            .aspectRatio(aspect),
    ) {
        renderFrame(project, time, measurer, media)
    }
}
