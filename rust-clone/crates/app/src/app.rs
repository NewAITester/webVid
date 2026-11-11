// LyricStudio UI shell — egui immediate-mode screens over lyricstudio-engine.
// Screens mirror the Alight flows from the REA study (home → create project →
// editor → add popup → element panel), using the double-confirmed tokens/dims.
//
// Persian display strings go through `shape_persian` (presentation forms +
// RTL order) before drawing; the model keeps logical text. The text-edit
// field keeps logical text while editing (shaping it would desync the
// cursor). Projects persist to `projects.json` in the app's data dir.
//
// Remaining gaps (tracked in rust-rebuild-plan.md):
// - Media/audio pickers and MP4 export are not yet wired in this crate.

use eframe::egui;
use lyricstudio_engine::evaluate;
use lyricstudio_engine::model::{demo_project, new_project, uid, Layer, Project, ShapeSpec};
use lyricstudio_engine::shape::shape_persian;

use crate::{hex_color, store, theme, to_hex};
use std::path::PathBuf;

/// Shape a Persian string for display. Pure Latin/number strings come back
/// unchanged. Only display strings go through this — never model text.
fn shp(s: &str) -> String {
    shape_persian(s)
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
        }
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
                self.dirty = true;
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
                let (proj, t) = (self.current_project(), self.playhead);
                self.draw_stage(ui, proj, t);
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
        if changed {
            self.dirty = true;
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
        self.dirty = true;
    }

    fn insert_camera(&mut self) {
        let proj = &mut self.projects[self.current];
        let mut l = Layer::new("camera", "دوربین", 0.0, proj.duration);
        l.camera = Some(Default::default());
        proj.layers.push(l);
        self.dirty = true;
    }

    fn insert_null(&mut self) {
        let proj = &mut self.projects[self.current];
        proj.layers.push(Layer::new("null", "Null", 0.0, proj.duration));
        self.dirty = true;
    }

    fn insert_group(&mut self) {
        let proj = &mut self.projects[self.current];
        proj.layers
            .push(Layer::new("group", "گروه خالی", 0.0, proj.duration));
        self.dirty = true;
    }

    fn insert_demo_group(&mut self) {
        let proj = &mut self.projects[self.current];
        let mut g = Layer::new("group", "قالب نمایشی", 0.0, proj.duration);
        g.children = demo_project().layers;
        proj.layers.push(g);
        self.dirty = true;
    }

    // ------------------------------------------------------------ stage ---

    fn draw_stage(&self, ui: &mut egui::Ui, proj: &Project, t: f64) {
        let avail = ui.available_size();
        let s = (avail.x / proj.width as f32).min(avail.y / proj.height as f32);
        let w = proj.width as f32 * s;
        let h = proj.height as f32 * s;
        let (rect, _) = ui.allocate_exact_size(egui::Vec2::new(w, h), egui::Sense::hover());
        let painter = ui.painter_at(rect);
        painter.rect_filled(rect, 0.0, hex_color(&proj.bg));
        for layer in evaluate::visible_layers(proj, t) {
            self.draw_layer(&painter, rect, layer, t, s);
        }
    }

    fn draw_layer(
        &self,
        painter: &egui::Painter,
        stage: egui::Rect,
        layer: &Layer,
        t: f64,
        s: f32,
    ) {
        let tr = evaluate::layer_transform(layer, t);
        let op = evaluate::layer_opacity(layer, t) as f32;
        let cx = stage.min.x + tr.x as f32 * s;
        let cy = stage.min.y + tr.y as f32 * s;
        let center = egui::Pos2::new(cx, cy);
        match layer.type_.as_str() {
            "shape" => {
                if let Some(sh) = &layer.shape {
                    let fill =
                        hex_color(sh.fill.as_deref().unwrap_or(theme::B1)).gamma_multiply(op);
                    match sh.kind.as_str() {
                        "ring" => {
                            let r = sh.w as f32 / 2.0 * s * tr.scale_x as f32;
                            let w = (sh.h as f32 * 0.08 * s).max(2.0);
                            painter.circle_stroke(center, r, egui::Stroke::new(w, fill));
                        }
                        "circle" => {
                            let r = sh.w as f32 / 2.0 * s * tr.scale_x as f32;
                            painter.circle_filled(center, r, fill);
                        }
                        _ => {
                            // Rect (and other kinds fall back to rect),
                            // drawn as a rotated polygon — rotation is in
                            // degrees, like the Kotlin renderer's
                            // rotate(degrees = ...). Stroke follows the
                            // same outline when set.
                            let hw = sh.w as f32 / 2.0 * s * tr.scale_x as f32;
                            let hh = sh.h as f32 / 2.0 * s * tr.scale_y as f32;
                            let rot = (tr.rotation as f32).to_radians();
                            let (sn, cs) = rot.sin_cos();
                            let corner = |dx: f32, dy: f32| {
                                egui::Pos2::new(
                                    center.x + dx * cs - dy * sn,
                                    center.y + dx * sn + dy * cs,
                                )
                            };
                            let pts = vec![
                                corner(-hw, -hh),
                                corner(hw, -hh),
                                corner(hw, hh),
                                corner(-hw, hh),
                            ];
                            painter.add(egui::Shape::convex_polygon(
                                pts.clone(),
                                fill,
                                egui::Stroke::NONE,
                            ));
                            if let (Some(stroke), w) = (&sh.stroke, sh.stroke_width) {
                                if w > 0.0 {
                                    painter.add(egui::Shape::closed_line(
                                        pts,
                                        egui::Stroke::new(
                                            (w as f32) * s,
                                            hex_color(stroke).gamma_multiply(op),
                                        ),
                                    ));
                                }
                            }
                        }
                    }
                }
            }
            "text" => {
                if let Some(tx) = &layer.text {
                    // Logical text in the model; shaped for display.
                    painter.text(
                        center,
                        egui::Align2::CENTER_CENTER,
                        shp(&tx.content),
                        egui::FontId::new(
                            (tx.size as f32 * s).max(8.0),
                            egui::FontFamily::Proportional,
                        ),
                        hex_color(&tx.color).gamma_multiply(op),
                    );
                }
            }
            "draw" => {
                // Strokes rotate with the layer (degrees, like rects).
                let rot = (tr.rotation as f32).to_radians();
                let (sn, cs) = rot.sin_cos();
                for stroke in &layer.strokes {
                    let pts: Vec<egui::Pos2> = stroke
                        .points
                        .iter()
                        .map(|p| {
                            let rx = p.x as f32 * cs - p.y as f32 * sn;
                            let ry = p.x as f32 * sn + p.y as f32 * cs;
                            egui::Pos2::new(
                                stage.min.x + (tr.x as f32 + rx) * s,
                                stage.min.y + (tr.y as f32 + ry) * s,
                            )
                        })
                        .collect();
                    if pts.len() >= 2 {
                        painter.add(egui::Shape::line(
                            pts,
                            egui::Stroke::new(
                                stroke.width as f32 * s,
                                hex_color(&stroke.color).gamma_multiply(op),
                            ),
                        ));
                    }
                }
            }
            _ => {}
        }
    }
}
