package com.zurvanecho.lyricstudio.motion

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import com.zurvanecho.lyricstudio.motion.data.Store
import com.zurvanecho.lyricstudio.motion.model.Project
import com.zurvanecho.lyricstudio.motion.ui.editor.EditorScreen
import com.zurvanecho.lyricstudio.motion.ui.home.HomeScreen
import com.zurvanecho.lyricstudio.motion.ui.theme.LyricStudioTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        val store = Store(this)
        setContent {
            LyricStudioTheme {
                var projects by remember { mutableStateOf(store.projects) }
                var open by remember { mutableStateOf<Project?>(null) }
                if (open == null) {
                    HomeScreen(
                        projects = projects,
                        onOpen = { open = it },
                        onNew = { p ->
                            // پروژه از شیت ساخت می‌آید (با تنظیمات کاربر) — ذخیره و باز کن
                            store.save(p)
                            projects = store.projects
                            open = p
                        },
                        onSample = {
                            val p = store.createSample()
                            projects = store.projects
                            open = p
                        },
                        onDelete = { p ->
                            store.delete(p.id)
                            projects = store.projects
                        },
                        onDeleteAll = {
                            store.deleteAll()
                            projects = store.projects
                        },
                    )
                } else {
                    val current = open!!
                    EditorScreen(
                        initial = current,
                        onSave = { store.save(it) },
                        onClose = {
                            projects = store.projects
                            open = null
                        },
                    )
                }
            }
        }
    }
}
