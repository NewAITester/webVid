//! Minimal Arabic-script shaping for egui.
//!
//! egui lays text out left-to-right with no joining, so Persian shows
//! disconnected letterforms. This converts a *logical* Persian/Arabic
//! string to its *visual* form: each letter is replaced by its contextual
//! presentation form (U+FB50–U+FDFF / U+FE70–U+FEFF) and the string is
//! reordered for RTL display. This is a **display transform only** — the
//! model always stores logical text.
//!
//! Rules implemented (from Unicode ArabicShaping.txt):
//! - joining types: dual-joining (both sides), right-joining (from the
//!   previous letter only), non-joining.
//! - lam–alef ligatures (ﻻ ﻵ ﻷ ﻹ).
//! - ZWNJ (U+200C, the Persian half-space) breaks joining and becomes a
//!   thin space (U+2009) — the same trick used for the Bendy fallback.
//! - ZWJ / tatweel / combining marks are transparent to joining.
//! - Directional runs: RTL runs are reversed internally, Latin/digit runs
//!   keep their order, and run order is reversed — a bidi-lite that keeps
//!   numbers like «۱۲۳» intact inside Persian sentences.
//!
//! Known limits: no full UBA (nested embeddings, mirrored brackets), no
//! diacritic positioning (marks are kept after their base letter), and
//! mixed-script edge cases may order imperfectly. The stage text and the
//! UI labels are shaped; the text-edit field keeps logical text while
//! editing (shaping it would desync the cursor).

#[derive(Clone, Copy, PartialEq)]
enum Join {
    /// Joins both sides (ب س ل م …).
    Dual,
    /// Joins only from the previous letter (ا د ر و …).
    Right,
    /// Never joins (ء, digits, Latin, space).
    Non,
    /// Invisible to joining (tatweel, combining marks, ZWJ).
    Transparent,
}

/// (isolated, final, initial, medial) presentation forms of one letter.
/// Right-joining letters never take initial/medial forms.
struct Forms {
    isolated: char,
    final_form: char,
    initial: char,
    medial: char,
}

const fn f(iso: char, fin: char, init: char, med: char) -> Forms {
    Forms {
        isolated: iso,
        final_form: fin,
        initial: init,
        medial: med,
    }
}

