// LyricStudio UI shell — egui immediate-mode screens over lyricstudio-engine.
// Screens mirror the Alight flows from the REA study (home → create project →
// editor → add popup → element panel), using the double-confirmed tokens/dims.
//
// Persian display strings go through `shape_persian` (presentation forms +
// RTL order) before drawing; the model keeps logical text. The text-edit
// field keeps logical text while editing (shaping it would desync the
// cursor). Projects persist to `projects.json` in the app's data dir.
// The stage is the software renderer (`render::Renderer`) — shapes, shaped
// text and draw strokes, with per-layer pixel effects — shown as a texture,
// re-rendered when the playhead, the size or any edit changes it.
//
// Remaining gaps (tracked in rust-rebuild-plan.md):
// - Media/audio pickers and MP4 export are not yet wired in this crate.

use eframe::egui;
use lyricstudio_engine::model::{demo_project, new_project, uid, Layer, Project, ShapeSpec};
use lyricstudio_engine::registry::{default_effect, fx_def, parse_hex_rgb, ParamKind, FX_REGISTRY};
use lyricstudio_engine::render::{ImageData, Renderer};
#[cfg(target_os = "android")]
use lyricstudio_engine::render::decode_image_capped;
use lyricstudio_engine::shape::shape_persian;

use crate::{export, hex_color, jni_bridge, store, theme, to_hex, AndroidHandle};
#[cfg(target_os = "android")]
use crate::video;
use std::collections::HashMap;
use std::path::PathBuf;

/// Shape a Persian string for display. Pure Latin/number strings come back
/// unchanged. Only display strings go through this — never model text.
fn shp(s: &str) -> String {
    shape_persian(s)
}

/// Hex `#RRGGBB` → egui color (alpha 255).
fn hex_color32(s: &str) -> egui::Color32 {
    let (r, g, b) = parse_hex_rgb(s);
    egui::Color32::from_rgb(r as u8, g as u8, b as u8)
}

/// egui color → `#RRGGBB`.
fn color32_hex(c: egui::Color32) -> String {
    format!("#{:02X}{:02X}{:02X}", c.r(), c.g(), c.b())
}

#[derive(Clone, Copy, PartialEq)]
enum Screen {
    Home,
    Editor,
}

pub struct LyricApp {
    projects: Vec<Project>,
    data_dir: Option<PathBuf>,
    dirty: bool,
    screen: Screen,
    current: usize,
    home_tab: usize,
    playhead: f64,
    playing: bool,
    selected: Option<String>,
    add_open: bool,
    add_tab: usize,
    /// Software renderer (stage preview + future export frames).
    renderer: Renderer,
    /// Bumped on every edit; part of the stage texture cache key.
    render_version: u64,
    stage_tex: Option<egui::TextureHandle>,
    /// (project, frame, width, height, render_version)
    stage_key: Option<(usize, i64, usize, usize, u64)>,
    /// Effect browser window open?
    fx_open: bool,
    /// Android activity handle (None on desktop / host builds).
    /// Read only by the Android-only JNI bridge.
    #[allow(dead_code)]
    android: Option<AndroidHandle>,
    /// Decoded images, keyed by layer `src` URI (shared by stage + export).
    images: HashMap<String, ImageData>,
    /// Media browser window (MediaStore listing).
    media_open: bool,
    media_kind: jni_bridge::MediaKind,
    media_items: Vec<jni_bridge::MediaItem>,
    media_error: Option<String>,
    /// Audio preview player (Android only).
    #[cfg(target_os = "android")]
    audio_player: Option<jni_bridge::AudioPlayer>,
    /// Open video decoders, keyed by layer `src` URI (Android only).
    #[cfg(target_os = "android")]
    video_decoders: HashMap<String, video::VideoDecoder>,
    /// URI of the audio currently loaded in `audio_player`.
    /// Read only by the Android-only audio preview.
    #[allow(dead_code)]
    audio_src: Option<String>,
    /// Export window + running job.
    export_open: bool,
    export_job: Option<export::ExportJob>,
}

impl LyricApp {
    pub fn new(data_dir: Option<PathBuf>, android: Option<AndroidHandle>) -> Self {
        let projects = data_dir
            .as_ref()
            .map(|d| store::load_projects(d))
            .unwrap_or_else(|| vec![demo_project()]);
        Self {
            projects,
            data_dir,
            dirty: false,
            screen: Screen::Home,
            current: 0,
            home_tab: 0,
            playhead: 0.0,
            playing: false,
            selected: None,
            add_open: false,
            add_tab: 0,
            renderer: Renderer::new(crate::FONT_REGULAR).expect("IRANSansX parses"),
            render_version: 0,
            stage_tex: None,
            stage_key: None,
            fx_open: false,
            android,
            images: HashMap::new(),
            media_open: false,
            media_kind: jni_bridge::MediaKind::Images,
            media_items: vec![],
            media_error: None,
            #[cfg(target_os = "android")]
            audio_player: None,
            #[cfg(target_os = "android")]
            video_decoders: HashMap::new(),
            audio_src: None,
            export_open: false,
            export_job: None,
        }
    }

