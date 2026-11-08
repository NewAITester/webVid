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
 * اولین اجرا: پروژهٔ نمایشی ساخته می‌شود.
 */
class Store(context: Context) {
    private val dir = File(context.filesDir, "projects").apply { mkdirs() }
    private val json = Json { ignoreUnknownKeys = true; prettyPrint = true }

    var projects: List<Project> = load()
        private set

    private fun load(): List<Project> {
        val files = dir.listFiles()?.filter { it.name.endsWith(".json") }?.sortedBy { it.name }
        if (files.isNullOrEmpty()) {
            val demo = demoProject()
            save(demo)
            return listOf(demo)
        }
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

    fun create(name: String): Project {
        val p = newProject(name)
        save(p)
        return p
    }

    fun delete(id: String) {
        File(dir, "$id.json").delete()
        projects = load()
    }
}