/// Joining type + presentation forms for a base letter, or `None` when the
/// character is not a joining Arabic letter.
fn letter(c: char) -> Option<(Join, Forms)> {
    Some(match c {
        // Non-joining.
        '\u{0621}' => (Join::Non, f('\u{FE80}', '\u{FE80}', '\u{FE80}', '\u{FE80}')),
        // Right-joining.
        '\u{0622}' => (Join::Right, f('\u{FE81}', '\u{FE82}', '\u{FE81}', '\u{FE82}')),
        '\u{0623}' => (Join::Right, f('\u{FE83}', '\u{FE84}', '\u{FE83}', '\u{FE84}')),
        '\u{0624}' => (Join::Right, f('\u{FE85}', '\u{FE86}', '\u{FE85}', '\u{FE86}')),
        '\u{0625}' => (Join::Right, f('\u{FE87}', '\u{FE88}', '\u{FE87}', '\u{FE88}')),
        '\u{0627}' => (Join::Right, f('\u{FE8D}', '\u{FE8E}', '\u{FE8D}', '\u{FE8E}')),
        '\u{0629}' => (Join::Right, f('\u{FE93}', '\u{FE94}', '\u{FE93}', '\u{FE94}')),
        '\u{062F}' => (Join::Right, f('\u{FEA9}', '\u{FEAA}', '\u{FEA9}', '\u{FEAA}')),
        '\u{0630}' => (Join::Right, f('\u{FEAB}', '\u{FEAC}', '\u{FEAB}', '\u{FEAC}')),
        '\u{0631}' => (Join::Right, f('\u{FEAD}', '\u{FEAE}', '\u{FEAD}', '\u{FEAE}')),
        '\u{0632}' => (Join::Right, f('\u{FEAF}', '\u{FEB0}', '\u{FEAF}', '\u{FEB0}')),
        '\u{0648}' => (Join::Right, f('\u{FEED}', '\u{FEEE}', '\u{FEED}', '\u{FEEE}')),
        '\u{0649}' => (Join::Right, f('\u{FEEF}', '\u{FEF0}', '\u{FEEF}', '\u{FEF0}')),
        '\u{0698}' => (Join::Right, f('\u{FB8A}', '\u{FB8B}', '\u{FB8A}', '\u{FB8B}')),
        // Dual-joining.
        '\u{0626}' => (Join::Dual, f('\u{FE89}', '\u{FE8A}', '\u{FE8B}', '\u{FE8C}')),
        '\u{0628}' => (Join::Dual, f('\u{FE8F}', '\u{FE90}', '\u{FE91}', '\u{FE92}')),
        '\u{062A}' => (Join::Dual, f('\u{FE95}', '\u{FE96}', '\u{FE97}', '\u{FE98}')),
        '\u{062B}' => (Join::Dual, f('\u{FE99}', '\u{FE9A}', '\u{FE9B}', '\u{FE9C}')),
        '\u{062C}' => (Join::Dual, f('\u{FE9D}', '\u{FE9E}', '\u{FE9F}', '\u{FEA0}')),
        '\u{062D}' => (Join::Dual, f('\u{FEA1}', '\u{FEA2}', '\u{FEA3}', '\u{FEA4}')),
        '\u{062E}' => (Join::Dual, f('\u{FEA5}', '\u{FEA6}', '\u{FEA7}', '\u{FEA8}')),
        '\u{0633}' => (Join::Dual, f('\u{FEB1}', '\u{FEB2}', '\u{FEB3}', '\u{FEB4}')),
        '\u{0634}' => (Join::Dual, f('\u{FEB5}', '\u{FEB6}', '\u{FEB7}', '\u{FEB8}')),
        '\u{0635}' => (Join::Dual, f('\u{FEB9}', '\u{FEBA}', '\u{FEBB}', '\u{FEBC}')),
        '\u{0636}' => (Join::Dual, f('\u{FEBD}', '\u{FEBE}', '\u{FEBF}', '\u{FEC0}')),
        '\u{0637}' => (Join::Dual, f('\u{FEC1}', '\u{FEC2}', '\u{FEC3}', '\u{FEC4}')),
        '\u{0638}' => (Join::Dual, f('\u{FEC5}', '\u{FEC6}', '\u{FEC7}', '\u{FEC8}')),
        '\u{0639}' => (Join::Dual, f('\u{FEC9}', '\u{FECA}', '\u{FECB}', '\u{FECC}')),
        '\u{063A}' => (Join::Dual, f('\u{FECD}', '\u{FECE}', '\u{FECF}', '\u{FED0}')),
        '\u{0641}' => (Join::Dual, f('\u{FED1}', '\u{FED2}', '\u{FED3}', '\u{FED4}')),
        '\u{0642}' => (Join::Dual, f('\u{FED5}', '\u{FED6}', '\u{FED7}', '\u{FED8}')),
        '\u{0643}' => (Join::Dual, f('\u{FED9}', '\u{FEDA}', '\u{FEDB}', '\u{FEDC}')),
        '\u{0644}' => (Join::Dual, f('\u{FEDD}', '\u{FEDE}', '\u{FEDF}', '\u{FEE0}')),
        '\u{0645}' => (Join::Dual, f('\u{FEE1}', '\u{FEE2}', '\u{FEE3}', '\u{FEE4}')),
        '\u{0646}' => (Join::Dual, f('\u{FEE5}', '\u{FEE6}', '\u{FEE7}', '\u{FEE8}')),
        '\u{0647}' => (Join::Dual, f('\u{FEE9}', '\u{FEEA}', '\u{FEEB}', '\u{FEEC}')),
        '\u{064A}' => (Join::Dual, f('\u{FEF1}', '\u{FEF2}', '\u{FEF3}', '\u{FEF4}')),
        '\u{067E}' => (Join::Dual, f('\u{FB56}', '\u{FB57}', '\u{FB58}', '\u{FB59}')),
        '\u{0686}' => (Join::Dual, f('\u{FB7A}', '\u{FB7B}', '\u{FB7C}', '\u{FB7D}')),
        '\u{06A9}' => (Join::Dual, f('\u{FB8E}', '\u{FB8F}', '\u{FB90}', '\u{FB91}')),
        '\u{06AF}' => (Join::Dual, f('\u{FB92}', '\u{FB93}', '\u{FB94}', '\u{FB95}')),
        '\u{06CC}' => (Join::Dual, f('\u{FBFC}', '\u{FBFD}', '\u{FBFE}', '\u{FBFF}')),
        _ => return None,
    })
}

