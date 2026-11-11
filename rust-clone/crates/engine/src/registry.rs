//! Effect registry for the 22 Rust pixel effects (`fx.rs`) + dispatch.
//!
//! Ids, Persian names, categories and param defs mirror the Kotlin
//! registry (`Effects.kt`) so `EffectRef`s stay compatible across
//! web / Kotlin / Rust. The dispatch is a safe wrapper around the
//! `#[no_mangle]` FFI functions in `fx.rs`.
//!
//! Param conventions (from `FxImpls.kt`): numeric params come from
//! `EffectRef.params` (animated by keyframes via
//! `evaluate::effect_params_at`); colors come from
//! `EffectRef.text_params` as `#RRGGBB`. Time-based effects (flicker,
//! invertPulse) take the layer-local time in seconds.

use crate::fx;
use crate::model::EffectRef;
use std::collections::HashMap;

#[derive(Clone, Copy, PartialEq)]
pub enum ParamKind {
    Number,
    Color,
}

#[derive(Clone, Copy)]
pub struct ParamDef {
    pub key: &'static str,
    pub label: &'static str,
    pub kind: ParamKind,
    pub default_num: f64,
    pub default_str: &'static str,
    pub min: f64,
    pub max: f64,
}

pub struct FxDef {
    pub id: &'static str,
    pub name: &'static str,
    pub cat: &'static str,
    pub params: &'static [ParamDef],
}

const fn num(key: &'static str, label: &'static str, def: f64, min: f64, max: f64) -> ParamDef {
    ParamDef {
        key,
        label,
        kind: ParamKind::Number,
        default_num: def,
        default_str: "",
        min,
        max,
    }
}

const fn col(key: &'static str, label: &'static str, def: &'static str) -> ParamDef {
    ParamDef {
        key,
        label,
        kind: ParamKind::Color,
        default_num: 0.0,
        default_str: def,
        min: 0.0,
        max: 0.0,
    }
}