    /// Mark the model as edited: persists on the next frame and forces a
    /// stage re-render.
    fn mark_changed(&mut self) {
        self.dirty = true;
        self.render_version += 1;
    }

    fn current_project(&self) -> &Project {
        &self.projects[self.current]
    }

    /// Persist once per edit (flagged by the mutating handlers), not per frame.
    fn save_if_dirty(&mut self) {
        if !self.dirty {
            return;
        }
        self.dirty = false;
        if let Some(dir) = &self.data_dir {
            if let Err(e) = store::save_projects(dir, &self.projects) {
                eprintln!("LyricStudio: could not save projects: {e}");
            }
        }
    }

    /// Decode one image URI into the cache (Android only; host: error).
    /// Photos are downscaled to 1440px wide so a 12MP photo cannot blow
    /// up the cache or the renderer.
    fn load_image(&mut self, uri: &str) -> Result<(), String> {
        #[cfg(target_os = "android")]
        {
            let app = self
                .android
                .as_ref()
                .ok_or_else(|| "no Android activity".to_string())?;
            let bytes = jni_bridge::read_uri(app, uri)?;
            let img = decode_image_capped(&bytes, 1440)?;
            self.images.insert(uri.to_string(), img);
            Ok(())
        }
        #[cfg(not(target_os = "android"))]
        {
            let _ = uri;
            Err("media picking runs on the phone only".to_string())
        }
    }

    /// Decode the current project's image layers that are not cached yet
    /// (best effort — a missing file just leaves the layer blank).
    fn ensure_project_images(&mut self) {
        let srcs: Vec<String> = self
            .current_project()
            .layers
            .iter()
            .filter(|l| l.type_ == "image")
            .filter_map(|l| l.src.clone())
            .filter(|s| !self.images.contains_key(s))
            .collect();
        for s in srcs {
            if let Err(e) = self.load_image(&s) {
                eprintln!("LyricStudio: could not load image {s}: {e}");
            }
        }
    }

    fn insert_image(&mut self, item: &jni_bridge::MediaItem) {
        if let Err(e) = self.load_image(&item.uri) {
            self.media_error = Some(e);
            return;
        }
        let (iw, ih) = self
            .images
            .get(&item.uri)
            .map(|i| (i.width as f64, i.height as f64))
            .unwrap_or((720.0, 720.0));
        let fw = iw.min(720.0);
        let fh = fw * ih / iw;
        let (pw, ph) = (
            self.projects[self.current].width as f64,
            self.projects[self.current].height as f64,
        );
        let mut layer = Layer::new("image", &item.name, self.playhead, self.playhead + 10.0);
        layer.src = Some(item.uri.clone());
        layer.transform.x = pw / 2.0;
        layer.transform.y = ph / 2.0;
        layer.shape = Some(ShapeSpec {
            kind: "image".to_string(),
            w: fw,
            h: fh,
            ..Default::default()
        });
        self.projects[self.current].layers.push(layer);
        self.media_open = false;
        self.mark_changed();
    }

    fn insert_audio(&mut self, item: &jni_bridge::MediaItem) {
        let dur = if item.duration_ms > 0 {
            (item.duration_ms as f64) / 1000.0
        } else {
            10.0
        };
        let mut layer = Layer::new("audio", &item.name, self.playhead, self.playhead + dur);
        layer.src = Some(item.uri.clone());
        layer.audio = Some(lyricstudio_engine::model::AudioSpec {
            src: Some(item.uri.clone()),
            volume: 1.0,
            fade_in: 0.0,
            fade_out: 0.0,
        });
        self.projects[self.current].layers.push(layer);
        self.media_open = false;
        self.mark_changed();
    }

    /// Decode the video frame at time `t` into the image cache (Android
    /// only; host: no-op). The decoder decodes forward from its current
    /// position, so playback is cheap; a backward jump re-seeks.
    #[cfg(target_os = "android")]
    fn ensure_video_frame(&mut self, src: &str, t: f64) {
        let Some(app) = self.android.clone() else {
            return;
        };
        if !self.video_decoders.contains_key(src) {
            match video::VideoDecoder::open(&app, src) {
                Ok(d) => {
                    self.video_decoders.insert(src.to_string(), d);
                }
                Err(e) => {
                    eprintln!("LyricStudio: video open failed for {src}: {e}");
                    return;
                }
            }
        }
        let Some(dec) = self.video_decoders.get_mut(src) else {
            return;
        };
        match dec.frame_at(t) {
            Ok(Some(img)) => {
                self.images.insert(src.to_string(), img);
            }
            Ok(None) => {}
            Err(e) => {
                eprintln!("LyricStudio: video decode failed for {src}: {e}");
            }
        }
    }

    #[cfg(not(target_os = "android"))]
    fn ensure_video_frame(&mut self, _src: &str, _t: f64) {}

