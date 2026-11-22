use crate::tables::{ANCHORS, BIASES};
use crate::{identity_digest, identity_fractions, Color, ContrastModel, Gamut, Normalization};
use std::collections::{hash_map::Entry, BTreeMap, HashMap};
use std::sync::Arc;

pub type Theme = BTreeMap<&'static str, Color>;

#[derive(Debug, PartialEq)]
pub struct RenderedPalette {
    pub hue_fraction: f64,
    pub hue: f64,
    pub version: &'static str,
    pub source: &'static str,
    pub light: Theme,
    pub dark: Theme,
}

#[derive(Clone, Copy, Default)]
pub struct RoleProfile {
    pub lightness: Option<(f64, f64)>,
    pub chroma_scale: Option<(f64, f64)>,
    pub chroma_cap: Option<f64>,
}

impl RoleProfile {
    fn valid(self) -> bool {
        [self.lightness, self.chroma_scale]
            .into_iter()
            .flatten()
            .all(|(a, b)| a >= 0.0 && a <= b && b <= 1.0)
            && self.chroma_cap.is_none_or(|cap| (0.0..=0.4).contains(&cap))
    }
}

#[derive(Clone, Copy, Default)]
pub struct ThemeProfile {
    pub fill: RoleProfile,
    pub text: RoleProfile,
}

pub struct Renderer {
    pub light_profile: ThemeProfile,
    pub dark_profile: ThemeProfile,
    pub contrast_targets: BTreeMap<String, f64>,
    pub namespace: String,
    pub seed: u32,
    pub normalization: Normalization,
    pub light_background: [u8; 3],
    pub dark_background: [u8; 3],
    pub contrast_target: f64,
}

impl Default for Renderer {
    fn default() -> Self {
        Self {
            namespace: String::new(),
            seed: 0,
            contrast_targets: Default::default(),
            light_profile: Default::default(),
            dark_profile: Default::default(),
            normalization: Normalization::default(),
            light_background: [255; 3],
            dark_background: [18; 3],
            contrast_target: 4.5,
        }
    }
}