fn is_transparent(c: char) -> bool {
    // Tatweel, ZWJ, combining marks (diacritics).
    c == '\u{0640}'
        || c == '\u{200D}'
        || ('\u{064B}'..='\u{0652}').contains(&c)
        || ('\u{0657}'..='\u{065F}').contains(&c)
        || ('\u{0670}'..='\u{0670}').contains(&c)
}

/// Lam–alef ligature (isolated, final) for ل + alef, or `None`.
fn lam_alef(alef: char) -> Option<(char, char)> {
    Some(match alef {
        '\u{0627}' => ('\u{FEFB}', '\u{FEFC}'),
        '\u{0622}' => ('\u{FEF5}', '\u{FEF6}'),
        '\u{0623}' => ('\u{FEF7}', '\u{FEF8}'),
        '\u{0625}' => ('\u{FEF9}', '\u{FEFA}'),
        _ => return None,
    })
}

#[derive(Clone, Copy, PartialEq)]
enum Dir {
    R,
    L,
    En,
    N,
}

fn dir_of(c: char) -> Dir {
    // NOTE: the digit ranges must come first — U+06F0–U+06F9 lies inside
    // U+0600–U+06FF, and match arms are tried in order.
    match c {
        '0'..='9' | '\u{0660}'..='\u{0669}' | '\u{06F0}'..='\u{06F9}' => Dir::En,
        '\u{0600}'..='\u{06FF}' | '\u{FB50}'..='\u{FDFF}' | '\u{FE70}'..='\u{FEFF}' => Dir::R,
        c if c.is_ascii_alphabetic() => Dir::L,
        _ => Dir::N,
    }
}

