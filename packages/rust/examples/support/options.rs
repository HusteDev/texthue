use serde::Deserialize;
use std::{collections::BTreeMap, error::Error};
use texthue::*;

type Result<T> = std::result::Result<T, Box<dyn Error>>;

#[derive(Default, Deserialize)]
#[serde(default, rename_all = "camelCase", deny_unknown_fields)]
struct Profile {
    lightness: Option<(f64, f64)>,
    chroma_scale: Option<(f64, f64)>,
    chroma_cap: Option<f64>,
}
impl From<Profile> for RoleProfile {
    fn from(p: Profile) -> Self {
        Self {
            lightness: p.lightness,
            chroma_scale: p.chroma_scale,
            chroma_cap: p.chroma_cap,
        }
    }
}
#[derive(Default, Deserialize)]
#[serde(default, deny_unknown_fields)]
struct Profiles {
    fill: Profile,
    text: Profile,
}
impl From<Profiles> for ThemeProfile {
    fn from(p: Profiles) -> Self {
        Self {
            fill: p.fill.into(),
            text: p.text.into(),
        }
    }
}
#[derive(Default, Deserialize)]
#[serde(default, deny_unknown_fields)]
struct Themes<T: Default> {
    light: T,
    dark: T,
}
#[derive(Default, Deserialize)]
#[serde(default, deny_unknown_fields)]
struct Normalize {
    unicode: Option<String>,
    case: Option<String>,
    whitespace: Option<String>,
}
#[derive(Default, Deserialize)]
#[serde(default, rename_all = "camelCase", deny_unknown_fields)]
pub struct Options {
    namespace: String,
    seed: u32,
    gamut: Option<String>,
    preset: Option<String>,
    contrast_model: Option<String>,
    contrast_target: Option<f64>,
    contrast_targets: BTreeMap<String, f64>,
    normalize: Normalize,
    hue_range: Option<(f64, f64)>,
    exclude_hues: Vec<(f64, f64)>,
    profiles: Themes<Profiles>,
    backgrounds: Themes<Option<String>>,
    foregrounds: Option<Vec<String>>,
    foreground_policy: Option<String>,
    palette: Option<Vec<Entry>>,
    overrides: BTreeMap<String, Brand>,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Entry {
    id: String,
    light: Option<String>,
    dark: Option<String>,
}
#[derive(Deserialize)]
#[serde(untagged)]
enum Brand {
    Both(String),
    Pair(Themes<Option<String>>),
}
fn rgb(hex: &str) -> Result<[u8; 3]> {
    let digits = hex.strip_prefix('#').ok_or("missing #")?;
    if digits.len() != 6 || !digits.bytes().all(|b| b.is_ascii_hexdigit()) {
        return Err("invalid hex".into());
    }
    Ok([
        u8::from_str_radix(&digits[..2], 16)?,
        u8::from_str_radix(&digits[2..4], 16)?,
        u8::from_str_radix(&digits[4..], 16)?,
    ])
}
fn brand(light: Option<&str>, dark: Option<&str>) -> Result<BrandColors> {
    Ok(BrandColors {
        light: rgb(light.or(dark).ok_or("missing fill")?)?,
        dark: rgb(dark.or(light).ok_or("missing fill")?)?,
    })
}
impl Options {
    pub fn renderer(self) -> Result<Renderer> {
        let mut renderer = Renderer {
            namespace: self.namespace,
            seed: self.seed,
            gamut: match self.gamut.as_deref().unwrap_or("srgb") {
                "srgb" => Gamut::Srgb,
                "display-p3" => Gamut::DisplayP3,
                _ => return Err("unknown gamut".into()),
            },
            light_profile: self.profiles.light.into(),
            dark_profile: self.profiles.dark.into(),
            contrast_target: self.contrast_target,
            contrast_targets: self.contrast_targets,
            exclude_hues: self.exclude_hues,
            preset: match self.preset.as_deref().unwrap_or("labels") {
                "labels" => Preset::Labels,
                "chart" => Preset::Chart,
                "controls" => Preset::Controls,
                "subdued" => Preset::Subdued,
                "mono" => Preset::Mono,
                _ => return Err("invalid preset".into()),
            },
            contrast_model: match self.contrast_model.as_deref().unwrap_or("wcag2") {
                "wcag2" => ContrastModel::Wcag2,
                "apca" => ContrastModel::Apca,
                _ => return Err("invalid model".into()),
            },
            foreground_policy: match self.foreground_policy.as_deref().unwrap_or("best") {
                "best" => ForegroundPolicy::Best,
                "first-passing" => ForegroundPolicy::FirstPassing,
                _ => return Err("invalid policy".into()),
            },
            normalization: Normalization {
                unicode: match self.normalize.unicode.as_deref().unwrap_or("none") {
                    "none" => UnicodeForm::Exact,
                    "NFC" => UnicodeForm::Nfc,
                    "NFKC" => UnicodeForm::Nfkc,
                    _ => return Err("invalid unicode".into()),
                },
                lowercase: match self.normalize.case.as_deref().unwrap_or("none") {
                    "none" => false,
                    "lower" => true,
                    _ => return Err("invalid case".into()),
                },
                whitespace: match self.normalize.whitespace.as_deref().unwrap_or("none") {
                    "none" => Whitespace::Exact,
                    "trim" => Whitespace::Trim,
                    "collapse" => Whitespace::Collapse,
                    _ => return Err("invalid whitespace".into()),
                },
            },
            ..Default::default()
        };
        if let Some(v) = self.hue_range {
            renderer.hue_range = v
        }
        if let Some(v) = self.backgrounds.light {
            renderer.light_background = rgb(&v)?
        }
        if let Some(v) = self.backgrounds.dark {
            renderer.dark_background = rgb(&v)?
        }
        if let Some(v) = self.foregrounds {
            renderer.foregrounds = v.iter().map(|s| rgb(s)).collect::<Result<_>>()?
        }
        if let Some(entries) = self.palette {
            let mut colors = BTreeMap::new();
            for e in entries {
                if colors
                    .insert(e.id, brand(e.light.as_deref(), e.dark.as_deref())?)
                    .is_some()
                {
                    return Err("duplicate palette id".into());
                }
            }
            renderer.palette = Some(colors);
        }
        for (id, b) in self.overrides {
            let colors = match b {
                Brand::Both(s) => brand(Some(&s), None)?,
                Brand::Pair(p) => brand(p.light.as_deref(), p.dark.as_deref())?,
            };
            renderer.overrides.insert(id, colors);
        }
        Ok(renderer)
    }
}
