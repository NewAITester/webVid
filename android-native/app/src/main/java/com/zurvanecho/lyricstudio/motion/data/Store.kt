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
 *
 * K8: ذخیرهٔ اتمی (tmp + تغییرنام) با نسخهٔ پشتیبان (.bak) و بازیابی
 * از آن هنگام خرابی فایل؛ فهرست حافظه درجا به‌روز می‌شود (بدون بازخوانی
 * همهٔ فایل‌ها در هر ذخیره) و بر اساس آخرین ویرایش مرتب است — پس کارت
 * «ادامه بده» خانه همیشه تازه‌ترین پروژه است.
 */
class Store(context: Context) {
    private val dir = File(context.filesDir, "projects").apply { mkdirs() }
    private val json = Json { ignoreUnknownKeys = true; prettyPrint = true }

    /** تازه‌ترین ویرایش اول، بعد شناسه (برای فایل‌های قدیمیِ بدون modifiedAt). */
    private val order = compareByDescending<Project> { it.modifiedAt }.thenBy { it.id }

    var projects: List<Project> = load()
        private set

    private fun load(): List<Project> {
        val files = dir.listFiles()?.filter { it.name.endsWith(".json") }?.sortedBy { it.name }
        if (files.isNullOrEmpty()) return emptyList()
        return files.mapNotNull { loadOne(it) }.sortedWith(order)
    }

    /** خواندن یک پروژه؛ اگر فایل خراب بود، نسخهٔ پشتیبان را برمی‌گرداند. */
    private fun loadOne(file: File): Project? {
        val text = try {
            file.readText()
        } catch (_: Exception) {
            null
        }
        if (text != null) {
            try {
                return json.decodeFromString<Project>(text)
            } catch (_: Exception) {
                // فایل خراب — سراغ پشتیبان
            }
        }
        val bak = File(dir, file.name + ".bak")
        if (bak.exists()) {
            try {
                val p = json.decodeFromString<Project>(bak.readText())
                try {
                    bak.copyTo(file, overwrite = true)
                } catch (_: Exception) {
                }
                return p
            } catch (_: Exception) {
            }
        }
        return null
    }

    fun save(project: Project) {
        val stamped = project.copy(modifiedAt = System.currentTimeMillis())
        val target = File(dir, "${stamped.id}.json")
        val tmp = File(dir, "${stamped.id}.json.tmp")
        val bak = File(dir, "${stamped.id}.json.bak")
        try {
            tmp.writeText(json.encodeToString(stamped))
            if (target.exists()) {
                try {
                    target.copyTo(bak, overwrite = true)
                } catch (_: Exception) {
                }
            }
            if (!tmp.renameTo(target)) {
                // تغییرنام نشد — مستقیم بنویس (رفتار قبلی)
                tmp.copyTo(target, overwrite = true)
            }
        } catch (_: Exception) {
            // ذخیرهٔ دیسک ناموفق — فهرست حافظه همچنان به‌روز می‌شود
        } finally {
            tmp.delete()
        }
        projects = (projects.filter { it.id != stamped.id } + stamped).sortedWith(order)
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
        File(dir, "$id.json.tmp").delete()
        File(dir, "$id.json.bak").delete()
        projects = projects.filter { it.id != id }
    }

    /** حذف همهٔ پروژه‌ها (از منوی کناری خانه). */
    fun deleteAll() {
        dir.listFiles()?.filter {
            it.name.endsWith(".json") || it.name.endsWith(".tmp") || it.name.endsWith(".bak")
        }?.forEach { it.delete() }
        projects = emptyList()
    }
}
