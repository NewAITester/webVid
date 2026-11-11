//! Easing curves — port of Kotlin `core/Easing.kt` (pure port of web `easing.js`).
//! No DOM, no Math.random (deterministic sin-hash instead).

pub fn linear(t: f64) -> f64 {
    t
}

pub fn ease_in(t: f64) -> f64 {
    t * t
}

pub fn ease_out(t: f64) -> f64 {
    1.0 - (1.0 - t) * (1.0 - t)
}

pub fn ease_in_out(t: f64) -> f64 {
    if t < 0.5 {
        2.0 * t * t
    } else {
        1.0 - (-2.0 * t + 2.0).powi(2) / 2.0
    }
}

pub fn ease_out_cubic(t: f64) -> f64 {
    1.0 - (1.0 - t).powi(3)
}

pub fn ease_in_cubic(t: f64) -> f64 {
    t * t * t
}

pub fn ease_out_back(t: f64) -> f64 {
    let c = 1.70158;
    1.0 + (c + 1.0) * (t - 1.0).powi(3) + c * (t - 1.0).powi(2)
}

/// Deterministic noise (in place of Math.random): same sin-hash as the web.
pub fn hash(i: f64) -> f64 {
    let s = (i * 12.9898).sin() * 43758.5453;
    s - s.floor()
}

pub fn ease(name: &str, t: f64) -> f64 {
    let c = t.clamp(0.0, 1.0);
    match name {
        "easeIn" => ease_in(c),
        "easeOut" => ease_out(c),
        "easeInOut" => ease_in_out(c),
        "easeOutCubic" => ease_out_cubic(c),
        "easeInCubic" => ease_in_cubic(c),
        "easeOutBack" => ease_out_back(c),
        _ => linear(c),
    }
}

/// Cubic bezier curve (for custom keyframes) — port of the web cubicBezier.
pub fn cubic_bezier(p1x: f64, p1y: f64, p2x: f64, p2y: f64) -> impl Fn(f64) -> f64 {
    let cx = 3.0 * p1x;
    let bx = 3.0 * (p2x - p1x) - cx;
    let ax = 1.0 - cx - bx;
    let cy = 3.0 * p1y;
    let by = 3.0 * (p2y - p1y) - cy;
    let ay = 1.0 - cy - by;
    move |x: f64| {
        let sx = |t: f64| ((ax * t + bx) * t + cx) * t;
        let sy = |t: f64| ((ay * t + by) * t + cy) * t;
        let mut t = x;
        for _ in 0..5 {
            let e = sx(t) - x;
            if e.abs() < 1e-4 {
                break;
            }
            let d = (3.0 * ax * t + 2.0 * bx) * t + cx;
            if d.abs() < 1e-6 {
                break;
            }
            t -= e / d;
        }
        sy(t.clamp(0.0, 1.0))
    }
}