    fn insert_video(&mut self, item: &jni_bridge::MediaItem) {
        #[cfg(target_os = "android")]
        {
            let Some(app) = self.android.clone() else {
                self.media_error = Some("no Android activity".to_string());
                return;
            };
            let dec = match video::VideoDecoder::open(&app, &item.uri) {
                Ok(d) => d,
                Err(e) => {
                    self.media_error = Some(e);
                    return;
                }
            };
            let info = dec.info();
            let dur = if info.duration_secs > 0.0 {
                info.duration_secs
            } else if item.duration_ms > 0 {
                item.duration_ms as f64 / 1000.0
            } else {
                10.0
            };
            let (pw, ph) = (
                self.projects[self.current].width as f64,
                self.projects[self.current].height as f64,
            );
            let fw = if info.width > 0 {
                (info.width as f64).min(pw)
            } else {
                pw
            };
            let fh = if info.width > 0 && info.height > 0 {
                fw * info.height as f64 / info.width as f64
            } else {
                ph
            };
            let mut layer = Layer::new("video", &item.name, self.playhead, self.playhead + dur);
            layer.src = Some(item.uri.clone());
            layer.transform.x = pw / 2.0;
            layer.transform.y = ph / 2.0;
            layer.shape = Some(ShapeSpec {
                kind: "video".to_string(),
                w: fw,
                h: fh,
                ..Default::default()
            });
            self.projects[self.current].layers.push(layer);
            // Keep the opened decoder for the stage (it already read the
            // track header; the first frame decodes on the next render).
            self.video_decoders.insert(item.uri.clone(), dec);
            self.media_open = false;
            self.mark_changed();
        }
        #[cfg(not(target_os = "android"))]
        {
            let _ = item;
            self.media_error = Some("وارد کردن ویدیو فقط روی گوشی کار می‌کند".to_string());
        }
    }

    /// Start an MP4 export of the current project in a background thread.
    /// Output goes to the app's external files dir (`.../files/exports/`)
    /// on Android so the user can find it in a file manager.
    fn start_export(&mut self) {        let stamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0);
        let name = format!("lyricstudio-{}-{stamp}.mp4", self.current_project().id);
        #[cfg(target_os = "android")]
        let dir = self
            .android
            .as_ref()
            .and_then(|a| jni_bridge::external_files_dir(a).ok())
            .map(|d| PathBuf::from(d).join("exports"));
        #[cfg(not(target_os = "android"))]
        let dir = self.data_dir.clone().map(|d| d.join("exports"));
        let Some(dir) = dir else {
            return;
        };
        if std::fs::create_dir_all(&dir).is_err() {
            return;
        }
        let job = export::start_export(
            self.current_project().clone(),
            self.images.clone(),
            dir.join(name),
            self.android.clone(),
        );
        self.export_job = Some(job);
    }

    /// Audio preview via MediaPlayer (Android only; host: no-op).
    #[cfg(target_os = "android")]
    fn play_audio(&mut self, src: &str) {
        let Some(app) = self.android.as_ref() else {
            return;
        };
        if self.audio_src.as_deref() != Some(src) {
            if let Some(p) = &self.audio_player {
                p.release();
            }
            match jni_bridge::AudioPlayer::open(app, src) {
                Ok(p) => {
                    self.audio_player = Some(p);
                    self.audio_src = Some(src.to_string());
                }
                Err(e) => {
                    eprintln!("LyricStudio: audio open failed: {e}");
                    return;
                }
            }
        }
        if let Some(p) = &self.audio_player {
            if let Err(e) = p.start() {
                eprintln!("LyricStudio: audio start failed: {e}");
            }
        }
    }

    /// Audio preview via MediaPlayer (Android only; host: no-op).
    #[cfg(target_os = "android")]
    fn pause_audio(&mut self) {
        if let Some(p) = &self.audio_player {
            let _ = p.pause();
        }
    }

    #[cfg(not(target_os = "android"))]
    fn play_audio(&mut self, _src: &str) {}

    #[cfg(not(target_os = "android"))]
    fn pause_audio(&mut self) {}

    /// Open the MediaStore browser for a kind: request the permission
    /// first when it is missing (the system dialog's answer is polled on
    /// the next open — no callback is needed).
    fn open_media_browser(&mut self, kind: jni_bridge::MediaKind) {
        self.media_kind = kind;
        self.media_open = true;
        self.media_error = None;
        self.media_items.clear();
        #[cfg(target_os = "android")]
        {
            let Some(app) = self.android.as_ref() else {
                self.media_error = Some("no Android activity".to_string());
                return;
            };
            let perm = kind.permission(jni_bridge::sdk_int(app).unwrap_or(33));
            match jni_bridge::has_permission(app, perm) {
                Ok(false) => {
                    let _ = jni_bridge::request_permission(app, perm);
                    self.media_error = Some(
                        "دسترسی رو توی پنجره‌ای که باز شد بده، بعد دوباره برگرد".to_string(),
                    );
                }
                Ok(true) => match jni_bridge::list_media(app, kind) {
                    Ok(items) => self.media_items = items,
                    Err(e) => self.media_error = Some(e),
                },
                Err(e) => self.media_error = Some(e),
            }
        }
        #[cfg(not(target_os = "android"))]
        {
            self.media_error = Some("انتخاب فایل فقط روی گوشی کار می‌کند".to_string());
        }
    }
}

