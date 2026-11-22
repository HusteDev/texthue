mod assignment;
use crate::hue::HueDomain;
use crate::tables::{ANCHORS, BIASES};
use crate::{identity_digest, identity_fractions, Color, ContrastModel, Gamut, Normalization};
pub use assignment::{Assignment, AssignmentReport, Placement};
use std::collections::{hash_map::Entry, BTreeMap, HashMap};
use std::sync::Arc;

pub type Theme = BTreeMap<&'static str, Color>;

#[derive(Debug, PartialEq)]
pub struct ContrastRelationship {
    pub ratio: f64,
    pub apca_value: Option<f64>,
    pub meets_target: bool,
    pub lightness_adjusted: bool,
    pub chroma_capped: bool,
    pub chroma_reduced: bool,
    pub fallback: Option<&'static str>,
}

#[derive(Debug, PartialEq)]
pub struct ContrastReport {
    pub target: f64,
    pub relationships: BTreeMap<&'static str, ContrastRelationship>,
}

#[derive(Debug, PartialEq)]
pub struct RenderedPalette {
    pub hue_fraction: f64,
    pub hue: f64,
    pub version: &'static str,
    pub source: &'static str,
    pub light: Theme,
    pub dark: Theme,
    pub light_contrast: ContrastReport,
    pub dark_contrast: ContrastReport,
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

#[derive(Clone, Copy, Debug)]
pub struct BrandColors {
    pub light: [u8; 3],
    pub dark: [u8; 3],
}

#[derive(Clone, Copy)]
struct FixedTone {
    rgb: [u8; 3],
    lightness: f64,
    hue: f64,
    neutral: bool,
}

const ROLES: [&str; 10] = [
    "background",
    "subtle",
    "muted",
    "fill",
    "onFill",
    "fillHover",
    "fillActive",
    "border",
    "text",
    "strong",
];
struct RawTheme {
    roles: BTreeMap<&'static str, [u8; 3]>,
    flags: BTreeMap<&'static str, (bool, bool, bool, Option<&'static str>)>,
}

#[derive(Clone, Copy)]
struct Mapping {
    ring: usize,
    source: &'static str,
    fraction: f64,
    hue: f64,
    lightness: f64,
    chroma: f64,
    fixed: Option<(FixedTone, FixedTone)>,
}

impl From<[u8; 3]> for FixedTone {
    fn from(rgb: [u8; 3]) -> Self {
        let coordinates = Color::from(rgb).oklch;
        Self {
            rgb,
            lightness: (coordinates.l * 4096.0).round() / 4096.0,
            hue: ((coordinates.h * 1024.0).round() / 1024.0) % 360.0,
            neutral: coordinates.c == 0.0,
        }
    }
}

/// Validated options and normalized namespace shared across repeated calls.
pub struct CompiledRenderer<'a> {
    renderer: &'a Renderer,
    scope: String,
    palette: Vec<(&'a str, BrandColors)>,
    domain: HueDomain,
    overrides: HashMap<String, BrandColors>,
}

pub struct Renderer {
    pub preset: Preset,
    /// Stable entry IDs mapped to their approved light and dark fills.
    pub palette: Option<BTreeMap<String, BrandColors>>,
    pub overrides: BTreeMap<String, BrandColors>,
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
            palette: None,
            overrides: Default::default(),
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

impl CompiledRenderer<'_> {
    fn mapped_hue(&self, u_h: f64) -> f64 {
        let position = u_h * 12.0;
        let i = position as usize;
        let hue = (ANCHORS[i] + (ANCHORS[i + 1] - ANCHORS[i]) * (position - i as f64)) % 360.0;
        self.domain.map(hue)
    }

