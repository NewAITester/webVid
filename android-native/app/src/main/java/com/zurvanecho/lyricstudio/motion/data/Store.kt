package com.zurvanecho.lyricstudio.motion.data

import android.content.Context
import com.zurvanecho.lyricstudio.motion.model.Project
import com.zurvanecho.lyricstudio.motion.model.demoProject
import com.zurvanecho.lyricstudio.motion.model.newProject
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import java.io.File

/**
 * نگهداری پروژه‌ها — JSON در پوشهٔ files برنامه (همان شکل نسخهٔ وب).
 * U1 (REA): دیگر در اولین اجرا پروژهٔ نمایشیِ اجباری ساخته نمی‌شود؛
 * خانه خالی می‌ماند تا کاربر خودش پروژه بسازد. نمونه فقط با خواست کاربر
 * (کارت «نمونه») ساخته می‌شود.
 */
class Store(context: Context) {
    private val dir = File(context.filesDir, "projects").apply { mkdirs() }
    private val json = Json { ignoreUnknownKeys = true; prettyPrint = true }

    var projects: List<Project> = load()
        private set

    private fun load(): List<Project> {
        val files = dir.listFiles()?.filter { it.name.endsWith(".json") }?.sortedBy { it.name }
        if (files.isNullOrEmpty()) return emptyList()
        return files.mapNotNull { f ->
            try {
                json.decodeFromString<Project>(f.readText())
            } catch (_: Exception) {
                null
            }
        }
    }

    fun save(project: Project) {
        File(dir, "${project.id}.json").writeText(json.encodeToString(project))
        projects = load()
    }

    /** ساخت پروژهٔ تازه با تنظیمات کامل (نام، ابعاد، fps، پس‌زمینه). */
    fun create(name: String, width: Int = 720, height: Int = 1280, fps: Int = 30, bg: String = "#0C0D13"): Project {
        val p = newProject(name, width = width, height = height, fps = fps, bg = bg)
        save(p)
        return p
    }

    /** ساخت پروژهٔ نمونه (فقط وقتی کاربر کارت «نمونه» را بزند). */
    fun createSample(): Project {
        val p = demoProject()
        save(p)
        return p
    }

    fun delete(id: String) {
        File(dir, "$id.json").delete()
        projects = load()
    }
}