impl eframe::App for LyricApp {
    fn ui(&mut self, ui: &mut egui::Ui, _frame: &mut eframe::Frame) {
        if self.screen == Screen::Editor && self.playing {
            let dt = ui.input(|i| i.stable_dt);
            self.playhead += dt as f64;
            let dur = self.current_project().duration;
            if self.playhead >= dur {
                self.playhead = dur;
                self.playing = false;
            } else {
                ui.ctx().request_repaint();
            }
        }
        match self.screen {
            Screen::Home => self.show_home(ui),
            Screen::Editor => self.show_editor(ui),
        }
        self.save_if_dirty();
    }
}

// ---------------------------------------------------------------- home ---

impl LyricApp {
    fn show_home(&mut self, ui: &mut egui::Ui) {
        egui::Panel::top("home_top")
            .default_size(57.0)
            .size_range(57.0..=57.0)
            .show(ui, |ui| {
                ui.horizontal(|ui| {
                    ui.heading("LyricStudio");
                    ui.label(shp("نسخهٔ راستی"));
                });
            });
        egui::Panel::bottom("home_tabs")
            .default_size(56.0)
            .size_range(56.0..=56.0)
            .show(ui, |ui| {
                ui.horizontal_centered(|ui| {
                    for (i, t) in ["پروژه‌ها", "قالب‌ها", "افکت‌ها", "آموزش", "حساب"]
                        .iter()
                        .enumerate()
                    {
                        if ui.selectable_label(self.home_tab == i, shp(t)).clicked() {
                            self.home_tab = i;
                        }
                    }
                });
            });
        egui::CentralPanel::default().show(ui, |ui| {
            if self.home_tab == 2 {
                // Effect catalog (the 22 pixel effects the engine can
                // apply). Applying happens in the editor's element panel —
                // here is just the list, with an honest hint.
                ui.heading(shp("افکت‌ها"));
                ui.label(shp("برای افزودن افکت، در ادیتور یک لایه را انتخاب کن"));
                ui.add_space(8.0);
                egui::ScrollArea::vertical().show(ui, |ui| {
                    for cat in ["color", "stylize"] {
                        ui.label(shp(if cat == "color" {
                            "رنگ"
                        } else {
                            "استایل"
                        }));
                        ui.horizontal_wrapped(|ui| {
                            for def in FX_REGISTRY.iter().filter(|d| d.cat == cat) {
                                ui.label(shp(def.name));
                            }
                        });
                        ui.add_space(6.0);
                    }
                });
                return;
            }
            if self.home_tab != 0 {
                ui.centered_and_justified(|ui| {
                    ui.label(shp("این بخش در نسخهٔ بعد می‌آید"));
                });
                return;
            }
            ui.heading(shp("پروژه‌ها"));
            ui.add_space(8.0);
            let mut open: Option<usize> = None;
            egui::ScrollArea::vertical().show(ui, |ui| {
                ui.horizontal_wrapped(|ui| {
                    for (i, p) in self.projects.iter().enumerate() {
                        let label = format!(
                            "{}\n{}×{} · {}s · {}fps",
                            shp(&p.name),
                            p.width,
                            p.height,
                            p.duration as i32,
                            p.fps
                        );
                        if ui
                            .add_sized([120.0, 180.0], egui::Button::new(label))
                            .clicked()
                        {
                            open = Some(i);
                        }
                    }
                });
            });
            ui.add_space(8.0);
            if ui.button(shp("＋ پروژهٔ جدید (۹:۱۶)")).clicked() {
                self.projects.push(new_project("پروژهٔ جدید"));
                self.mark_changed();
            }
            if let Some(i) = open {
                self.current = i;
                self.screen = Screen::Editor;
                self.playhead = 0.0;
                self.playing = false;
                self.selected = None;
                self.ensure_project_images();
            }
        });
    }
}

// -------------------------------------------------------------- editor ---

