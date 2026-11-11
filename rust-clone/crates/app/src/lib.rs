// LyricStudio app entry — egui shell over lyricstudio-engine.
//
// Desktop: `cargo run -p lyricstudio-app`.
// Android: cargo-apk builds this crate as a cdylib; winit (via eframe)
// provides the NativeActivity entry point on Android targets.

pub mod app;

use eframe::egui;

/// IRANSansX weights, shared with the Kotlin app (same files).
const FONT_REGULAR: &[u8] = include_bytes!(
    "../../../../android-native/app/src/main/res/font/iransansx_regular.ttf"
);
const FONT_MEDIUM: &[u8] = include_bytes!(
    "../../../../android-native/app/src/main/res/font/iransansx_medium.ttf"
);
const FONT_BOLD: &[u8] = include_bytes!(
    "../../../../android-native/app/src/main/res/font/iransansx_bold.ttf"
);
const FONT_BLACK: &[u8] = include_bytes!(
    "../../../../android-native/app/src/main/res/font/iransansx_black.ttf"
);

/// Alight design tokens (double-confirmed: apktool + craft-anything parsers).
pub mod theme {
    pub const A12: &str = "#0C0D13";
    pub const A11: &str = "#141620";
    pub const A1: &str = "#191C25";
    pub const A2: &str = "#1E2239";
    #[allow(dead_code)]
    pub const A3: &str = "#242636";
    pub const A4: &str = "#2B2F39";
    #[allow(dead_code)]
    pub const A6: &str = "#363942";
    pub const A9: &str = "#202332";
    pub const B1: &str = "#F16586";
    pub const Y1: &str = "#00FFA8";
    pub const G0: &str = "#FAFAFA";
    pub const P1: &str = "#C4C5CB";
    pub const P4: &str = "#9395A1";
}

/// Parse `#RRGGBB` (or `#AARRGGBB`, alpha ignored) into an egui color.
pub fn hex_color(s: &str) -> egui::Color32 {
    let h = s.trim_start_matches('#');
    let h = if h.len() == 8 { &h[2..] } else { h };
    let v = u32::from_str_radix(h, 16).unwrap_or(0);
    egui::Color32::from_rgb(((v >> 16) & 0xFF) as u8, ((v >> 8) & 0xFF) as u8, (v & 0xFF) as u8)
}

/// `#RRGGBB` from an egui color.
pub fn to_hex(c: egui::Color32) -> String {
    format!("#{:02X}{:02X}{:02X}", c.r(), c.g(), c.b())
}

fn load_fonts(ctx: &egui::Context) {
    let mut fonts = egui::FontDefinitions::default();
    fonts.font_data.insert(
        "IRANSansX".to_owned(),
        egui::FontData::from_static(FONT_REGULAR).into(),
    );
    fonts.font_data.insert(
        "IRANSansX-Medium".to_owned(),
        egui::FontData::from_static(FONT_MEDIUM).into(),
    );
    fonts.font_data.insert(
        "IRANSansX-Bold".to_owned(),
        egui::FontData::from_static(FONT_BOLD).into(),
    );
    fonts.font_data.insert(
        "IRANSansX-Black".to_owned(),
        egui::FontData::from_static(FONT_BLACK).into(),
    );
    // NOTE: egui does not shape Arabic script (no HarfBuzz). Persian text
    // renders with the right glyphs but disconnected forms until a shaper
    // (e.g. rustybuzz) is wired into text layout. Recorded as a known gap.
    fonts
        .families
        .entry(egui::FontFamily::Proportional)
        .or_default()
        .insert(0, "IRANSansX".to_owned());
    ctx.set_fonts(fonts);
}

fn apply_theme(ctx: &egui::Context) {
    let mut v = egui::Visuals::dark();
    v.panel_fill = hex_color(theme::A11);
    v.window_fill = hex_color(theme::A1);
    v.extreme_bg_color = hex_color(theme::A12);
    v.faint_bg_color = hex_color(theme::A9);
    v.code_bg_color = hex_color(theme::A2);
    v.widgets.inactive.bg_fill = hex_color(theme::A4);
    v.widgets.hovered.bg_fill = hex_color(theme::A2);
    v.widgets.active.bg_fill = hex_color(theme::B1);
    v.selection.bg_fill = hex_color(theme::B1);
    v.hyperlink_color = hex_color(theme::Y1);
    ctx.set_visuals(v);
}

/// Run the app (desktop `main` and, via winit, the Android entry).
pub fn run() {
    run_with(eframe::NativeOptions {
        viewport: egui::ViewportBuilder::default()
            .with_inner_size([720.0, 1280.0])
            .with_title("LyricStudio"),
        ..Default::default()
    });
}

/// Android NativeActivity entry point (cargo-apk cdylib). winit requires
/// the `AndroidApp` to reach the event loop; eframe takes it via
/// `NativeOptions::android_app`.
#[cfg(target_os = "android")]
#[no_mangle]
#[allow(improper_ctypes_definitions)] // android-activity's documented entry signature
pub extern "C" fn android_main(app: android_activity::AndroidApp) {
    let mut options = eframe::NativeOptions::default();
    options.android_app = Some(app);
    run_with(options);
}

fn run_with(options: eframe::NativeOptions) {
    let res = eframe::run_native(
        "LyricStudio",
        options,
        Box::new(|cc| {
            load_fonts(&cc.egui_ctx);
            apply_theme(&cc.egui_ctx);
            Ok(Box::new(app::LyricApp::new()))
        }),
    );
    if let Err(e) = res {
        eprintln!("LyricStudio failed to start: {e}");
        std::process::exit(1);
    }
}
