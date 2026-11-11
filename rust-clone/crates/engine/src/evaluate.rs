//! Pure layer evaluation at time t — port of Kotlin `core/Evaluate.kt`
//! (itself a port of web `evaluate.js`). Transform + opacity + animated
//! effects + color filter + repeater. Same math as the web, so projects
//! render identically across web, Kotlin and Rust.

use crate::easing::ease;
use crate::model::{EffectRef, Keyframe, Layer, Project, Transform};
use std::collections::HashMap;
use std::f64::consts::PI;

const PROPS: [&str; 6] = ["x", "y", "scaleX", "scaleY", "rotation", "opacity"];

/// Interpolate one property from its keyframes.
pub fn value_at(keyframes: Option<&[Keyframe]>, t: f64, fallback: f64) -> f64 {
    let kfs = match keyframes {
        Some(k) if !k.is_empty() => {
            let mut v = k.to_vec();
            v.sort_by(|a, b| a.t.partial_cmp(&b.t).unwrap_or(std::cmp::Ordering::Equal));
            v
        }
        _ => return fallback,
    };
    if t <= kfs.first().unwrap().t {
        return kfs.first().unwrap().value;
    }
    if t >= kfs.last().unwrap().t {
        return kfs.last().unwrap().value;
    }
    for i in 0..kfs.len() - 1 {
        let a = &kfs[i];
        let b = &kfs[i + 1];
        if t >= a.t && t <= b.t {
            let span = b.t - a.t;
            let name = if b.ease.is_empty() { &a.ease } else { &b.ease };
            let u = ease(name, (t - a.t) / if span == 0.0 { 1.0 } else { span });
            return a.value + (b.value - a.value) * u;
        }
    }
    fallback
}

/// An effect's params at local time t (inside the layer): resolves param keyframes.
pub fn effect_params_at(fx: &EffectRef, t_local: f64) -> HashMap<String, f64> {
    let mut base = fx.params.clone();
    for (key, list) in &fx.keyframes {
        if !list.is_empty() {
            if let Some(&v) = base.get(key) {
                base.insert(key.clone(), value_at(Some(list), t_local, v));
            }
        }
    }
    base
}

/// Camera zoom at time t — zoom keyframes, else the constant.
pub fn camera_zoom_at(layer: &Layer, t: f64) -> f64 {
    let kfs = layer.keyframes.get("zoom");
    match kfs {
        Some(list) => value_at(
            Some(list),
            t - layer.start,
            layer.camera.as_ref().map(|c| c.zoom).unwrap_or(1.0),
        ),
        None => layer.camera.as_ref().map(|c| c.zoom).unwrap_or(1.0),
    }
}

/// Final transform of a layer at time t (keyframes + animated effects).
pub fn layer_transform(layer: &Layer, t: f64) -> Transform {
    let mut tr = layer.transform.clone();
    for prop in PROPS {
        if let Some(kfs) = layer.keyframes.get(prop) {
            let v = value_at(Some(kfs), t, prop_value(&tr, prop));
            tr = set_prop(tr, prop, v);
        }
    }
    // Animated effects on the transform — same math as the web.
    for fx in layer.effects.iter().filter(|f| f.enabled) {
        let p = effect_params_at(fx, t - layer.start);
        let get = |k: &str, d: f64| -> f64 { *p.get(k).unwrap_or(&d) };
        match fx.id.as_str() {
            "shake" => {
                let s = get("speed", 8.0) * t;
                tr.x += (s * 2.1).sin() * get("amount", 6.0);
                tr.y += (s * 1.7).cos() * get("amount", 6.0);
            }
            "pulse" => {
                let k = 1.0 + (t * get("speed", 2.0) * PI * 2.0).sin() * get("amount", 0.1);
                tr.scale_x *= k;
                tr.scale_y *= k;
            }
            "spin" => tr.rotation += get("speed", 90.0) * t,
            "float" => {
                tr.y += (t * get("speed", 1.0) * PI * 2.0).sin() * get("amount", 10.0)
            }
            "bounce" => {
                let u = (t * get("speed", 2.0)) % 1.0;
                tr.y -= (u * PI).sin().abs() * get("amount", 20.0);
            }
            "kenburns" => {
                let prog = (t - layer.start) / (layer.end - layer.start).max(0.01);
                let k = 1.0 + get("amount", 0.15) * prog.clamp(0.0, 1.0);
                tr.scale_x *= k;
                tr.scale_y *= k;
            }
            "drift" => {
                let a = get("rot", 0.0) * PI / 180.0;
                tr.x += a.cos() * get("speed", 10.0) * t;
                tr.y += a.sin() * get("speed", 10.0) * t;
            }
            "wobble" => {
                let s = t * get("freq", 1.0) * PI * 2.0;
                tr.x += s.sin() * get("amt", 8.0);
                tr.y += (s * 0.7).cos() * get("amt", 8.0) * 0.5;
            }
            "floaty" => {
                tr.y += (t * get("freq", 1.0) * PI * 2.0).sin() * get("amt", 10.0)
            }
            "wiggle" => {
                let s = t * get("freq", 1.0) * PI * 2.0;
                tr.rotation += s.sin() * get("rot", 5.0);
                tr.x += (s * 1.3).sin() * get("amt", 6.0);
            }
            "swing" => {
                tr.rotation += (t * get("freq", 1.0) * PI * 2.0).sin() * get("ang", 10.0)
            }
            "orbit" => {
                let s = t * get("freq", 1.0) * PI * 2.0;
                tr.x += s.cos() * get("r", 20.0);
                tr.y += s.sin() * get("r", 20.0);
            }
            "zoomPulse" => {
                let k = 1.0 + (t * get("freq", 1.0) * PI * 2.0).sin() * get("amt", 0.1);
                tr.scale_x *= k;
                tr.scale_y *= k;
            }
            "mirror" => {
                if get("axis", 0.0) >= 0.5 {
                    tr.scale_y *= -1.0;
                } else {
                    tr.scale_x *= -1.0;
                }
            }
            _ => {}
        }
    }
    tr
}

