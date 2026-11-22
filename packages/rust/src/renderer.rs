use crate::hue::HueDomain;
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

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum ForegroundPolicy {
    #[default]
    Best,
    FirstPassing,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum Preset {
    #[default]
    Labels,
    Controls,
    Chart,
    Subdued,
    Mono,
}

impl Preset {
    fn chroma_scale(self) -> (f64, f64) {
        match self {
            Self::Labels | Self::Controls => (0.6, 0.8),
            Self::Chart => (0.8, 1.0),
            Self::Subdued => (0.2, 0.4),
            Self::Mono => (0.0, 0.0),
        }
    }
}

pub struct Renderer {
    pub preset: Preset,
    pub foregrounds: Vec<[u8; 3]>,
    pub foreground_policy: ForegroundPolicy,
    pub hue_range: (f64, f64),
    pub exclude_hues: Vec<(f64, f64)>,
    pub light_profile: ThemeProfile,
    pub dark_profile: ThemeProfile,
    pub contrast_targets: BTreeMap<String, f64>,
    pub namespace: String,
    pub seed: u32,
    pub normalization: Normalization,
    pub light_background: [u8; 3],
    pub dark_background: [u8; 3],
    pub contrast_model: ContrastModel,
    pub contrast_target: Option<f64>,
}

impl Default for Renderer {
    fn default() -> Self {
        Self {
            preset: Preset::Labels,
            namespace: String::new(),
            foregrounds: vec![[0; 3], [255; 3]],
            foreground_policy: ForegroundPolicy::Best,
            hue_range: (0.0, 360.0),
            exclude_hues: Vec::new(),
            seed: 0,
            contrast_targets: Default::default(),
            light_profile: Default::default(),
            dark_profile: Default::default(),
            normalization: Normalization::default(),
            light_background: [255; 3],
            dark_background: [18; 3],
            contrast_model: ContrastModel::Wcag2,
            contrast_target: None,
        }
    }
}

impl Renderer {
    pub fn resolve(&self, text: &str) -> Result<RenderedPalette, &'static str> {
        let domain = self.validate()?;
        self.resolve_normalized(
            &self.normalization.apply(text),
            &self.normalization.apply(&self.namespace),
            &domain,
        )
    }

    /// Resolve in input order, sharing normalized duplicates only within this call.
    pub fn batch<S: AsRef<str>>(
        &self,
        labels: impl IntoIterator<Item = S>,
    ) -> Result<Vec<Arc<RenderedPalette>>, &'static str> {
        let domain = self.validate()?;
        let scope = self.normalization.apply(&self.namespace);
        let mut cache = HashMap::new();
        let mut result = Vec::new();
        for label in labels {
            let key = self.normalization.apply(label.as_ref());
            let palette = match cache.entry(key) {
                Entry::Occupied(entry) => Arc::clone(entry.get()),
                Entry::Vacant(entry) => {
                    let palette =
                        Arc::new(self.resolve_normalized(entry.key(), &scope, &domain)?);
                    entry.insert(Arc::clone(&palette));
                    palette
                }
            };
            result.push(palette);
        }
        Ok(result)
    }

    fn validate(&self) -> Result<HueDomain, &'static str> {
        if self.foregrounds.is_empty() {
            return Err("At least one foreground is required");
        }
        let range = match self.contrast_model {
            ContrastModel::Wcag2 => 1.0..=21.0,
            ContrastModel::Apca => 0.0..=106.0,
        };
        if self.contrast_target.is_some_and(|v| !range.contains(&v)) {
            return Err("Invalid contrast target");
        }
        for (role, value) in &self.contrast_targets {
            if !matches!(
                role.as_str(),
                "fill" | "fillHover" | "fillActive" | "border" | "text" | "textOnSubtle" | "strong"
            ) || !range.contains(value)
            {
                return Err("Invalid relationship target");
            }
        }
        for theme in [self.light_profile, self.dark_profile] {
            if !theme.fill.valid() || !theme.text.valid() {
                return Err("Invalid role profile");
            }
        }
        HueDomain::new(self.hue_range, &self.exclude_hues)
    }

    fn resolve_normalized(
        &self,
        text: &str,
        scope: &str,
        domain: &HueDomain,
    ) -> Result<RenderedPalette, &'static str> {
        let digest = identity_digest(text, scope, self.seed).map_err(|_| "Namespace too long")?;
        let [u_h, u_l, u_c] = identity_fractions(&digest);
        let position = u_h * 12.0;
        let i = position as usize;
        let hue = (ANCHORS[i] + (ANCHORS[i + 1] - ANCHORS[i]) * (position - i as f64)) % 360.0;
        let hue = domain.map(hue);
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
        let wcag = self.contrast_model == ContrastModel::Wcag2;
        let default_target =
            self.contrast_target
                .unwrap_or(match (self.contrast_model, self.preset) {
                    (ContrastModel::Apca, _) => 60.0,
                    (_, Preset::Controls) => 7.0,
                    _ => 4.5,
                });
        let unconstrained = if wcag { 1.0 } else { 0.0 };
        let required = |role: &str| {
            self.contrast_targets
                .get(role)
                .copied()
                .unwrap_or(if role == "border" && wcag {
                    default_target.min(3.0)
                } else {
                    default_target
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
        let score = |a, b| self.contrast_model.measure(a, b, Gamut::Srgb).abs();
        let foreground = |rgb, target| {
            let mut best = self.foregrounds[0];
            let mut best_score = -1.0;
            for &candidate in &self.foregrounds {
                let value = score(candidate, rgb);
                if self.foreground_policy == ForegroundPolicy::FirstPassing && value >= target {
                    return candidate;
                }
                if value > best_score {
                    best = candidate;
                    best_score = value;
                }
            }
            best
        };
        enum Against {
            Candidates,
            Text([u8; 3]),
            Background([u8; 3]),
        }
        use Against::*;
        let tone =
            |value: f64, fill: bool, target: f64, against: Against, second: Option<[u8; 3]>| {
                let l = value.clamp(0.0, 1.0);
                let role = profile(fill);
                let (low, high) = role.chroma_scale.unwrap_or(self.preset.chroma_scale());
                let c = Gamut::Srgb.cusp(l, hue) * (low + (high - low) * u_c);
                let secondary = if second.is_some() {
                    required("textOnSubtle")
                } else {
                    0.0
                };
                Gamut::Srgb
                    .repair(
                        l,
                        c.min(role.chroma_cap.unwrap_or(if fill { 0.16 } else { 0.19 })),
                        hue,
                        if target == 0.0 { secondary } else { target },
                        |rgb| {
                            let primary = match against {
                                Candidates => score(foreground(rgb, target), rgb),
                                Text(text) => score(text, rgb),
                                Background(bg) => score(rgb, bg),
                            };
                            second.filter(|_| secondary > 0.0).map_or(primary, |other| {
                                if target == 0.0 {
                                    return score(rgb, other);
                                }
                                primary.min(score(rgb, other) * (target / secondary))
                            })
                        },
                    )
                    .color
                    .bytes
            };
        let lf = sample(true);
        let lt = sample(false);
        let subtle = tone(lb + direction * 0.04, true, unconstrained, Candidates, None);
        let fill = tone(lf, true, required("fill"), Candidates, None);
        let on_fill = foreground(fill, required("fill"));
        [
            ("background", bg),
            ("subtle", subtle),
            (
                "muted",
                tone(lb + direction * 0.10, true, unconstrained, Candidates, None),
            ),
            ("fill", fill),
            ("onFill", on_fill),
            (
                "fillHover",
                tone(
                    lf + direction * 0.025,
                    true,
                    required("fillHover"),
                    Text(on_fill),
                    None,
                ),
            ),
            (
                "fillActive",
                tone(
                    lf + direction * 0.05,
                    true,
                    required("fillActive"),
                    Text(on_fill),
                    None,
                ),
            ),
            (
                "border",
                tone(
                    lb + direction * 0.39,
                    true,
                    required("border"),
                    Background(bg),
                    None,
                ),
            ),
            (
                "text",
                tone(lt, false, required("text"), Background(bg), Some(subtle)),
            ),
            (
                "strong",
                tone(
                    lt + direction * 0.10,
                    false,
                    required("strong"),
                    Background(bg),
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
    fn shared_presets() {
        let rows: Vec<Value> =
            serde_json::from_str(include_str!("../testdata/presets-v1.json")).unwrap();
        assert_eq!(rows.len(), 20);
        for row in rows {
            let options = &row["options"];
            let renderer = Renderer {
                preset: match options["preset"].as_str().unwrap() {
                    "labels" => Preset::Labels,
                    "controls" => Preset::Controls,
                    "chart" => Preset::Chart,
                    "subdued" => Preset::Subdued,
                    "mono" => Preset::Mono,
                    name => panic!("unknown preset {name}"),
                },
                contrast_model: match options["contrastModel"].as_str().unwrap() {
                    "wcag2" => ContrastModel::Wcag2,
                    "apca" => ContrastModel::Apca,
                    name => panic!("unknown contrast model {name}"),
                },
                contrast_target: options["contrastTarget"].as_f64(),
                ..Default::default()
            };
            let result = renderer.resolve(row["text"].as_str().unwrap()).unwrap();
            for (name, colors) in [("light", result.light), ("dark", result.dark)] {
                let expected = row[name].as_object().unwrap();
                assert_eq!(colors.len(), expected.len());
                for (role, hex) in expected {
                    assert_eq!(colors[role.as_str()].hex, *hex, "{options} {name} {role}");
                }
            }
        }
    }

    #[test]
    fn apca_text_relationships() {
        for (primary, secondary, light, dark) in [
            (0.0, 90.0, "#003b44", "#a8f2ff"),
            (90.0, 0.0, "#0b515c", "#a1f1ff"),
            (0.0, 0.0, "#286771", "#53c4d7"),
        ] {
            let renderer = Renderer {
                contrast_model: ContrastModel::Apca,
                contrast_targets: [("text".into(), primary), ("textOnSubtle".into(), secondary)]
                    .into(),
                ..Renderer::default()
            };
            let palette = renderer.resolve("repair").unwrap();
            assert_eq!(palette.light["text"].hex, light);
            assert_eq!(palette.dark["text"].hex, dark);
        }
        let renderer = Renderer {
            contrast_model: ContrastModel::Apca,
            contrast_target: Some(106.0),
            ..Renderer::default()
        };
        let palette = renderer.resolve("foreground").unwrap();
        assert_eq!(palette.dark["fill"].hex, "#002206");
        assert_eq!(palette.dark["fillHover"].hex, "#002206");
        assert_eq!(palette.dark["onFill"].hex, "#ffffff");
    }

    #[test]
    fn ordered_foregrounds() {
        for policy in [ForegroundPolicy::FirstPassing, ForegroundPolicy::Best] {
            for target in [1.0, 21.0] {
                let renderer = Renderer {
                    foregrounds: vec![[0x55, 0x66, 0x77], [0; 3], [255; 3]],
                    foreground_policy: policy,
                    contrast_target: Some(target),
                    ..Renderer::default()
                };
                let p = renderer.resolve("foreground").unwrap();
                let actual = [&p.light, &p.dark]
                    .into_iter()
                    .flat_map(|t| ["fill", "onFill", "fillHover"].map(|role| t[role].hex.as_str()))
                    .collect::<Vec<_>>();
                let expected = if target == 21.0 {
                    [
                        "#ffffff", "#000000", "#ffffff", "#000000", "#ffffff", "#000000",
                    ]
                } else {
                    let first = policy == ForegroundPolicy::FirstPassing;
                    [
                        "#72da7e",
                        if first { "#556677" } else { "#000000" },
                        "#6ad277",
                        "#2e7137",
                        if first { "#556677" } else { "#ffffff" },
                        "#32793c",
                    ]
                };
                assert_eq!(actual, expected);
            }
        }
        let empty = Renderer {
            foregrounds: vec![],
            ..Renderer::default()
        };
        assert!(empty.batch(std::iter::empty::<&str>()).is_err());
    }

    #[test]
    fn restricted_hues() {
        for (allowed, excluded, hue, fill) in [
            (
                (300.0, 60.0),
                vec![(350.0, 10.0)],
                341.06283164159765,
                "#e496c8",
            ),
            (
                (10.0, 220.0),
                vec![(30.0, 80.0), (70.0, 120.0), (190.0, 240.0)],
                181.9565484774379,
                "#6dbbae",
            ),
            (
                (0.0, 360.0),
                vec![(120.0, 110.0)],
                119.10628316415976,
                "#a4b566",
            ),
            ((35.125, 35.25), vec![], 35.238828539551996, "#e39d8b"),
        ] {
            let renderer = Renderer {
                hue_range: allowed,
                exclude_hues: excluded,
                ..Renderer::default()
            };
            let result = renderer.resolve("a").unwrap();
            assert!((result.hue - hue).abs() < 1e-12);
            assert_eq!(result.light["fill"].hex, fill);
            assert_eq!(renderer.batch(["a"]).unwrap()[0].as_ref(), &result);
        }
        for excluded in [
            vec![(0.0, 360.0)],
            vec![(f64::NAN, 2.0)],
            vec![(0.0, 1.0); 17],
        ] {
            let renderer = Renderer {
                exclude_hues: excluded,
                ..Renderer::default()
            };
            assert!(renderer.batch(std::iter::empty::<&str>()).is_err());
        }
    }

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
        renderer.contrast_target = Some(f64::NAN);
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
                contrast_target: opts["contrastTarget"].as_f64(),
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
