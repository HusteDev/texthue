use crate::tables::{ANCHORS, BIASES};
use crate::{identity_digest, identity_fractions, Color, ContrastModel, Gamut, Normalization};
use std::collections::BTreeMap;

pub type Theme = BTreeMap<&'static str, Color>;

pub struct RenderedPalette {
    pub hue_fraction: f64,
    pub hue: f64,
    pub version: &'static str,
    pub source: &'static str,
    pub light: Theme,
    pub dark: Theme,
}

pub struct Renderer {
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
            normalization: Normalization::default(),
            light_background: [255; 3],
            dark_background: [18; 3],
            contrast_target: 4.5,
        }
    }
}

impl Renderer {
    pub fn resolve(&self, text: &str) -> Result<RenderedPalette, &'static str> {
        if !(1.0..=21.0).contains(&self.contrast_target) {
            return Err("Invalid contrast target");
        }
        let digest = identity_digest(
            &self.normalization.apply(text),
            &self.normalization.apply(&self.namespace),
            self.seed,
        )
        .map_err(|_| "Namespace too long")?;
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
        let sample = |fill: bool| {
            let (low, high) = match (dark, fill) {
                (true, true) => (0.4, 0.5),
                (false, false) => (0.43, 0.53),
                _ => (0.72, 0.82),
            };
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
            let c = Gamut::Srgb.cusp(l, hue) * (0.6 + (0.8 - 0.6) * u_c);
            Gamut::Srgb
                .repair(
                    l,
                    c.min(if fill { 0.16 } else { 0.19 }),
                    hue,
                    target,
                    |rgb| {
                        let primary = score(rgb, back.unwrap_or_else(|| foreground(rgb)));
                        second.map_or(primary, |other| primary.min(score(rgb, other)))
                    },
                )
                .color
                .bytes
        };
        let lf = sample(true);
        let lt = sample(false);
        let t = self.contrast_target;
        let subtle = tone(lb + direction * 0.04, true, 1.0, None, None);
        let fill = tone(lf, true, t, None, None);
        let on_fill = foreground(fill);
        [
            ("background", bg),
            ("subtle", subtle),
            ("muted", tone(lb + direction * 0.10, true, 1.0, None, None)),
            ("fill", fill),
            ("onFill", on_fill),
            (
                "fillHover",
                tone(lf + direction * 0.025, true, t, Some(on_fill), None),
            ),
            (
                "fillActive",
                tone(lf + direction * 0.05, true, t, Some(on_fill), None),
            ),
            (
                "border",
                tone(lb + direction * 0.39, true, t.min(3.0), Some(bg), None),
            ),
            ("text", tone(lt, false, t, Some(bg), Some(subtle))),
            (
                "strong",
                tone(lt + direction * 0.10, false, t, Some(bg), None),
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
    fn shared_renderer() {
        #[derive(Deserialize)]
        struct Corpus {
            vectors: Vec<Value>,
        }
        let corpus: Corpus =
            serde_json::from_str(include_str!("../../../conformance/vectors.json")).unwrap();
        let mut count = 0;
        for row in corpus.vectors {
            let opts = &row["options"];
            if opts.get("profiles").is_some() || opts.get("contrastTargets").is_some() {
                continue;
            }
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
        assert_eq!(count, 25);
    }
}