impl Renderer {
    pub fn resolve(&self, text: &str) -> Result<RenderedPalette, &'static str> {
        self.validate()?;
        self.resolve_normalized(
            &self.normalization.apply(text),
            &self.normalization.apply(&self.namespace),
        )
    }

    /// Resolve in input order, sharing normalized duplicates only within this call.
    pub fn batch<S: AsRef<str>>(
        &self,
        labels: impl IntoIterator<Item = S>,
    ) -> Result<Vec<Arc<RenderedPalette>>, &'static str> {
        self.validate()?;
        let scope = self.normalization.apply(&self.namespace);
        let mut cache = HashMap::new();
        let mut result = Vec::new();
        for label in labels {
            let key = self.normalization.apply(label.as_ref());
            let palette = match cache.entry(key) {
                Entry::Occupied(entry) => Arc::clone(entry.get()),
                Entry::Vacant(entry) => {
                    let palette = Arc::new(self.resolve_normalized(entry.key(), &scope)?);
                    entry.insert(Arc::clone(&palette));
                    palette
                }
            };
            result.push(palette);
        }
        Ok(result)
    }

    fn validate(&self) -> Result<(), &'static str> {
        if !(1.0..=21.0).contains(&self.contrast_target) {
            return Err("Invalid contrast target");
        }
        for (role, value) in &self.contrast_targets {
            if !matches!(
                role.as_str(),
                "fill" | "fillHover" | "fillActive" | "border" | "text" | "textOnSubtle" | "strong"
            ) || !(1.0..=21.0).contains(value)
            {
                return Err("Invalid relationship target");
            }
        }
        for theme in [self.light_profile, self.dark_profile] {
            if !theme.fill.valid() || !theme.text.valid() {
                return Err("Invalid role profile");
            }
        }
        Ok(())
    }

    fn resolve_normalized(&self, text: &str, scope: &str) -> Result<RenderedPalette, &'static str> {
        let digest = identity_digest(text, scope, self.seed).map_err(|_| "Namespace too long")?;
        let [u_h, u_l, u_c] = identity_fractions(&digest);
        let position = u_h * 12.0;
        let i = position as usize;
        let hue = (ANCHORS[i] + (ANCHORS[i + 1] - ANCHORS[i]) * (position - i as f64)) % 360.0;
        Ok(RenderedPalette {
            version: "text-to-color-v1",
            source: "hash",
            hue_fraction: u_h,
            hue,
            light: self.theme(false, hue, u_l, u_c),
            dark: self.theme(true, hue, u_l, u_c),
        })
    }

    fn theme(&self, dark: bool, hue: f64, u_l: f64, u_c: f64) -> Theme {
        let bg = if dark {
            self.dark_background
        } else {
            self.light_background
        };
        let lb = (Color::from(bg).oklch.l * 4096.0).round() / 4096.0;
        let direction = if dark { 1.0 } else { -1.0 };
        let theme = if dark {
            self.dark_profile
        } else {
            self.light_profile
        };
        let profile = |fill: bool| if fill { theme.fill } else { theme.text };
        let required = |role: &str| {
            self.contrast_targets
                .get(role)
                .copied()
                .unwrap_or(if role == "border" {
                    self.contrast_target.min(3.0)
                } else {
                    self.contrast_target
                })
        };
        let sample = |fill: bool| {
            let (low, high) = profile(fill).lightness.unwrap_or(match (dark, fill) {
                (true, true) => (0.4, 0.5),
                (false, false) => (0.43, 0.53),
                _ => (0.72, 0.82),
            });
            let bias = &BIASES[2 * usize::from(dark) + usize::from(!fill)];
            let sector = (hue / 30.0) as usize;
            let offset = bias[sector]
                + (bias[(sector + 1) % 12] - bias[sector]) * (hue / 30.0 - sector as f64);
            (low + (high - low) * u_l + offset).clamp(0.0, 1.0)
        };
        let score = |a, b| ContrastModel::Wcag2.measure(a, b, Gamut::Srgb);
        let foreground = |rgb| {
            if score([0; 3], rgb) >= score([255; 3], rgb) {
                [0; 3]
            } else {
                [255; 3]
            }
        };
        let tone = |value: f64,
                    fill: bool,
                    target: f64,
                    back: Option<[u8; 3]>,
                    second: Option<[u8; 3]>| {
            let l = value.clamp(0.0, 1.0);
            let role = profile(fill);
            let (low, high) = role.chroma_scale.unwrap_or((0.6, 0.8));
            let c = Gamut::Srgb.cusp(l, hue) * (low + (high - low) * u_c);
            Gamut::Srgb
                .repair(
                    l,
                    c.min(role.chroma_cap.unwrap_or(if fill { 0.16 } else { 0.19 })),
                    hue,
                    target,
                    |rgb| {
                        let primary = score(rgb, back.unwrap_or_else(|| foreground(rgb)));
                        second.map_or(primary, |other| {
                            primary.min(score(rgb, other) * (target / required("textOnSubtle")))
                        })
                    },
                )
                .color
                .bytes
        };
        let lf = sample(true);
        let lt = sample(false);
        let subtle = tone(lb + direction * 0.04, true, 1.0, None, None);
        let fill = tone(lf, true, required("fill"), None, None);
        let on_fill = foreground(fill);
        [
            ("background", bg),
            ("subtle", subtle),
            ("muted", tone(lb + direction * 0.10, true, 1.0, None, None)),
            ("fill", fill),
            ("onFill", on_fill),
            (
                "fillHover",
                tone(
                    lf + direction * 0.025,
                    true,
                    required("fillHover"),
                    Some(on_fill),
                    None,
                ),
            ),
            (
                "fillActive",
                tone(
                    lf + direction * 0.05,
                    true,
                    required("fillActive"),
                    Some(on_fill),
                    None,
                ),
            ),
            (
                "border",
                tone(
                    lb + direction * 0.39,
                    true,
                    required("border"),
                    Some(bg),
                    None,
                ),
            ),
            (
                "text",
                tone(lt, false, required("text"), Some(bg), Some(subtle)),
            ),
            (
                "strong",
                tone(
                    lt + direction * 0.10,
                    false,
                    required("strong"),
                    Some(bg),
                    None,
                ),
            ),
        ]
        .into_iter()
        .map(|(role, rgb)| (role, Color::from(rgb)))
        .collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde::Deserialize;
    use serde_json::Value;
    #[test]
    fn ordered_batch() {
        let mut renderer = Renderer::default();
        let labels = ["é", "", "e\u{301}", "é", "\0"];
        let palettes = renderer.batch(labels).unwrap();
        for (palette, label) in palettes.iter().zip(labels) {
            assert_eq!(palette.as_ref(), &renderer.resolve(label).unwrap());
        }
        assert_eq!(palettes.len(), labels.len());
        assert!(Arc::ptr_eq(&palettes[0], &palettes[3]));
        assert_ne!(palettes[0].hue, palettes[2].hue);
        renderer.normalization.unicode = crate::UnicodeForm::Nfc;
        let normalized = renderer.batch(labels).unwrap();
        assert!(Arc::ptr_eq(&normalized[0], &normalized[2]));
        assert!(renderer
            .batch(std::iter::empty::<&str>())
            .unwrap()
            .is_empty());
        renderer.contrast_target = f64::NAN;
        assert!(renderer.batch(labels).is_err());
    }

    #[test]
    fn shared_renderer() {
        #[derive(Deserialize)]
        struct Corpus {
            vectors: Vec<Value>,
        }
        let corpus: Corpus =
            serde_json::from_str(include_str!("../testdata/vectors.json")).unwrap();
        let mut count = 0;
        for row in corpus.vectors {
            let opts = &row["options"];
            let theme_profile = |theme: &str| {
                let role = |name: &str| {
                    let obj = &opts["profiles"][theme][name];
                    let range = |key: &str| {
                        obj[key]
                            .as_array()
                            .map(|pair| (pair[0].as_f64().unwrap(), pair[1].as_f64().unwrap()))
                    };
                    RoleProfile {
                        lightness: range("lightness"),
                        chroma_scale: range("chromaScale"),
                        chroma_cap: obj["chromaCap"].as_f64(),
                    }
                };
                ThemeProfile {
                    fill: role("fill"),
                    text: role("text"),
                }
            };
            let background = |theme: &str, default| {
                opts["backgrounds"][theme].as_str().map_or(default, |hex| {
                    std::array::from_fn(|i| {
                        u8::from_str_radix(&hex[1 + i * 2..3 + i * 2], 16).unwrap()
                    })
                })
            };
            let renderer = Renderer {
                namespace: opts["namespace"].as_str().unwrap_or("").into(),
                seed: opts["seed"].as_u64().unwrap_or(0).try_into().unwrap(),
                contrast_target: opts["contrastTarget"].as_f64().unwrap_or(4.5),
                light_profile: theme_profile("light"),
                dark_profile: theme_profile("dark"),
                contrast_targets: opts["contrastTargets"]
                    .as_object()
                    .into_iter()
                    .flatten()
                    .map(|(k, v)| (k.clone(), v.as_f64().unwrap()))
                    .collect(),
                light_background: background("light", [255; 3]),
                dark_background: background("dark", [18; 3]),
                ..Default::default()
            };
            let p = renderer.resolve(row["text"].as_str().unwrap()).unwrap();
            let e = &row["expected"];
            assert_eq!(p.hue, e["hue"].as_f64().unwrap());
            assert_eq!(p.hue_fraction, e["hueFraction"].as_f64().unwrap());
            assert_eq!(p.version, e["version"]);
            assert_eq!(p.source, e["source"]);
            for (theme, roles) in [("light", p.light), ("dark", p.dark)] {
                assert_eq!(roles.len(), 10);
                for (role, color) in roles {
                    assert_eq!(
                        color.hex, e[theme][role]["hex"],
                        "{} {theme} {role}",
                        row["id"]
                    );
                }
            }
            count += 1;
        }
        assert_eq!(count, 32);
    }
}