/// The 22 effects implemented in `fx.rs`, in the Kotlin registry's
/// category order (color first, then stylize).
pub static FX_REGISTRY: &[FxDef] = &[
    FxDef {
        id: "duotone",
        name: "دوتُن",
        cat: "color",
        params: &[
            col("c1", "رنگ تیره‌ها", "#1B0B3A"),
            col("c2", "رنگ روشن‌ها", "#FF4D6D"),
            num("amt", "میزان", 100.0, 0.0, 100.0),
        ],
    },
    FxDef {
        id: "posterize",
        name: "پوستریز",
        cat: "color",
        params: &[num("levels", "سطح", 4.0, 2.0, 16.0)],
    },
    FxDef {
        id: "threshold",
        name: "آستانه",
        cat: "color",
        params: &[
            num("level", "مرز", 50.0, 0.0, 100.0),
            col("c1", "تیره", "#000000"),
            col("c2", "روشن", "#FFFFFF"),
        ],
    },
    FxDef {
        id: "vibrance",
        name: "سرزندگی رنگ",
        cat: "color",
        params: &[num("amt", "شدت", 50.0, 0.0, 200.0)],
    },
    FxDef {
        id: "lumaKey",
        name: "کلید روشنایی",
        cat: "stylize",
        params: &[
            num("level", "مرز", 50.0, 0.0, 100.0),
            num("soft", "نرمی", 20.0, 0.0, 100.0),
            num("mode", "حالت", 0.0, 0.0, 1.0),
        ],
    },
    FxDef {
        id: "matte",
        name: "مات تیره/روشن",
        cat: "stylize",
        params: &[
            num("level", "مرز", 50.0, 0.0, 100.0),
            num("soft", "نرمی", 20.0, 0.0, 100.0),
            num("mode", "حالت", 0.0, 0.0, 1.0),
        ],
    },
    FxDef {
        id: "solarize",
        name: "سولاریزه",
        cat: "color",
        params: &[num("level", "مرز", 50.0, 0.0, 100.0)],
    },
    FxDef {
        id: "invert",
        name: "معکوس",
        cat: "color",
        params: &[num("amount", "مقدار", 1.0, 0.0, 1.0)],
    },
    FxDef {
        id: "temperature",
        name: "دما",
        cat: "color",
        params: &[num("amt", "دما", 30.0, -100.0, 100.0)],
    },
    FxDef {
        id: "exposure",
        name: "نوردهی",
        cat: "color",
        params: &[num("amt", "مقدار", 20.0, -100.0, 100.0)],
    },
    FxDef {
        id: "levels",
        name: "سطوح رنگ",
        cat: "color",
        params: &[
            num("black", "سیاه", 0.0, 0.0, 100.0),
            num("white", "سفید", 100.0, 0.0, 100.0),
            num("gamma", "گاما", 100.0, 10.0, 300.0),
        ],
    },
    FxDef {
        id: "sepia",
        name: "سپیا",
        cat: "color",
        params: &[num("amount", "مقدار", 1.0, 0.0, 1.0)],
    },
    FxDef {
        id: "comic",
        name: "کمیک",
        cat: "stylize",
        params: &[num("level", "مرز", 50.0, 0.0, 100.0)],
    },
    FxDef {
        id: "infrared",
        name: "مادون قرمز",
        cat: "color",
        params: &[],
    },
    FxDef {
        id: "thermal",
        name: "حرارتی",
        cat: "color",
        params: &[],
    },
    FxDef {
        id: "tritone",
        name: "سه‌تُن",
        cat: "color",
        params: &[
            col("c1", "رنگ سایه‌ها", "#0B1026"),
            col("c2", "رنگ میانه‌ها", "#E4142A"),
            col("c3", "رنگ روشن‌ها", "#FFD86B"),
        ],
    },
    FxDef {
        id: "crossProcess",
        name: "کراس‌پروسس",
        cat: "color",
        params: &[num("amt", "شدت", 70.0, 0.0, 100.0)],
    },
    FxDef {
        id: "silhouette",
        name: "سیلوئت",
        cat: "color",
        params: &[col("color", "رنگ", "#111111")],
    },
    FxDef {
        id: "xray",
        name: "اشعهٔ ایکس",
        cat: "color",
        params: &[],
    },
    FxDef {
        id: "colorPop",
        name: "رنگ گزینشی",
        cat: "color",
        params: &[
            col("color", "رنگ", "#E4142A"),
            num("tol", "دامنه", 40.0, 0.0, 100.0),
        ],
    },
    FxDef {
        id: "flicker",
        name: "سوسو",
        cat: "stylize",
        params: &[num("amt", "شدت", 30.0, 0.0, 100.0)],
    },
    FxDef {
        id: "invertPulse",
        name: "معکوس تپنده",
        cat: "color",
        params: &[num("amt", "شدت", 70.0, 0.0, 100.0)],
    },
];

pub fn fx_def(id: &str) -> Option<&'static FxDef> {
    FX_REGISTRY.iter().find(|d| d.id == id)
}

/// A fresh `EffectRef` for an id, with the registry defaults filled in.
pub fn default_effect(id: &str) -> Option<EffectRef> {
    let def = fx_def(id)?;
    let mut params = HashMap::new();
    let mut text_params = HashMap::new();
    for p in def.params {
        match p.kind {
            ParamKind::Number => {
                params.insert(p.key.to_string(), p.default_num);
            }
            ParamKind::Color => {
                text_params.insert(p.key.to_string(), p.default_str.to_string());
            }
        }
    }
    Some(EffectRef {
        id: id.to_string(),
        params,
        enabled: true,
        text_params,
        keyframes: HashMap::new(),
    })
}

/// Parse `#RRGGBB` (or `#RGB`) into 0–255 channel values; `(0,0,0)` on
/// anything unparsable. Also used by the renderer for shape/text colors.
pub fn parse_hex_rgb(s: &str) -> (f64, f64, f64) {
    let h = s.trim().trim_start_matches('#');
    let bytes = h.as_bytes();
    let pair = |i: usize| -> f64 {
        if i + 1 < bytes.len() {
            u8::from_str_radix(&h[i..i + 2], 16).unwrap_or(0) as f64
        } else {
            0.0
        }
    };
    if bytes.len() == 3 {
        let d = |i: usize| -> f64 {
            let v = u8::from_str_radix(&h[i..i + 1], 16).unwrap_or(0);
            (v * 17) as f64
        };
        (d(0), d(1), d(2))
    } else {
        (pair(0), pair(2), pair(4))
    }
}

