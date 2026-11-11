//! Project persistence: the app's projects as one `projects.json` in the
//! app's data directory (Android: `internal_data_path()` from the
//! NativeActivity; desktop: a `.lyricstudio` folder next to the working
//! directory). Same serde JSON schema as web/Kotlin, so projects stay
//! portable. Loading is forgiving: any missing/corrupt file falls back to
//! the demo project.

use lyricstudio_engine::model::{demo_project, Project};
use std::path::{Path, PathBuf};

pub fn projects_path(dir: &Path) -> PathBuf {
    dir.join("projects.json")
}

/// Load saved projects, or the demo project when there is nothing (yet)
/// readable on disk.
pub fn load_projects(dir: &Path) -> Vec<Project> {
    match std::fs::read_to_string(projects_path(dir)) {
        Ok(text) => match serde_json::from_str::<Vec<Project>>(&text) {
            Ok(list) if !list.is_empty() => list,
            _ => vec![demo_project()],
        },
        Err(_) => vec![demo_project()],
    }
}

/// Save all projects atomically-ish (write + rename is overkill for one
/// small JSON file; a plain write is enough here).
pub fn save_projects(dir: &Path, projects: &[Project]) -> std::io::Result<()> {
    std::fs::create_dir_all(dir)?;
    let text = serde_json::to_string_pretty(projects)
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::InvalidData, e))?;
    std::fs::write(projects_path(dir), text)
}

#[cfg(test)]
mod tests {
    use super::*;
    use lyricstudio_engine::model::new_project;

    fn tmp_dir(name: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("lyricstudio-test-{name}"));
        let _ = std::fs::remove_dir_all(&d);
        d
    }

    #[test]
    fn empty_dir_loads_demo() {
        let d = tmp_dir("empty");
        let list = load_projects(&d);
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].name, "نمایش");
    }

    #[test]
    fn roundtrip_keeps_projects() {
        let d = tmp_dir("roundtrip");
        let mut list = vec![demo_project()];
        list.push(new_project("تست ذخیره"));
        save_projects(&d, &list).unwrap();
        let back = load_projects(&d);
        assert_eq!(back.len(), 2);
        assert_eq!(back[1].name, "تست ذخیره");
        assert_eq!(back[0].layers.len(), 4);
        let _ = std::fs::remove_dir_all(&d);
    }

    #[test]
    fn corrupt_file_falls_back_to_demo() {
        let d = tmp_dir("corrupt");
        std::fs::create_dir_all(&d).unwrap();
        std::fs::write(projects_path(&d), "{not json").unwrap();
        let list = load_projects(&d);
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].name, "نمایش");
        let _ = std::fs::remove_dir_all(&d);
    }
}
