use lyricstudio_engine::evaluate::{layer_transform, value_at};
use lyricstudio_engine::model::{demo_project, Keyframe};

#[test]
fn demo_project_roundtrips_through_json() {
    let p = demo_project();
    let json = serde_json::to_string(&p).unwrap();
    assert!(json.contains("لیریک استودیو"));
    assert!(json.contains("pulse"));
    assert!(json.contains("\"type\":\"shape\""));
    let back: lyricstudio_engine::model::Project = serde_json::from_str(&json).unwrap();
    assert_eq!(back.name, "نمایش");
    assert_eq!(back.width, 720);
    assert_eq!(back.height, 1280);
    assert_eq!(back.layers.len(), 4);
    assert_eq!(back.layers[1].name, "حلقه");
    assert_eq!(back.layers[1].effects[0].id, "pulse");
}

#[test]
fn value_at_interpolates_with_easing() {
    let linear = vec![
        Keyframe {
            t: 0.0,
            value: 0.0,
            ease: "linear".into(),
        },
        Keyframe {
            t: 10.0,
            value: 100.0,
            ease: "linear".into(),
        },
    ];
    assert_eq!(value_at(Some(&linear), 5.0, 0.0), 50.0);
    assert_eq!(value_at(Some(&linear), -1.0, 0.0), 0.0);
    assert_eq!(value_at(Some(&linear), 99.0, 0.0), 100.0);
    assert_eq!(value_at(None, 5.0, 7.0), 7.0);
    // easing name comes from the second keyframe (b.ease)
    let ease_in = vec![
        Keyframe {
            t: 0.0,
            value: 0.0,
            ease: "linear".into(),
        },
        Keyframe {
            t: 10.0,
            value: 100.0,
            ease: "easeIn".into(),
        },
    ];
    assert_eq!(value_at(Some(&ease_in), 5.0, 0.0), 25.0);
}

#[test]
fn pulse_transform_matches_kotlin_math() {
    let p = demo_project();
    let ring = &p.layers[1];
    // pulse: k = 1 + sin(t * 1.5 * 2π) * 0.12; at t=0.5 sin(4.712..) = -1 → k = 0.88
    let tr = layer_transform(ring, 0.5);
    assert!((tr.scale_x - 0.88).abs() < 1e-9, "scale_x = {}", tr.scale_x);
    assert!((tr.scale_y - 0.88).abs() < 1e-9, "scale_y = {}", tr.scale_y);
    // at t=0 the pulse is neutral
    let tr0 = layer_transform(ring, 0.0);
    assert!((tr0.scale_x - 1.0).abs() < 1e-9);
}
