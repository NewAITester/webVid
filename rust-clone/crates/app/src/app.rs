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
use lyricstudio_engine::render::Renderer;
use lyricstudio_engine::shape::shape_persian;

use crate::{hex_color, store, theme, to_hex};
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
    export_notice: bool,
    /// Software renderer (stage preview + future export frames).
    renderer: Renderer,
    /// Bumped on every edit; part of the stage texture cache key.
    render_version: u64,
    stage_tex: Option<egui::TextureHandle>,
    /// (project, frame, width, height, render_version)
    stage_key: Option<(usize, i64, usize, usize, u64)>,
    /// Effect browser window open?
    fx_open: bool,
}

impl LyricApp {
    pub fn new(data_dir: Option<PathBuf>) -> Self {
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
            export_notice: false,
            renderer: Renderer::new(crate::FONT_REGULAR).expect("IRANSansX parses"),
            render_version: 0,
            stage_tex: None,
            stage_key: None,
            fx_open: false,
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
                                self.export_notice = true;
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

        // Export placeholder — honest: MP4 export is not in the Rust app yet.
        let mut notice = self.export_notice;
        egui::Window::new(shp("خروجی"))
            .open(&mut notice)
            .show(ui.ctx(), |ui| {
                ui.label(shp("خروجی MP4 (MediaCodec) در نسخهٔ راستی هنوز پیاده نشده.\nفعلاً خروجی در برنامهٔ کوت‌لین انجام می‌شود."));
            });
        self.export_notice = notice;
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
        let proj = &mut self.projects[self.current];
        let Some(idx) = proj.layers.iter().position(|l| l.id == sel) else {
            return;
        };
        let playhead = self.playhead;
        let mut changed = false;
        let mut open_fx = false;
        let mut close_fx = false;
        let mut fx_open = self.fx_open;
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
            1 | 2 => {
                ui.label(shp("انتخاب فایل رسانه/صوت در نسخهٔ بعد می‌آید"));
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
            let buf = self.renderer.render(proj, t, rw, rh);
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