/// Convert a logical Persian/Arabic string to its visual (shaped + RTL)
/// form for display in egui. Idempotent for already-shaped text.
/// Pure Latin/number strings come back unchanged.
pub fn shape_persian(input: &str) -> String {
    if !input.chars().any(|c| {
        matches!(c, '\u{0600}'..='\u{06FF}' | '\u{FB50}'..='\u{FDFF}' | '\u{FE70}'..='\u{FEFF}')
    }) {
        return input.to_string();
    }
    let chars: Vec<char> = input.chars().collect();
    // Join type of each character, for the joining pass. Letters not in
    // the table are Non (unless transparent).
    let join_of = |c: char| -> Join {
        if is_transparent(c) {
            Join::Transparent
        } else {
            letter(c).map(|(j, _)| j).unwrap_or(Join::Non)
        }
    };
    // For each position, the nearest non-transparent neighbour's join type.
    let mut shaped: Vec<char> = Vec::with_capacity(chars.len());
    let mut i = 0;
    while i < chars.len() {
        let c = chars[i];
        if c == '\u{200C}' {
            // ZWNJ: break joining, render as a thin space.
            shaped.push('\u{2009}');
            i += 1;
            continue;
        }
        if is_transparent(c) {
            shaped.push(c);
            i += 1;
            continue;
        }
        if let Some((join, forms)) = letter(c) {
            // Neighbour join types (skipping transparent chars).
            let mut prev = Join::Non;
            let mut j = i;
            while j > 0 {
                j -= 1;
                let pj = join_of(chars[j]);
                if pj != Join::Transparent {
                    prev = pj;
                    break;
                }
            }
            let mut next = Join::Non;
            let mut next_idx = None;
            let mut j = i + 1;
            while j < chars.len() {
                let nj = join_of(chars[j]);
                if nj != Join::Transparent {
                    next = nj;
                    next_idx = Some(j);
                    break;
                }
                j += 1;
            }
            // Lam–alef ligature: ل followed by an alef it joins to.
            if c == '\u{0644}' {
                if let Some(ni) = next_idx {
                    if let Some((iso, fin)) = lam_alef(chars[ni]) {
                        let joins_prev = prev == Join::Dual;
                        shaped.push(if joins_prev { fin } else { iso });
                        i = ni + 1;
                        continue;
                    }
                }
            }
            let joins_prev = prev == Join::Dual;
            let joins_next = next == Join::Dual || next == Join::Right;
            let picked = match (joins_prev, joins_next, join) {
                (false, false, _) => forms.isolated,
                (true, false, _) => forms.final_form,
                (false, true, Join::Dual) => forms.initial,
                (true, true, Join::Dual) => forms.medial,
                // Right-joining letters never take initial/medial.
                (false, true, _) => forms.isolated,
                (true, true, _) => forms.final_form,
            };
            shaped.push(picked);
        } else {
            shaped.push(c);
        }
        i += 1;
    }

    // Bidi-lite: split into directional runs, reverse run order, reverse
    // chars inside RTL runs only. Neutrals attach to the preceding run.
    let mut runs: Vec<(Dir, Vec<char>)> = Vec::new();
    for c in shaped {
        let d = dir_of(c);
        let d = if d == Dir::N {
            runs.last().map(|(rd, _)| *rd).unwrap_or(Dir::R)
        } else {
            d
        };
        if let Some((rd, chars)) = runs.last_mut() {
            if *rd == d {
                chars.push(c);
                continue;
            }
        }
        runs.push((d, vec![c]));
    }
    let mut out = String::with_capacity(input.len());
    for (d, mut chars) in runs.into_iter().rev() {
        if d == Dir::R {
            chars.reverse();
        }
        for c in chars {
            out.push(c);
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    // Note: expected values use the presentation forms from
    // ArabicShaping.txt (see the table above).
    #[test]
    fn salam_shapes_with_lam_alef_ligature() {
        // سلام → س initial, ﻻ final (ligature), م isolated, then reversed.
        assert_eq!(
            shape_persian("سلام"),
            "\u{FEE1}\u{FEFC}\u{FEB3}".to_string()
        );
    }

    #[test]
    fn lyric_shapes() {
        // لیریک (with U+06CC Farsi Yeh) → ل initial, ی medial, ر final,
        // ی initial, ک final, reversed.
        assert_eq!(
            shape_persian("لیریک"),
            "\u{FB8F}\u{FBFE}\u{FEAE}\u{FBFF}\u{FEDF}".to_string()
        );
    }

    #[test]
    fn zwnj_breaks_and_thins() {
        // می‌شود: م initial, ی final (ZWNJ breaks the join), ZWNJ→thin
        // space, ش initial, و final, د isolated — then the whole RTL run
        // is reversed for display.
        assert_eq!(
            shape_persian("می\u{200C}شود"),
            "\u{FEA9}\u{FEEE}\u{FEB7}\u{2009}\u{FBFD}\u{FEE3}".to_string()
        );
    }

    #[test]
    fn digits_keep_order() {
        assert_eq!(shape_persian("۱۲۳"), "۱۲۳".to_string());
        assert_eq!(shape_persian("ABC"), "ABC".to_string());
        assert_eq!(shape_persian(""), "".to_string());
    }

    #[test]
    fn mixed_runs_keep_numbers_intact() {
        // «لیریک ۵» → runs [R][space][EN] reversed: [EN][space][R reversed].
        assert_eq!(
            shape_persian("لیریک ۵"),
            "۵ \u{FB8F}\u{FBFE}\u{FEAE}\u{FBFF}\u{FEDF}".to_string()
        );
    }

    #[test]
    fn lam_alef_alone() {
        assert_eq!(shape_persian("لا"), "\u{FEFB}".to_string());
    }
}