fn pnum(params: &HashMap<String, f64>, key: &str, default: f64) -> f64 {
    params.get(key).copied().unwrap_or(default)
}

fn pcol(text_params: &HashMap<String, String>, key: &str, default: &str) -> (f64, f64, f64) {
    text_params
        .get(key)
        .map(|s| parse_hex_rgb(s))
        .unwrap_or_else(|| parse_hex_rgb(default))
}

/// Apply one effect, in place, to an RGBA8 buffer (`w * h * 4` bytes).
/// `t` is the layer-local time in seconds (for flicker / invertPulse).
/// Returns `false` for unknown ids (caller keeps the buffer unchanged).
/// The `fx_*` FFI functions only touch pixels with alpha > 0.
pub fn apply_effect(
    id: &str,
    buf: &mut [u8],
    w: usize,
    h: usize,
    params: &HashMap<String, f64>,
    text_params: &HashMap<String, String>,
    t: f64,
) -> bool {
    if buf.is_empty() || w == 0 || h == 0 {
        return false;
    }
    let len = buf.len();
    let ptr = buf.as_mut_ptr();
    // SAFETY: the fx_* functions take a valid (ptr, len) pair for the
    // buffer and only write inside it; all args are plain f64s.
    unsafe {
        match id {
            "duotone" => {
                let (r1, g1, b1) = pcol(text_params, "c1", "#1B0B3A");
                let (r2, g2, b2) = pcol(text_params, "c2", "#FF4D6D");
                fx::fx_duotone(ptr, len, r1, g1, b1, r2, g2, b2, pnum(params, "amt", 100.0));
            }
            "posterize" => fx::fx_posterize(ptr, len, pnum(params, "levels", 4.0)),
            "threshold" => {
                let (r1, g1, b1) = pcol(text_params, "c1", "#000000");
                let (r2, g2, b2) = pcol(text_params, "c2", "#FFFFFF");
                fx::fx_threshold(
                    ptr,
                    len,
                    pnum(params, "level", 50.0),
                    r1,
                    g1,
                    b1,
                    r2,
                    g2,
                    b2,
                );
            }
            "vibrance" => fx::fx_vibrance(ptr, len, pnum(params, "amt", 50.0)),
            "lumaKey" => fx::fx_lumakey(
                ptr,
                len,
                pnum(params, "level", 50.0),
                pnum(params, "soft", 20.0),
                pnum(params, "mode", 0.0),
            ),
            "matte" => fx::fx_matte(
                ptr,
                len,
                pnum(params, "level", 50.0),
                pnum(params, "soft", 20.0),
                pnum(params, "mode", 0.0),
            ),
            "solarize" => fx::fx_solarize(ptr, len, pnum(params, "level", 50.0)),
            "invert" => {
                // fx_invert is full invert; the registry "amount" (0–1)
                // blends back toward the original, like Kotlin.
                let amount = pnum(params, "amount", 1.0).clamp(0.0, 1.0);
                if amount >= 1.0 {
                    fx::fx_invert(ptr, len);
                } else if amount > 0.0 {
                    let original = buf.to_vec();
                    fx::fx_invert(ptr, len);
                    for (i, px) in buf.chunks_exact_mut(4).enumerate() {
                        if px[3] == 0 {
                            continue;
                        }
                        let o = &original[i * 4..];
                        for c in 0..3 {
                            px[c] = (o[c] as f64 + (px[c] as f64 - o[c] as f64) * amount)
                                .round() as u8;
                        }
                    }
                }
            }
            "temperature" => fx::fx_temperature(ptr, len, pnum(params, "amt", 30.0)),
            "exposure" => fx::fx_exposure(ptr, len, pnum(params, "amt", 20.0)),
            "levels" => fx::fx_levels(
                ptr,
                len,
                pnum(params, "black", 0.0),
                pnum(params, "white", 100.0),
                pnum(params, "gamma", 100.0),
            ),
            "sepia" => {
                // Registry "amount" is 0–1; fx_sepia takes 0–100.
                fx::fx_sepia(ptr, len, pnum(params, "amount", 1.0) * 100.0);
            }
            "comic" => fx::fx_comic(ptr, len, pnum(params, "level", 50.0)),
            "infrared" => fx::fx_infrared(ptr, len),
            "thermal" => fx::fx_thermal(ptr, len),
            "tritone" => {
                let (r1, g1, b1) = pcol(text_params, "c1", "#0B1026");
                let (r2, g2, b2) = pcol(text_params, "c2", "#E4142A");
                let (r3, g3, b3) = pcol(text_params, "c3", "#FFD86B");
                fx::fx_tritone(ptr, len, r1, g1, b1, r2, g2, b2, r3, g3, b3);
            }
            "crossProcess" => fx::fx_cross_process(ptr, len, pnum(params, "amt", 70.0)),
            "silhouette" => {
                let (r, g, b) = pcol(text_params, "color", "#111111");
                fx::fx_silhouette(ptr, len, r, g, b);
            }
            "xray" => fx::fx_xray(ptr, len),
            "colorPop" => {
                let (r, g, b) = pcol(text_params, "color", "#E4142A");
                fx::fx_color_pop(ptr, len, r, g, b, pnum(params, "tol", 40.0));
            }
            "flicker" => fx::fx_flicker(ptr, len, t, pnum(params, "amt", 30.0)),
            "invertPulse" => fx::fx_invert_pulse(ptr, len, t, pnum(params, "amt", 70.0)),
            _ => return false,
        }
    }
    let _ = (w, h);
    true
}