impl LyricApp {
    fn show_editor(&mut self, ui: &mut egui::Ui) {
        let name = self.current_project().name.clone();
        let duration = self.current_project().duration;

        egui::Panel::top("edit_nav")
            .default_size(42.0)
            .size_range(42.0..=42.0)
            .show(ui, |ui| {
                ui.horizontal(|ui| {
                    if ui.button(shp("‹ بازگشت")).clicked() {
                        self.screen = Screen::Home;
                        self.playing = false;
                    }
                    ui.heading(shp(&name));
                    ui.with_layout(
                        egui::Layout::right_to_left(egui::Align::Center),
                        |ui| {
                            if ui.button(shp("خروجی")).clicked() {
                                self.export_open = true;
                            }
                        },
                    );
                });
            });

        // Timeline (bottom-most), then playbar above it, then the element
        // panel above that when a layer is selected.
        egui::Panel::bottom("edit_timeline")
            .default_size(280.0)
            .size_range(280.0..=280.0)
            .show(ui, |ui| {
                self.timeline_ui(ui, duration);
            });
        egui::Panel::bottom("edit_playbar")
            .default_size(46.0)
            .size_range(46.0..=46.0)
            .show(ui, |ui| {
                ui.horizontal(|ui| {
                    let label = if self.playing { "⏸" } else { "▶" };
                    if ui.button(label).clicked() {
                        self.playing = !self.playing;
                    }
                    ui.add(
                        egui::Slider::new(&mut self.playhead, 0.0..=duration)
                            .show_value(false),
                    );
                    ui.label(format!("{:.1} / {:.0}s", self.playhead, duration));
                });
            });
        if self.selected.is_some() {
            egui::Panel::bottom("edit_element_panel")
                .default_size(200.0)
                .size_range(200.0..=200.0)
                .show(ui, |ui| {
                    self.element_panel_ui(ui);
                });
        }

        egui::CentralPanel::default().show(ui, |ui| {
            ui.vertical_centered(|ui| {
                // Cloned so the stage can take &mut self (texture cache)
                // while it renders; projects are small (a few KB).
                let proj = self.current_project().clone();
                let t = self.playhead;
                self.draw_stage(ui, &proj, t);
            });
        });

        // Floating + button (73dp, bottom-right), like Alight's add button.
        egui::Area::new(ui.scope_id().with("fab"))
            .anchor(egui::Align2::RIGHT_BOTTOM, egui::Vec2::new(-16.0, -16.0))
            .show(ui.ctx(), |ui| {
                if ui
                    .add_sized([73.0, 73.0], egui::Button::new("＋"))
                    .clicked()
                {
                    self.add_open = true;
                }
            });

        // Add popup (251dp) — the real REA add flow, 5 tabs.
        let mut open = self.add_open;
        egui::Window::new(shp("افزودن"))
            .open(&mut open)
            .show(ui.ctx(), |ui| {
                self.add_popup_ui(ui);
            });
        self.add_open = open;

        // Media browser — MediaStore list (Android) or an honest note.
        let mut mopen = self.media_open;
        egui::Window::new(shp("رسانه"))
            .open(&mut mopen)
            .show(ui.ctx(), |ui| {
                let kind_label = match self.media_kind {
                    jni_bridge::MediaKind::Images => "عکس‌ها",
                    jni_bridge::MediaKind::Videos => "ویدیوها",
                    jni_bridge::MediaKind::Audio => "آهنگ‌ها",
                };
                ui.heading(shp(kind_label));
                if let Some(e) = &self.media_error.clone() {
                    ui.label(shp(e));
                }
                let mut pick: Option<jni_bridge::MediaItem> = None;
                egui::ScrollArea::vertical().show(ui, |ui| {
                    for item in &self.media_items {
                        let size = if item.size > 0 {
                            format!("{:.1} MB", item.size as f64 / 1_048_576.0)
                        } else {
                            String::new()
                        };
                        let label = if item.duration_ms > 0 {
                            format!("{} · {}s · {size}", item.name, item.duration_ms / 1000)
                        } else if size.is_empty() {
                            item.name.clone()
                        } else {
                            format!("{} · {size}", item.name)
                        };
                        if ui.button(label).clicked() {
                            pick = Some(item.clone());
                        }
                    }
                });
                if let Some(item) = pick {
                    match self.media_kind {
                        jni_bridge::MediaKind::Images => self.insert_image(&item),
                        jni_bridge::MediaKind::Audio => self.insert_audio(&item),
                        jni_bridge::MediaKind::Videos => self.insert_video(&item),
                    }
                }
            });
        self.media_open = mopen;

        // Export window — real MP4 export (video-only in this version).
        let mut eopen = self.export_open;
        egui::Window::new(shp("خروجی"))
            .open(&mut eopen)
            .show(ui.ctx(), |ui| {
                let proj = self.current_project().clone();
                ui.label(shp(&format!(
                    "{}×{} · {}fps · ویدیو بدون صدا در این نسخه",
                    proj.width, proj.height, proj.fps
                )));
                if self.export_job.is_none() {
                    if ui.button(shp("شروع خروجی MP4")).clicked() {
                        self.start_export();
                    }
                }
                if let Some(job) = &self.export_job {
                    let p = *job.progress.lock().unwrap();
                    ui.add(egui::ProgressBar::new(p).show_percentage());
                    if let Some(r) = job.result.lock().unwrap().as_ref() {
                        match r {
                            Ok(path) => {
                                ui.label(shp(&format!("ذخیره شد: {}", path.display())));
                            }
                            Err(e) => {
                                ui.label(shp(&format!("خطا: {e}")));
                            }
                        }
                    }
                    if ui.button(shp("لغو")).clicked() {
                        job.cancel
                            .store(true, std::sync::atomic::Ordering::SeqCst);
                    }
                }
            });
        self.export_open = eopen;
    }

