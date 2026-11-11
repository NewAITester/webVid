//! LyricStudio Rust engine — pure compute core for the full-Rust Alight clone.
//!
//! The model mirrors the Kotlin/JSON schema (`model/Project.kt`, web `schema.js`)
//! so projects move between web, Kotlin and Rust unchanged. `evaluate` ports
//! `core/Evaluate.kt` exactly; `fx` is the 22-effect pixel core (same math as
//! the web Rust/WASM core, parity max diff 0).

pub mod easing;
pub mod evaluate;
pub mod fx;
pub mod model;
pub mod shape;

pub use model::*;