#[cfg(test)]
mod tests {
    use super::*;

    fn solid(w: usize, h: usize, r: u8, g: u8, b: u8) -> Vec<u8> {
        let mut v = vec![0u8; w * h * 4];
        for px in v.chunks_exact_mut(4) {
            px[0] = r;
            px[1] = g;
            px[2] = b;
            px[3] = 255;
        }
        v
    }

    #[test]
    fn registry_has_22_with_defaults() {
        assert_eq!(FX_REGISTRY.len(), 22);
        let d = default_effect("duotone").unwrap();
        assert_eq!(d.text_params["c1"], "#1B0B3A");
        assert_eq!(d.params["amt"], 100.0);
        assert!(default_effect("nope").is_none());
    }

    #[test]
    fn invert_changes_pixels_and_amount_zero_is_identity() {
        let mut buf = solid(4, 4, 200, 100, 50);
        let before = buf.clone();
        apply_effect("invert", &mut buf, 4, 4, &HashMap::new(), &HashMap::new(), 0.0);
        assert_eq!((buf[0], buf[1], buf[2]), (55, 155, 205));
        // amount 0 on a fresh copy keeps the original.
        let mut p = HashMap::new();
        p.insert("amount".to_string(), 0.0);
        let mut fresh = before.clone();
        apply_effect("invert", &mut fresh, 4, 4, &p, &HashMap::new(), 0.0);
        assert_eq!(fresh, before);
    }

    #[test]
    fn unknown_effect_is_a_noop() {
        let mut buf = solid(2, 2, 10, 20, 30);
        assert!(!apply_effect(
            "warp_drive",
            &mut buf,
            2,
            2,
            &HashMap::new(),
            &HashMap::new(),
            0.0
        ));
        assert_eq!(buf[0], 10);
    }

    #[test]
    fn parse_hex_rgb_works() {
        assert_eq!(parse_hex_rgb("#FF4D6D"), (255.0, 77.0, 109.0));
        assert_eq!(parse_hex_rgb("#000"), (0.0, 0.0, 0.0));
        assert_eq!(parse_hex_rgb("zzz"), (0.0, 0.0, 0.0));
    }
}