    fn timeline_ui(&mut self, ui: &mut egui::Ui, duration: f64) {
        ui.heading(shp("تایم‌لاین"));
        egui::ScrollArea::vertical().show(ui, |ui| {
            let mut clicked: Option<String> = None;
            // Top layer first (project stores bottom = back).
            for layer in self.current_project().layers.iter().rev() {
                let (rect, resp) = ui.allocate_exact_size(
                    egui::Vec2::new(ui.available_width(), 28.0),
                    egui::Sense::click(),
                );
                let painter = ui.painter_at(rect);
                painter.rect_filled(rect, 2.0, hex_color(theme::A2));
                let x0 = rect.min.x
                    + (layer.start as f32 / duration as f32) * rect.width();
                let x1 = rect.min.x
                    + (layer.end as f32 / duration as f32) * rect.width();
                let sel = self.selected.as_deref() == Some(layer.id.as_str());
                painter.rect_filled(
                    egui::Rect::from_min_max(
                        egui::Pos2::new(x0, rect.min.y + 4.0),
                        egui::Pos2::new(x1.max(x0 + 4.0), rect.max.y - 4.0),
                    ),
                    2.0,
                    if sel {
                        hex_color(theme::Y1)
                    } else {
                        hex_color(theme::B1)
                    },
                );
                painter.text(
                    egui::Pos2::new(rect.min.x + 6.0, rect.center().y),
                    egui::Align2::LEFT_CENTER,
                    shp(&layer.name),
                    egui::FontId::proportional(13.0),
                    hex_color(theme::G0),
                );
                if resp.clicked() {
                    clicked = Some(layer.id.clone());
                }
            }
            if let Some(id) = clicked {
                self.selected = Some(id);
            }
        });
    }