    pub fn resolve(&self, text: &str) -> Result<RenderedPalette, &'static str> {
        let normalized = self.renderer.normalization.apply(text);
        self.renderer.resolve_normalized(&normalized, self)
    }

    fn selected(&self, text: &str, dark: bool, role: &str) -> Result<[u8; 3], &'static str> {
        if !ROLES.contains(&role) {
            return Err("Unknown role");
        }
        let mapped = self
            .renderer
            .mapping(&self.renderer.normalization.apply(text), self)?;
        Ok(self.renderer.role_bytes(dark, &mapped, Some(role)).roles[role])
    }

    pub fn color(&self, text: &str, dark: bool, role: &str) -> Result<Color, &'static str> {
        self.selected(text, dark, role).map(Color::from)
    }

    pub fn hex(&self, text: &str, dark: bool, role: &str) -> Result<String, &'static str> {
        let [r, g, b] = self.selected(text, dark, role)?;
        Ok(format!("#{r:02x}{g:02x}{b:02x}"))
    }

    /// Return the selected hex only when its required contrast relationships pass.
    pub fn hex_strict(&self, text: &str, dark: bool, role: &str) -> Result<String, &'static str> {
        if !ROLES.contains(&role) {
            return Err("Unknown role");
        }
        let renderer = self.renderer;
        let mapped = renderer.mapping(&renderer.normalization.apply(text), self)?;
        // Requesting onFill also computes fill, including its approved foreground.
        let selected = if role == "fill" { "onFill" } else { role };
        let roles = renderer.role_bytes(dark, &mapped, Some(selected)).roles;
        let rgb = roles[role];
        let bg = if dark {
            renderer.dark_background
        } else {
            renderer.light_background
        };
        let require = |pair, front, back| {
            let target = renderer.required_target(pair, renderer.default_target());
            if renderer
                .contrast_model
                .measure(front, back, Gamut::Srgb)
                .abs()
                < target
            {
                Err("Unmet contrast target")
            } else {
                Ok(())
            }
        };
        match role {
            "fill" | "onFill" => require("fill", roles["onFill"], roles["fill"])?,
            "fillHover" | "fillActive" => require(role, roles["onFill"], rgb)?,
            "text" => {
                require(role, rgb, bg)?;
                require("textOnSubtle", rgb, roles["subtle"])?;
            }
            "strong" | "border" => require(role, rgb, bg)?,
            _ => {}
        }
        let [r, g, b] = rgb;
        Ok(format!("#{r:02x}{g:02x}{b:02x}"))
    }

    /// Resolve in input order, sharing normalized duplicates only within this call.
    pub fn batch<S: AsRef<str>>(
        &self,
        labels: impl IntoIterator<Item = S>,
    ) -> Result<Vec<Arc<RenderedPalette>>, &'static str> {
        let mut cache = HashMap::new();
        let mut result = Vec::new();
        for label in labels {
            let key = self.renderer.normalization.apply(label.as_ref());
            let palette = match cache.entry(key) {
                Entry::Occupied(entry) => Arc::clone(entry.get()),
                Entry::Vacant(entry) => {
                    let palette = Arc::new(self.renderer.resolve_normalized(entry.key(), self)?);
                    entry.insert(Arc::clone(&palette));
                    palette
                }
            };
            result.push(palette);
        }
        Ok(result)
    }
}

