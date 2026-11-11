//! Project model — port of Kotlin `model/Project.kt` (same JSON keys, same defaults).
//! Layer order: bottom = back, top = front. Serializes to the same JSON the
//! web schema and the Kotlin app use, so projects are interchangeable.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};

static COUNTER: AtomicU64 = AtomicU64::new(0);

/// Short unique id (12 hex chars), same shape as the Kotlin `uid()`.
pub fn uid() -> String {
    let n = COUNTER.fetch_add(1, Ordering::Relaxed);
    let t = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    format!(
        "{:012x}",
        (t ^ n.wrapping_mul(0x9e3779b97f4a7c15) as u128) & 0xffff_ffff_ffffu128
    )
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct Project {
    pub id: String,
    pub name: String,
    pub width: i32,
    pub height: i32,
    pub fps: i32,
    pub duration: f64,
    pub bg: String,
    pub layers: Vec<Layer>,
}

impl Default for Project {
    fn default() -> Self {
        Self {
            id: uid(),
            name: String::new(),
            width: 720,
            height: 1280,
            fps: 30,
            duration: 10.0,
            bg: "#0C0D13".to_string(),
            layers: vec![],
        }
    }
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct Transform {
    pub x: f64,
    pub y: f64,
    pub scale_x: f64,
    pub scale_y: f64,
    pub rotation: f64,
    pub opacity: f64,
    pub anchor_x: f64,
    pub anchor_y: f64,
}

impl Default for Transform {
    fn default() -> Self {
        Self {
            x: 0.0,
            y: 0.0,
            scale_x: 1.0,
            scale_y: 1.0,
            rotation: 0.0,
            opacity: 1.0,
            anchor_x: 0.5,
            anchor_y: 0.5,
        }
    }
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct Keyframe {
    pub t: f64,
    pub value: f64,
    /// easing name of this keyframe (linear | easeIn | easeOut | ...)
    pub ease: String,
}

impl Default for Keyframe {
    fn default() -> Self {
        Self {
            t: 0.0,
            value: 0.0,
            ease: "linear".to_string(),
        }
    }
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct EffectRef {
    pub id: String,
    pub params: HashMap<String, f64>,
    pub enabled: bool,
    /// text params (e.g. colors), kept apart from numeric params
    pub text_params: HashMap<String, String>,
    pub keyframes: HashMap<String, Vec<Keyframe>>,
}

impl Default for EffectRef {
    fn default() -> Self {
        Self {
            id: String::new(),
            params: HashMap::new(),
            enabled: true,
            text_params: HashMap::new(),
            keyframes: HashMap::new(),
        }
    }
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct ShapeSpec {
    pub kind: String,
    pub fill: Option<String>,
    pub stroke: Option<String>,
    pub stroke_width: f64,
    pub w: f64,
    pub h: f64,
}

impl Default for ShapeSpec {
    fn default() -> Self {
        Self {
            kind: "rect".to_string(),
            fill: None,
            stroke: None,
            stroke_width: 0.0,
            w: 100.0,
            h: 100.0,
        }
    }
}

#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct WordTiming {
    pub t: f64,
    pub text: String,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct TextSpec {
    pub content: String,
    pub font: String,
    pub weight: i32,
    pub size: f64,
    pub color: String,
    pub align: String,
    pub line_height: f64,
    /// word timings (relative to layer start) for karaoke — from LRC
    pub words: Vec<WordTiming>,
}

impl Default for TextSpec {
    fn default() -> Self {
        Self {
            content: String::new(),
            font: "IRANSansX".to_string(),
            weight: 400,
            size: 48.0,
            color: "#FAFAFA".to_string(),
            align: "center".to_string(),
            line_height: 1.3,
            words: vec![],
        }
    }
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct AudioSpec {
    pub src: Option<String>,
    pub volume: f64,
    pub fade_in: f64,
    pub fade_out: f64,
}

impl Default for AudioSpec {
    fn default() -> Self {
        Self {
            src: None,
            volume: 1.0,
            fade_in: 0.0,
            fade_out: 0.0,
        }
    }
}

/// One freehand stroke point — relative to the layer center.
#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct StrokePoint {
    pub x: f64,
    pub y: f64,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct Stroke {
    pub color: String,
    pub width: f64,
    pub points: Vec<StrokePoint>,
}

impl Default for Stroke {
    fn default() -> Self {
        Self {
            color: "#FAFAFA".to_string(),
            width: 5.0,
            points: vec![],
        }
    }
}

/// Camera layer settings: scene zoom.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct CameraSpec {
    pub zoom: f64,
}

impl Default for CameraSpec {
    fn default() -> Self {
        Self { zoom: 1.0 }
    }
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct Layer {
    pub id: String,
    /// shape | text | image | video | audio | draw | group | camera | null
    #[serde(rename = "type")]
    pub type_: String,
    pub name: String,
    pub start: f64,
    pub end: f64,
    /// none | below | belowInv
    pub clip: String,
    pub transform: Transform,
    pub keyframes: HashMap<String, Vec<Keyframe>>,
    pub effects: Vec<EffectRef>,
    pub shape: Option<ShapeSpec>,
    pub text: Option<TextSpec>,
    pub audio: Option<AudioSpec>,
    /// media source (image/video/audio): file path or content:// URI
    pub src: Option<String>,
    /// children of a group layer
    pub children: Vec<Layer>,
    /// freehand strokes of a draw layer
    pub strokes: Vec<Stroke>,
    /// camera layer settings
    pub camera: Option<CameraSpec>,
    /// blend mode (normal | multiply | screen | overlay | ...)
    pub blend: String,
    pub solo: bool,
}

impl Default for Layer {
    fn default() -> Self {
        Self {
            id: uid(),
            type_: String::new(),
            name: String::new(),
            start: 0.0,
            end: 10.0,
            clip: "none".to_string(),
            transform: Transform::default(),
            keyframes: HashMap::new(),
            effects: vec![],
            shape: None,
            text: None,
            audio: None,
            src: None,
            children: vec![],
            strokes: vec![],
            camera: None,
            blend: "normal".to_string(),
            solo: false,
        }
    }
}

impl Layer {
    pub fn new(type_: &str, name: &str, start: f64, end: f64) -> Self {
        Self {
            id: uid(),
            type_: type_.to_string(),
            name: name.to_string(),
            start,
            end,
            ..Default::default()
        }
    }
}

pub fn new_project(name: &str) -> Project {
    Project {
        id: uid(),
        name: name.to_string(),
        ..Default::default()
    }
}

/// Demo project — same as the web demo (4 layers, 10s).
pub fn demo_project() -> Project {
    let bg = Layer {
        name: "پس‌زمینه".to_string(),
        shape: Some(ShapeSpec {
            kind: "rect".to_string(),
            fill: Some("#141620".to_string()),
            w: 720.0,
            h: 1280.0,
            ..Default::default()
        }),
        transform: Transform {
            x: 360.0,
            y: 640.0,
            ..Default::default()
        },
        ..Layer::new("shape", "پس‌زمینه", 0.0, 10.0)
    };
    let ring = Layer {
        shape: Some(ShapeSpec {
            kind: "ring".to_string(),
            fill: Some("#F16586".to_string()),
            w: 420.0,
            h: 420.0,
            ..Default::default()
        }),
        transform: Transform {
            x: 360.0,
            y: 560.0,
            ..Default::default()
        },
        effects: vec![EffectRef {
            id: "pulse".to_string(),
            params: [("amount".to_string(), 0.12), ("speed".to_string(), 1.5)]
                .into_iter()
                .collect(),
            ..Default::default()
        }],
        ..Layer::new("shape", "حلقه", 0.0, 10.0)
    };
    let title = Layer {
        text: Some(TextSpec {
            content: "لیریک استودیو".to_string(),
            weight: 900,
            size: 72.0,
            color: "#FAFAFA".to_string(),
            ..Default::default()
        }),
        transform: Transform {
            x: 360.0,
            y: 640.0,
            ..Default::default()
        },
        ..Layer::new("text", "عنوان", 0.3, 9.0)
    };
    let sub = Layer {
        text: Some(TextSpec {
            content: "مثل آلایت موشن".to_string(),
            weight: 500,
            size: 34.0,
            color: "#C4C5CB".to_string(),
            ..Default::default()
        }),
        transform: Transform {
            x: 360.0,
            y: 730.0,
            ..Default::default()
        },
        ..Layer::new("text", "زیرنویس", 1.0, 9.0)
    };
    Project {
        name: "نمایش".to_string(),
        layers: vec![bg, ring, title, sub],
        ..new_project("نمایش")
    }
}