    fn element_panel_ui(&mut self, ui: &mut egui::Ui) {
        let Some(sel) = self.selected.clone() else {
            ui.label(shp("لایه‌ای انتخاب نشده"));
            return;
        };
        // Audio state for the selected layer, read BEFORE the project
        // borrow below (the panel cannot call &mut self while it is live).
        let audio_src: Option<String> = self.projects[self.current]
            .layers
            .iter()
            .find(|l| l.id == sel)
            .and_then(|l| {
                if l.type_ == "audio" {
                    l.src.clone()
                } else {
                    None
                }
            });
        #[cfg(target_os = "android")]
        let audio_playing = audio_src
            .as_deref()
            .map(|s| {
                self.audio_src.as_deref() == Some(s)
                    && self.audio_player.as_ref().is_some_and(|p| p.is_playing())
            })
            .unwrap_or(false);
        #[cfg(not(target_os = "android"))]
        let audio_playing = false;
        let proj = &mut self.projects[self.current];
        let Some(idx) = proj.layers.iter().position(|l| l.id == sel) else {
            return;
        };
        let playhead = self.playhead;
        let mut changed = false;
        let mut open_fx = false;
        let mut close_fx = false;
        let mut fx_open = self.fx_open;
        let mut audio_action: Option<bool> = None; // Some(true) = play
        ui.label(format!(
            "{} · {}",
            shp(&proj.layers[idx].name),
            proj.layers[idx].type_
        ));
        ui.horizontal(|ui| {
            if ui.button(shp("برش از شروع")).clicked() {
                proj.layers[idx].start = playhead;
                changed = true;
            }
            if ui.button(shp("تقسیم")).clicked() {
                let mut copy = proj.layers[idx].clone();
                copy.id = uid();
                copy.start = playhead;
                proj.layers[idx].end = playhead;
                proj.layers.insert(idx + 1, copy);
                changed = true;
            }
            if ui.button(shp("برش از پایان")).clicked() {
                proj.layers[idx].end = playhead;
                changed = true;
            }
            if ui.button(shp("تکثیر")).clicked() {
                let mut copy = proj.layers[idx].clone();
                copy.id = uid();
                copy.name = format!("{} (کپی)", copy.name);
                proj.layers.insert(idx + 1, copy);
                changed = true;
            }
        });
        if let Some(sh) = &mut proj.layers[idx].shape {
            ui.horizontal(|ui| {
                ui.label(shp("رنگ"));
                let mut c = hex_color(sh.fill.as_deref().unwrap_or(theme::B1));
                if ui.color_edit_button_srgba(&mut c).changed() {
                    sh.fill = Some(to_hex(c));
                    changed = true;
                }
                if ui
                    .add(egui::Slider::new(&mut sh.stroke_width, 0.0..=20.0).text(shp("خط")))
                    .changed()
                {
                    changed = true;
                }
            });
        }
        if let Some(tx) = &mut proj.layers[idx].text {
            // Logical text while editing (shaping would desync the cursor);
            // the stage draws it shaped.
            if ui.text_edit_singleline(&mut tx.content).changed() {
                changed = true;
            }
            if ui
                .add(egui::Slider::new(&mut tx.size, 12.0..=200.0).text(shp("اندازه")))
                .changed()
            {
                changed = true;
            }
            ui.horizontal(|ui| {
                ui.label(shp("رنگ متن"));
                let mut c = hex_color(&tx.color);
                if ui.color_edit_button_srgba(&mut c).changed() {
                    tx.color = to_hex(c);
                    changed = true;
                }
            });
        }
        // Audio preview (Android): play/pause the selected audio layer
        // through MediaPlayer. The action is deferred to the end of the
        // panel (the project borrow is live here, so no &mut self call).
        if audio_src.is_some() {
            ui.horizontal(|ui| {
                let label = if audio_playing { "⏸ توقف صدا" } else { "▶ پخش صدا" };
                if ui.button(shp(label)).clicked() {
                    audio_action = Some(!audio_playing);
                }
            });
        }
        if ui
            .add(
                egui::Slider::new(&mut proj.layers[idx].transform.opacity, 0.0..=1.0)
                    .text(shp("شفافیت")),
            )
            .changed()
        {
            changed = true;
        }
        // ---- Effects (software-rendered, visible on the stage) ----
        ui.separator();
        ui.horizontal(|ui| {
            ui.label(shp("افکت‌ها"));
            if ui.button(shp("＋ افزودن افکت")).clicked() {
                open_fx = true;
            }
        });
        let mut remove: Option<usize> = None;
        for (i, fx) in proj.layers[idx].effects.iter_mut().enumerate() {
            let def = fx_def(&fx.id);
            let name = def
                .map(|d| shp(d.name))
                .unwrap_or_else(|| fx.id.clone());
            ui.horizontal(|ui| {
                if ui.checkbox(&mut fx.enabled, name).changed() {
                    changed = true;
                }
                if ui.button("✕").clicked() {
                    remove = Some(i);
                }
            });
            if let Some(def) = def {
                for p in def.params {
                    match p.kind {
                        ParamKind::Number => {
                            let v = fx
                                .params
                                .entry(p.key.to_string())
                                .or_insert(p.default_num);
                            if ui
                                .add(
                                    egui::Slider::new(v, p.min..=p.max).text(shp(p.label)),
                                )
                                .changed()
                            {
                                changed = true;
                            }
                        }
                        ParamKind::Color => {
                            let cur = fx
                                .text_params
                                .entry(p.key.to_string())
                                .or_insert_with(|| p.default_str.to_string())
                                .clone();
                            let mut c = hex_color32(&cur);
                            ui.horizontal(|ui| {
                                ui.label(shp(p.label));
                                if ui.color_edit_button_srgba(&mut c).changed() {
                                    fx.text_params
                                        .insert(p.key.to_string(), color32_hex(c));
                                    changed = true;
                                }
                            });
                        }
                    }
                }
            }
        }
        if let Some(i) = remove {
            proj.layers[idx].effects.remove(i);
            changed = true;
        }
        // Effect browser: adds a defaulted effect to the same layer.
        if fx_open {
            let mut add: Option<String> = None;
            egui::Window::new(shp("افزودن افکت"))
                .open(&mut fx_open)
                .show(ui.ctx(), |ui| {
                    egui::ScrollArea::vertical().show(ui, |ui| {
                        for cat in ["color", "stylize"] {
                            ui.label(shp(if cat == "color" { "رنگ" } else { "استایل" }));
                            ui.horizontal_wrapped(|ui| {
                                for def in FX_REGISTRY.iter().filter(|d| d.cat == cat) {
                                    if ui.button(shp(def.name)).clicked() {
                                        add = Some(def.id.to_string());
                                    }
                                }
                            });
                        }
                    });
                });
            if let Some(id) = add {
                if let Some(fx) = default_effect(&id) {
                    proj.layers[idx].effects.push(fx);
                    changed = true;
                }
                close_fx = true;
            }
        }
        if changed {
            self.mark_changed();
        }
        if open_fx {
            self.fx_open = true;
        } else {
            self.fx_open = fx_open && !close_fx;
        }
        if let Some(play) = audio_action {
            if play {
                if let Some(src) = &audio_src {
                    self.play_audio(src);
                }
            } else {
                self.pause_audio();
            }
        }
    }