impl Renderer {
    pub fn resolve(&self, text: &str) -> Result<RenderedPalette, &'static str> {
        self.compile()?.resolve(text)
    }

    pub fn batch<S: AsRef<str>>(
        &self,
        labels: impl IntoIterator<Item = S>,
    ) -> Result<Vec<Arc<RenderedPalette>>, &'static str> {
        self.compile()?.batch(labels)
    }

    fn default_target(&self) -> f64 {
        self.contrast_target
            .unwrap_or(match (self.contrast_model, self.preset) {
                (ContrastModel::Apca, _) => 60.0,
                (_, Preset::Controls) => 7.0,
                _ => 4.5,
            })
    }

    /// Validate once and reuse the hue domain, palette filter and normalized overrides.
    pub fn compile(&self) -> Result<CompiledRenderer<'_>, &'static str> {
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
        let domain = HueDomain::new(self.hue_range, &self.exclude_hues)?;
        let mut overrides = HashMap::with_capacity(self.overrides.len());
        for (key, colors) in &self.overrides {
            if overrides
                .insert(self.normalization.apply(key), *colors)
                .is_some()
            {
                return Err("Duplicate normalized override");
            }
        }
        let mut palette = Vec::new();
        if let Some(entries) = &self.palette {
            if entries.is_empty() {
                return Err("Empty approved palette");
            }
            let target = self
                .contrast_targets
                .get("fill")
                .copied()
                .unwrap_or_else(|| self.default_target());
            let passes = |rgb| {
                self.foregrounds
                    .iter()
                    .any(|fg| self.contrast_model.measure(*fg, rgb, Gamut::Srgb).abs() >= target)
            };
            palette.extend(
                entries
                    .iter()
                    .filter(|(_, c)| passes(c.light) && passes(c.dark))
                    .map(|(id, c)| (id.as_str(), *c)),
            );
            if palette.is_empty() {
                palette.extend(entries.iter().map(|(id, c)| (id.as_str(), *c)));
            }
        }
        Ok(CompiledRenderer {
            renderer: self,
            scope: self.normalization.apply(&self.namespace),
            domain,
            overrides,
            palette,
        })
    }

    fn resolve_normalized(
        &self,
        text: &str,
        prepared: &CompiledRenderer<'_>,
    ) -> Result<RenderedPalette, &'static str> {
        Ok(self.render_mapping(self.mapping(text, prepared)?))
    }

    fn render_mapping(&self, m: Mapping) -> RenderedPalette {
        let (light, light_contrast) = self.theme(false, &m);
        let (dark, dark_contrast) = self.theme(true, &m);
        RenderedPalette {
            version: "text-to-color-v1",
            source: m.source,
            hue_fraction: m.fraction,
            hue: m.hue,
            light,
            light_contrast,
            dark,
            dark_contrast,
        }
    }

    fn mapping(
        &self,
        text: &str,
        prepared: &CompiledRenderer<'_>,
    ) -> Result<Mapping, &'static str> {
        let fixed = |colors: BrandColors, source| {
            let light = FixedTone::from(colors.light);
            let dark = FixedTone::from(colors.dark);
            let angle = if light.hue < ANCHORS[0] {
                light.hue + 360.0
            } else {
                light.hue
            };
            let i = ANCHORS.partition_point(|&a| a <= angle) - 1;
            let fraction = (i as f64 + (angle - ANCHORS[i]) / (ANCHORS[i + 1] - ANCHORS[i])) / 12.0;
            Mapping {
                ring: 0,
                source,
                fraction,
                hue: light.hue,
                lightness: 0.5,
                chroma: 0.5,
                fixed: Some((light, dark)),
            }
        };
        if let Some(colors) = prepared.overrides.get(text) {
            return Ok(fixed(*colors, "override"));
        }
        let digest =
            identity_digest(text, &prepared.scope, self.seed).map_err(|_| "Namespace too long")?;
        let mut winner = None;
        for &(id, colors) in &prepared.palette {
            use sha2::{Digest, Sha256};
            let rank: [u8; 32] = Sha256::new()
                .chain_update(digest)
                .chain_update(id.as_bytes())
                .finalize()
                .into();
            if winner.as_ref().is_none_or(|(best, _)| rank > *best) {
                winner = Some((rank, colors));
            }
        }
        if let Some((_, colors)) = winner {
            return Ok(fixed(colors, "palette"));
        }
        let [u_h, u_l, u_c] = identity_fractions(&digest);
        let hue = prepared.mapped_hue(u_h);
        Ok(Mapping {
            ring: 0,
            source: "hash",
            fraction: u_h,
            hue,
            lightness: u_l,
            chroma: u_c,
            fixed: None,
        })
    }

    fn required_target(&self, role: &str, default: f64) -> f64 {
        self.contrast_targets.get(role).copied().unwrap_or(
            if role == "border" && self.contrast_model == ContrastModel::Wcag2 {
                default.min(3.0)
            } else {
                default
            },
        )
    }

    fn role_bytes(&self, dark: bool, mapped: &Mapping, selected: Option<&str>) -> RawTheme {
        let fixed = mapped
            .fixed
            .map(|(light, night)| if dark { night } else { light });
        let hue = fixed.map_or(mapped.hue, |tone| tone.hue);
        let (u_l, u_c) = (mapped.lightness, mapped.chroma);
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
        let default_target = self.default_target();
        let unconstrained = if wcag { 1.0 } else { 0.0 };
        let required = |role: &str| self.required_target(role, default_target);
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
            (low + (high - low) * u_l + offset + [0.0, 0.08, -0.08, 0.16, -0.16][mapped.ring % 5])
                .clamp(0.0, 1.0)
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
        let mut flags = BTreeMap::new();
        let mut tone = |name: &'static str,
                        value: f64,
                        fill: bool,
                        target: f64,
                        against: Against,
                        second: Option<[u8; 3]>| {
            let l = value.clamp(0.0, 1.0);
            let role = profile(fill);
            let (low, high) = role.chroma_scale.unwrap_or(self.preset.chroma_scale());
            let c = Gamut::Srgb.cusp(l, hue)
                * ((low + (high - low) * u_c) * if mapped.ring % 5 < 3 { 1.0 } else { 0.6 });
            let secondary = if second.is_some() {
                required("textOnSubtle")
            } else {
                0.0
            };
            let capped = if fixed.is_some_and(|tone| tone.neutral) {
                0.0
            } else {
                c.min(role.chroma_cap.unwrap_or(if fill { 0.16 } else { 0.19 }))
            };
            let repair = Gamut::Srgb.repair(
                l,
                capped,
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
            );
            flags.insert(
                name,
                (
                    repair.color.lightness != l,
                    c > capped,
                    repair.color.chroma < capped,
                    repair.fallback,
                ),
            );
            repair.color.bytes
        };
        let lf = fixed.map_or_else(|| sample(true), |tone| tone.lightness);
        let lt = sample(false);
        let mut roles = BTreeMap::new();
        for role in ROLES {
            let needed = selected.is_none_or(|want| {
                want == role
                    || matches!(
                        (role, want),
                        ("subtle", "text")
                            | ("fill", "onFill" | "fillHover" | "fillActive")
                            | ("onFill", "fillHover" | "fillActive")
                    )
            });
            if !needed {
                continue;
            }
            let rgb = match role {
                "background" => bg,
                "subtle" => tone(
                    role,
                    lb + direction * 0.04,
                    true,
                    unconstrained,
                    Candidates,
                    None,
                ),
                "muted" => tone(
                    role,
                    lb + direction * 0.10,
                    true,
                    unconstrained,
                    Candidates,
                    None,
                ),
                "fill" => fixed.map_or_else(
                    || tone(role, lf, true, required(role), Candidates, None),
                    |f| f.rgb,
                ),
                "onFill" => foreground(roles["fill"], required("fill")),
                "fillHover" | "fillActive" => {
                    let offset = if role == "fillHover" { 0.025 } else { 0.05 };
                    tone(
                        role,
                        lf + direction * offset,
                        true,
                        required(role),
                        Text(roles["onFill"]),
                        None,
                    )
                }
                "border" => tone(
                    role,
                    lb + direction * 0.39,
                    true,
                    required(role),
                    Background(bg),
                    None,
                ),
                "text" => tone(
                    role,
                    lt,
                    false,
                    required(role),
                    Background(bg),
                    Some(roles["subtle"]),
                ),
                "strong" => tone(
                    role,
                    lt + direction * 0.10,
                    false,
                    required(role),
                    Background(bg),
                    None,
                ),
                _ => unreachable!(),
            };
            roles.insert(role, rgb);
        }
        RawTheme { roles, flags }
    }

    fn theme(&self, dark: bool, mapped: &Mapping) -> (Theme, ContrastReport) {
        let RawTheme { roles, flags } = self.role_bytes(dark, mapped, None);
        let (bg, on_fill, subtle) = (roles["background"], roles["onFill"], roles["subtle"]);
        let wcag = self.contrast_model == ContrastModel::Wcag2;
        let default_target = self.default_target();
        let required = |role: &str| self.required_target(role, default_target);
        let colors: Theme = roles
            .into_iter()
            .map(|(name, rgb)| (name, Color::from(rgb)))
            .collect();
        let mut relationships = BTreeMap::new();
        for (role, color, backdrop, surface) in [
            ("fill", "fill", on_fill, true),
            ("fillHover", "fillHover", on_fill, true),
            ("fillActive", "fillActive", on_fill, true),
            ("text", "text", bg, false),
            ("textOnSubtle", "text", subtle, false),
            ("border", "border", bg, false),
            ("strong", "strong", bg, false),
        ] {
            let rgb = colors[color].rgb;
            let (front, back) = if surface {
                (backdrop, rgb)
            } else {
                (rgb, backdrop)
            };
            let value = self.contrast_model.measure(front, back, Gamut::Srgb);
            let meets_target = value.abs() >= required(role);
            let (lightness_adjusted, chroma_capped, chroma_reduced, fallback) =
                flags.get(color).copied().unwrap_or_default();
            relationships.insert(
                role,
                ContrastRelationship {
                    ratio: if wcag {
                        value
                    } else {
                        ContrastModel::Wcag2.measure(front, back, Gamut::Srgb)
                    },
                    apca_value: (!wcag).then_some(value),
                    meets_target,
                    lightness_adjusted,
                    chroma_capped,
                    chroma_reduced,
                    fallback: if mapped.fixed.is_some() && role == "fill" && !meets_target {
                        Some("palette-constraint")
                    } else {
                        fallback
                    },
                },
            );
        }
        (
            colors,
            ContrastReport {
                target: default_target,
                relationships,
            },
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde::Deserialize;
    use serde_json::Value;
    #[test]
    fn approved_palette() {
        let red = BrandColors {
            light: [0xab, 0x12, 0x34],
            dark: [0xab, 0x12, 0x34],
        };
        let gray = BrandColors {
            light: [0x77; 3],
            dark: [0x77; 3],
        };
        let blue = BrandColors {
            light: [0x10, 0x20, 0xab],
            dark: [0x22, 0x33, 0xcd],
        };
        let mut renderer = Renderer {
            palette: Some(
                [
                    ("red".into(), red),
                    ("gray".into(), gray),
                    ("blue".into(), blue),
                ]
                .into(),
            ),
            ..Default::default()
        };
        let labels = ["apple", "pear", "a", "b", "x", "z"];
        for (p, expected) in renderer
            .batch(labels)
            .unwrap()
            .iter()
            .zip([blue, red, blue, blue, red, gray])
        {
            assert_eq!(p.source, "palette");
            assert_eq!(p.light["fill"].rgb, expected.light);
            assert_eq!(p.dark["fill"].rgb, expected.dark);
        }
        renderer.foregrounds = vec![[255; 3]];
        renderer.contrast_target = Some(21.0);
        assert_eq!(
            renderer.resolve("pear").unwrap().light["fill"].rgb,
            red.light
        );
        let black = BrandColors {
            light: [0; 3],
            dark: [0; 3],
        };
        renderer.palette = Some(
            [
                (
                    "red".into(),
                    BrandColors {
                        light: [0; 3],
                        dark: [255; 3],
                    },
                ),
                ("gray".into(), black),
            ]
            .into(),
        );
        assert_eq!(
            renderer.resolve("pear").unwrap().dark["fill"].rgb,
            black.dark
        );
        renderer.overrides.insert("pear".into(), blue);
        assert_eq!(renderer.resolve("pear").unwrap().source, "override");
        renderer.palette = Some(BTreeMap::new());
        assert!(renderer.resolve("pear").is_err());
    }

    #[test]
    fn normalized_overrides() {
        let colors = BrandColors {
            light: [0xab, 0x12, 0x34],
            dark: [0x77; 3],
        };
        let mut renderer = Renderer {
            normalization: Normalization {
                lowercase: true,
                ..Default::default()
            },
            overrides: [("TEAM".into(), colors)].into(),
            ..Default::default()
        };
        let batch = renderer.batch(["Team", "team", "other"]).unwrap();
        let p = &batch[0];
        assert!(Arc::ptr_eq(p, &batch[1]));
        assert_eq!(p.source, "override");
        assert_eq!(p.hue, 17.6767578125);
        assert_eq!(p.hue_fraction, 0.01669445425766595);
        assert_eq!(p.light["fill"].hex, "#ab1234");
        assert_eq!(p.light["fillHover"].hex, "#8e313b");
        assert_eq!(p.dark["fill"].hex, "#777777");
        assert_eq!(p.dark["fillActive"].hex, "#868686");
        assert_eq!(batch[2].source, "hash");
        renderer.contrast_model = ContrastModel::Apca;
        renderer.contrast_target = Some(106.0);
        renderer.foregrounds = vec![[0x77; 3]];
        assert_eq!(
            renderer.resolve("team").unwrap().dark["fill"].rgb,
            colors.dark
        );
        renderer.overrides.insert("team".into(), colors);
        assert!(renderer.batch(std::iter::empty::<&str>()).is_err());
    }

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
    fn strict_hex_checks_only_requested_contrast() {
        let gray = [119; 3];
        for contrast_model in [ContrastModel::Wcag2, ContrastModel::Apca] {
            let renderer = Renderer {
                contrast_model,
                foregrounds: vec![gray],
                overrides: [(
                    "gray".into(),
                    BrandColors {
                        light: gray,
                        dark: gray,
                    },
                )]
                .into(),
                ..Default::default()
            };
            let compiled = renderer.compile().unwrap();
            for role in ["fill", "onFill"] {
                assert_eq!(compiled.hex("gray", false, role).unwrap(), "#777777");
                assert_eq!(
                    compiled.hex_strict("gray", false, role),
                    Err("Unmet contrast target")
                );
            }
            assert_eq!(
                compiled.hex_strict("gray", false, "background").unwrap(),
                "#ffffff"
            );
            assert_eq!(
                compiled.hex_strict("gray", false, "missing"),
                Err("Unknown role")
            );
        }
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
            let label = row["text"].as_str().unwrap();
            let compiled = renderer.compile().unwrap();
            let p = compiled.resolve(label).unwrap();
            for (dark, theme) in [(false, &p.light), (true, &p.dark)] {
                for (role, color) in theme {
                    assert_eq!(compiled.hex(label, dark, role).unwrap(), color.hex);
                    assert_eq!(&compiled.color(label, dark, role).unwrap(), color);
                }
            }
            let e = &row["expected"];
            assert_eq!(p.hue, e["hue"].as_f64().unwrap());
            assert_eq!(p.hue_fraction, e["hueFraction"].as_f64().unwrap());
            assert_eq!(p.version, e["version"]);
            assert_eq!(p.source, e["source"]);
            for (theme, report) in [("light", p.light_contrast), ("dark", p.dark_contrast)] {
                let expected = &e[theme]["contrast"];
                assert_eq!(report.target, expected["target"].as_f64().unwrap());
                assert_eq!(report.relationships.len(), 7);
                for (role, pair) in report.relationships {
                    let reference = &expected[role];
                    assert!((pair.ratio - reference["ratio"].as_f64().unwrap()).abs() <= 1e-12);
                    assert_eq!(pair.meets_target, reference["meetsTarget"]);
                    assert_eq!(pair.lightness_adjusted, reference["lightnessAdjusted"]);
                    assert_eq!(pair.chroma_capped, reference["chromaCapped"]);
                    assert_eq!(pair.chroma_reduced, reference["chromaReduced"]);
                    assert_eq!(pair.fallback, reference["fallback"].as_str());
                }
            }
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