fn prop_value(tr: &Transform, prop: &str) -> f64 {
    match prop {
        "x" => tr.x,
        "y" => tr.y,
        "scaleX" => tr.scale_x,
        "scaleY" => tr.scale_y,
        "rotation" => tr.rotation,
        "opacity" => tr.opacity,
        _ => 0.0,
    }
}

fn set_prop(mut tr: Transform, prop: &str, v: f64) -> Transform {
    match prop {
        "x" => tr.x = v,
        "y" => tr.y = v,
        "scaleX" => tr.scale_x = v,
        "scaleY" => tr.scale_y = v,
        "rotation" => tr.rotation = v,
        "opacity" => tr.opacity = v,
        _ => {}
    }
    tr
}

/// Final opacity (transform + fade + blink + flash).
pub fn layer_opacity(layer: &Layer, t: f64) -> f64 {
    let mut o = layer_transform(layer, t).opacity;
    for fx in layer.effects.iter().filter(|f| f.enabled) {
        let p = effect_params_at(fx, t - layer.start);
        let get = |k: &str, d: f64| -> f64 { *p.get(k).unwrap_or(&d) };
        match fx.id.as_str() {
            "fade" => o *= get("amount", 1.0),
            "blink" => {
                o *= if (t * get("speed", 4.0) * PI * 2.0).sin() > 0.0 {
                    1.0
                } else {
                    0.15
                }
            }
            "flash" => o *= 0.6 + 0.4 * (t * get("speed", 2.0) * PI * 2.0).sin(),
            "fadePulse" => {
                o *= 1.0 - get("amt", 0.5) * (0.5 + 0.5 * (t * get("freq", 1.0) * PI * 2.0).sin())
            }
            "strobe" => {
                o *= if (t * get("rate", 4.0) * PI * 2.0).sin() > 0.0 {
                    1.0
                } else {
                    1.0 - get("depth", 0.8)
                }
            }
            _ => {}
        }
    }
    o.clamp(0.0, 1.0)
}

/// Is the layer active at time t?
pub fn is_active(layer: &Layer, t: f64) -> bool {
    t >= layer.start && t < layer.end
}

/// Active layers in draw order (bottom of the array = back).
pub fn visible_layers(project: &Project, t: f64) -> Vec<&Layer> {
    project.layers.iter().filter(|l| is_active(l, t)).collect()
}

/// Color-filter params of a layer (kind=filter) — data form of the web filterString.
#[derive(Clone, Debug, PartialEq, Default)]
pub struct FilterParams {
    pub brightness: f64,
    pub contrast: f64,
    pub saturation: f64,
    pub hue_shift: f64,
    pub grayscale: f64,
    pub sepia: f64,
    pub invert: f64,
    pub blur: f64,
}

impl FilterParams {
    pub fn is_identity(&self) -> bool {
        self.brightness == 0.0
            && self.contrast == 0.0
            && self.saturation == 0.0
            && self.hue_shift == 0.0
            && self.grayscale == 0.0
            && self.sepia == 0.0
            && self.invert == 0.0
            && self.blur == 0.0
    }
}

pub fn filter_params_for(layer: &Layer, t: f64) -> FilterParams {
    let mut fp = FilterParams::default();
    for fx in layer.effects.iter().filter(|f| f.enabled) {
        let p = effect_params_at(fx, t - layer.start);
        let get = |k: &str, d: f64| -> f64 { *p.get(k).unwrap_or(&d) };
        match fx.id.as_str() {
            "brightness" => fp.brightness += get("amount", 0.0),
            "contrast" => fp.contrast += get("amount", 0.0),
            "saturation" => fp.saturation += get("amount", 0.0),
            "hueShift" => fp.hue_shift += get("amount", 0.0),
            "grayscale" => fp.grayscale = get("amount", 0.0),
            "sepia" => fp.sepia = get("amount", 0.0),
            "invert" => fp.invert = get("amount", 0.0),
            "blur" => fp.blur = get("amount", 0.0),
            _ => {}
        }
    }
    fp
}

/// Params of the layer's active repeater effect at time t, or None.
#[derive(Clone, Debug, PartialEq)]
pub struct RepeatParams {
    pub count: f64,
    pub dx: f64,
    pub dy: f64,
    pub rot: f64,
    pub scale: f64,
    pub fade: f64,
}

impl Default for RepeatParams {
    fn default() -> Self {
        Self {
            count: 2.0,
            dx: 0.0,
            dy: 0.0,
            rot: 0.0,
            scale: 100.0,
            fade: 0.0,
        }
    }
}

pub fn repeat_of(layer: &Layer, t: f64) -> Option<RepeatParams> {
    for fx in layer.effects.iter().filter(|f| f.enabled) {
        if fx.id == "repeat" {
            let p = effect_params_at(fx, t - layer.start);
            let get = |k: &str, d: f64| -> f64 { *p.get(k).unwrap_or(&d) };
            return Some(RepeatParams {
                count: get("count", 2.0),
                dx: get("dx", 0.0),
                dy: get("dy", 0.0),
                rot: get("rot", 0.0),
                scale: get("scale", 100.0),
                fade: get("fade", 0.0),
            });
        }
    }
    None
}