    fn add_popup_ui(&mut self, ui: &mut egui::Ui) {
        ui.horizontal(|ui| {
            for (i, t) in ["شکل‌ها", "رسانه", "صوت", "شی‌ها", "قالب‌ها"]
                .iter()
                .enumerate()
            {
                if ui.selectable_label(self.add_tab == i, shp(t)).clicked() {
                    self.add_tab = i;
                }
            }
        });
        ui.separator();
        match self.add_tab {
            0 => {
                ui.horizontal_wrapped(|ui| {
                    for kind in ["rect", "circle", "ring", "triangle", "star"] {
                        if ui.button(kind).clicked() {
                            self.insert_shape(kind);
                        }
                    }
                });
            }
            1 => {
                if ui.button(shp("مرور عکس‌ها")).clicked() {
                    self.open_media_browser(jni_bridge::MediaKind::Images);
                }
                if ui.button(shp("مرور ویدیوها")).clicked() {
                    self.open_media_browser(jni_bridge::MediaKind::Videos);
                }
                ui.label(shp("ویدیو با دی‌کدر سخت‌افزاری گوشی وارد می‌شود."));
            }
            2 => {
                if ui.button(shp("مرور آهنگ‌ها")).clicked() {
                    self.open_media_browser(jni_bridge::MediaKind::Audio);
                }
            }
            3 => {
                ui.horizontal(|ui| {
                    if ui.button(shp("دوربین")).clicked() {
                        self.insert_camera();
                    }
                    if ui.button("Null").clicked() {
                        self.insert_null();
                    }
                    if ui.button(shp("گروه خالی")).clicked() {
                        self.insert_group();
                    }
                });
            }
            _ => {
                if ui.button(shp("قالب نمایشی (۴ لایه)")).clicked() {
                    self.insert_demo_group();
                }
            }
        }
    }

    fn insert_shape(&mut self, kind: &str) {
        let proj = &mut self.projects[self.current];
        let mut l = Layer::new(
            "shape",
            kind,
            self.playhead,
            (self.playhead + 5.0).min(proj.duration),
        );
        l.transform.x = proj.width as f64 / 2.0;
        l.transform.y = proj.height as f64 / 2.0;
        l.shape = Some(ShapeSpec {
            kind: kind.to_string(),
            fill: Some(theme::B1.to_string()),
            w: 300.0,
            h: 300.0,
            ..Default::default()
        });
        proj.layers.push(l);
        self.mark_changed();
    }

    fn insert_camera(&mut self) {
        let proj = &mut self.projects[self.current];
        let mut l = Layer::new("camera", "دوربین", 0.0, proj.duration);
        l.camera = Some(Default::default());
        proj.layers.push(l);
        self.mark_changed();
    }

    fn insert_null(&mut self) {
        let proj = &mut self.projects[self.current];
        proj.layers.push(Layer::new("null", "Null", 0.0, proj.duration));
        self.mark_changed();
    }

    fn insert_group(&mut self) {
        let proj = &mut self.projects[self.current];
        proj.layers
            .push(Layer::new("group", "گروه خالی", 0.0, proj.duration));
        self.mark_changed();
    }

    fn insert_demo_group(&mut self) {
        let proj = &mut self.projects[self.current];
        let mut g = Layer::new("group", "قالب نمایشی", 0.0, proj.duration);
        g.children = demo_project().layers;
        proj.layers.push(g);
        self.mark_changed();
    }

    // ------------------------------------------------------------ stage ---

    /// The stage is the software-rendered frame as a texture, re-rendered
    /// only when the playhead (frame), size or an edit changes it.
    /// Render width is capped at 480px to bound the per-pixel cost; the
    /// widget shows the texture scaled to fit.
    fn draw_stage(&mut self, ui: &mut egui::Ui, proj: &Project, t: f64) {
        // Decode the current frame of every video layer first; the
        // renderer then blits it like an image.
        let video_srcs: Vec<String> = proj
            .layers
            .iter()
            .filter(|l| l.type_ == "video")
            .filter_map(|l| l.src.clone())
            .collect();
        for src in video_srcs {
            self.ensure_video_frame(&src, t);
        }
        let avail = ui.available_size();
        let s = (avail.x / proj.width as f32).min(avail.y / proj.height as f32);
        let w = proj.width as f32 * s;
        let h = proj.height as f32 * s;
        let (rect, _) = ui.allocate_exact_size(egui::Vec2::new(w, h), egui::Sense::hover());
        let rw = (w as usize).min(480).max(2);
        let rh = ((rw as f32 * proj.height as f32 / proj.width as f32) as usize).max(2);
        let frame = (t * proj.fps as f64).round() as i64;
        let key = (self.current, frame, rw, rh, self.render_version);
        if self.stage_key != Some(key) {
            let buf = self.renderer.render(proj, t, rw, rh, &self.images);
            let img = egui::ColorImage::from_rgba_unmultiplied([rw, rh], &buf);
            self.stage_tex = Some(ui.ctx().load_texture(
                "stage",
                img,
                egui::TextureOptions::LINEAR,
            ));
            self.stage_key = Some(key);
        }
        if let Some(tex) = &self.stage_tex {
            ui.painter_at(rect).image(
                tex.id(),
                rect,
                egui::Rect::from_min_max(egui::Pos2::ZERO, egui::Pos2::new(1.0, 1.0)),
                egui::Color32::WHITE,
            );
        }
        if proj.layers.is_empty() {
            ui.painter_at(rect).text(
                rect.center(),
                egui::Align2::CENTER_CENTER,
                shp("پروژه خالی است — با ＋ لایه اضافه کن"),
                egui::FontId::proportional(14.0),
                hex_color(theme::G0),
            );
        }
    }
}
