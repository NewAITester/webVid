// LyricStudio UI shell — egui immediate-mode screens over lyricstudio-engine.
// Screens mirror the Alight flows from the REA study (home → create project →
// editor → add popup → element panel), using the double-confirmed tokens/dims.
//
// Known gaps (honest, tracked in rust-rebuild-plan.md):
// - Persian text is drawn with IRANSansX but egui does not shape Arabic
//   script, so text shows disconnected letterforms until a shaper lands.
// - Rect rotation is ignored in the stage painter (no rotated rect shape
//   in egui's painter); circle/ring/text/draw are faithful.
// - Media/audio pickers and MP4 export are not yet wired in this crate.

use eframe::egui;
use lyricstudio_engine::evaluate;
use lyricstudio_engine::model::{demo_project, new_project, uid, Layer, Project, ShapeSpec};

use crate::{hex_color, theme, to_hex};

#[derive(Clone, Copy, PartialEq)]
enum Screen {
    Home,
    Editor,
}

pub struct LyricApp {
    projects: Vec<Project>,
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
    pub fn new() -> Self {
        Self {
            projects: vec![demo_project()],
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
                    ui.label("نسخهٔ راستی");
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
                        if ui.selectable_label(self.home_tab == i, *t).clicked() {
                            self.home_tab = i;
                        }
                    }
                });
            });
        egui::CentralPanel::default().show(ui, |ui| {
            if self.home_tab != 0 {
                ui.centered_and_justified(|ui| {
                    ui.label("این بخش در نسخهٔ بعد می‌آید");
                });
                return;
            }
            ui.heading("پروژه‌ها");
            ui.add_space(8.0);
            let mut open: Option<usize> = None;
            egui::ScrollArea::vertical().show(ui, |ui| {
                ui.horizontal_wrapped(|ui| {
                    for (i, p) in self.projects.iter().enumerate() {
                        let label = format!(
                            "{}\n{}×{} · {}s · {}fps",
                            p.name, p.width, p.height, p.duration as i32, p.fps
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
            if ui.button("＋ پروژهٔ جدید (۹:۱۶)").clicked() {
                self.projects.push(new_project("پروژهٔ جدید"));
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
                    if ui.button("‹ بازگشت").clicked() {
                        self.screen = Screen::Home;
                        self.playing = false;
                    }
                    ui.heading(&name);
                    ui.with_layout(
                        egui::Layout::right_to_left(egui::Align::Center),
                        |ui| {
                            if ui.button("خروجی").clicked() {
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
        egui::Window::new("افزودن")
            .open(&mut open)
            .show(ui.ctx(), |ui| {
                self.add_popup_ui(ui);
            });
        self.add_open = open;

        // Export placeholder — honest: MP4 export is not in the Rust app yet.
        let mut notice = self.export_notice;
        egui::Window::new("خروجی")
            .open(&mut notice)
            .show(ui.ctx(), |ui| {
                ui.label("خروجی MP4 (MediaCodec) در نسخهٔ راستی هنوز پیاده نشده.\nفعلاً خروجی در برنامهٔ کوت‌لین انجام می‌شود.");
            });
        self.export_notice = notice;
    }

    fn timeline_ui(&mut self, ui: &mut egui::Ui, duration: f64) {
        ui.heading("تایم‌لاین");
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
                    &layer.name,
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
            ui.label("لایه‌ای انتخاب نشده");
            return;
        };
        let proj = &mut self.projects[self.current];
        let Some(idx) = proj.layers.iter().position(|l| l.id == sel) else {
            return;
        };
        let playhead = self.playhead;
        ui.label(format!(
            "{} · {}",
            proj.layers[idx].name, proj.layers[idx].type_
        ));
        ui.horizontal(|ui| {
            if ui.button("برش از شروع").clicked() {
                proj.layers[idx].start = playhead;
            }
            if ui.button("تقسیم").clicked() {
                let mut copy = proj.layers[idx].clone();
                copy.id = uid();
                copy.start = playhead;
                proj.layers[idx].end = playhead;
                proj.layers.insert(idx + 1, copy);
            }
            if ui.button("برش از پایان").clicked() {
                proj.layers[idx].end = playhead;
            }
            if ui.button("تکثیر").clicked() {
                let mut copy = proj.layers[idx].clone();
                copy.id = uid();
                copy.name = format!("{} (کپی)", copy.name);
                proj.layers.insert(idx + 1, copy);
            }
        });
        if let Some(sh) = &mut proj.layers[idx].shape {
            ui.horizontal(|ui| {
                ui.label("رنگ");
                let mut c = hex_color(sh.fill.as_deref().unwrap_or(theme::B1));
                if ui.color_edit_button_srgba(&mut c).changed() {
                    sh.fill = Some(to_hex(c));
                }
                ui.add(egui::Slider::new(&mut sh.stroke_width, 0.0..=20.0).text("خط"));
            });
        }
        if let Some(tx) = &mut proj.layers[idx].text {
            ui.text_edit_singleline(&mut tx.content);
            ui.add(egui::Slider::new(&mut tx.size, 12.0..=200.0).text("اندازه"));
            ui.horizontal(|ui| {
                ui.label("رنگ متن");
                let mut c = hex_color(&tx.color);
                if ui.color_edit_button_srgba(&mut c).changed() {
                    tx.color = to_hex(c);
                }
            });
        }
        ui.add(
            egui::Slider::new(&mut proj.layers[idx].transform.opacity, 0.0..=1.0)
                .text("شفافیت"),
        );
    }

    fn add_popup_ui(&mut self, ui: &mut egui::Ui) {
        ui.horizontal(|ui| {
            for (i, t) in ["شکل‌ها", "رسانه", "صوت", "شی‌ها", "قالب‌ها"]
                .iter()
                .enumerate()
            {
                if ui.selectable_label(self.add_tab == i, *t).clicked() {
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
                ui.label("انتخاب فایل رسانه/صوت در نسخهٔ بعد می‌آید");
            }
            3 => {
                ui.horizontal(|ui| {
                    if ui.button("دوربین").clicked() {
                        self.insert_camera();
                    }
                    if ui.button("Null").clicked() {
                        self.insert_null();
                    }
                    if ui.button("گروه خالی").clicked() {
                        self.insert_group();
                    }
                });
            }
            _ => {
                if ui.button("قالب نمایشی (۴ لایه)").clicked() {
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
    }

    fn insert_camera(&mut self) {
        let proj = &mut self.projects[self.current];
        let mut l = Layer::new("camera", "دوربین", 0.0, proj.duration);
        l.camera = Some(Default::default());
        proj.layers.push(l);
    }

    fn insert_null(&mut self) {
        let proj = &mut self.projects[self.current];
        proj.layers.push(Layer::new("null", "Null", 0.0, proj.duration));
    }

    fn insert_group(&mut self) {
        let proj = &mut self.projects[self.current];
        proj.layers
            .push(Layer::new("group", "گروه خالی", 0.0, proj.duration));
    }

    fn insert_demo_group(&mut self) {
        let proj = &mut self.projects[self.current];
        let mut g = Layer::new("group", "قالب نمایشی", 0.0, proj.duration);
        g.children = demo_project().layers;
        proj.layers.push(g);
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
                            // rect (and other kinds fall back to rect);
                            // rotation is ignored — egui has no rotated rect.
                            let hw = sh.w as f32 / 2.0 * s * tr.scale_x as f32;
                            let hh = sh.h as f32 / 2.0 * s * tr.scale_y as f32;
                            painter.rect_filled(
                                egui::Rect::from_center_size(
                                    center,
                                    egui::Vec2::new(hw * 2.0, hh * 2.0),
                                ),
                                0.0,
                                fill,
                            );
                        }
                    }
                }
            }
            "text" => {
                if let Some(tx) = &layer.text {
                    // Persian shaping gap: glyphs render disconnected until
                    // a shaper (rustybuzz) is integrated.
                    painter.text(
                        center,
                        egui::Align2::CENTER_CENTER,
                        &tx.content,
                        egui::FontId::new(
                            (tx.size as f32 * s).max(8.0),
                            egui::FontFamily::Proportional,
                        ),
                        hex_color(&tx.color).gamma_multiply(op),
                    );
                }
            }
            "draw" => {
                for stroke in &layer.strokes {
                    let pts: Vec<egui::Pos2> = stroke
                        .points
                        .iter()
                        .map(|p| {
                            egui::Pos2::new(
                                stage.min.x + (tr.x + p.x) as f32 * s,
                                stage.min.y + (tr.y + p.y) as f32 * s,
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
