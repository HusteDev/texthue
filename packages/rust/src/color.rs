use crate::{contrast::linear_channel, gamut::multiply};
const RGBTOXYZ: [[f64; 3]; 3] = [
    [506752.0 / 1228815.0, 87881.0 / 245763.0, 12673.0 / 70218.0],
    [87098.0 / 409605.0, 175762.0 / 245763.0, 12673.0 / 175545.0],
    [7918.0 / 409605.0, 87881.0 / 737289.0, 1001167.0 / 1053270.0],
];
const XYZTOLMS: [[f64; 3]; 3] = [
    [0.819022437996703, 0.3619062600528904, -0.1288737815209879],
    [0.0329836539323885, 0.9292868615863434, 0.0361446663506424],
    [0.0481771893596242, 0.2642395317527308, 0.6335478284694309],
];
const LMSTOLAB: [[f64; 3]; 3] = [
    [0.210454268309314, 0.7936177747023054, -0.0040720430116193],
    [1.9779985324311684, -2.42859224204858, 0.450593709617411],
    [0.0259040424655478, 0.7827717124575296, -0.8086757549230774],
];

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Hsl {
    pub h: f64,
    pub s: f64,
    pub l: f64,
}
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Oklch {
    pub l: f64,
    pub c: f64,
    pub h: f64,
}
#[derive(Debug, Clone, PartialEq)]
pub struct Color {
    pub rgb: [u8; 3],
    pub hex: String,
    pub hsl: Hsl,
    pub oklch: Oklch,
    pub p3: Option<[f64; 3]>,
    pub css: Option<String>,
    pub srgb_clipped: bool,
}

pub(crate) fn oklab(rgb: [u8; 3]) -> [f64; 3] {
    lab_from_channels(rgb, &RGBTOXYZ)
}

fn lab_from_channels(rgb: [u8; 3], matrix: &[[f64; 3]; 3]) -> [f64; 3] {
    let xyz = multiply(matrix, rgb.map(|v| linear_channel(f64::from(v) / 255.0)));
    let lms = multiply(&XYZTOLMS, xyz);
    multiply(&LMSTOLAB, lms.map(f64::cbrt))
}

fn round6(x: f64) -> f64 {
    (x * 1e6 + 0.5).floor() / 1e6
}

impl From<[u8; 3]> for Color {
    fn from(rgb: [u8; 3]) -> Self {
        let [r, g, b] = rgb.map(|x| f64::from(x) / 255.0);
        let hi = r.max(g).max(b);
        let lo = r.min(g).min(b);
        let light = (hi + lo) / 2.0;
        let delta = hi - lo;
        let (hue, saturation) = if delta == 0.0 {
            (0.0, 0.0)
        } else {
            let hue = if hi == r {
                (g - b) / delta + if g < b { 6.0 } else { 0.0 }
            } else if hi == g {
                (b - r) / delta + 2.0
            } else {
                (r - g) / delta + 4.0
            };
            (60.0 * hue, (hi - light) / light.min(1.0 - light))
        };
        Self {
            rgb,
            hex: format!("#{:02x}{:02x}{:02x}", rgb[0], rgb[1], rgb[2]),
            hsl: Hsl {
                h: round6(hue) % 360.0,
                s: round6(100.0 * saturation),
                l: round6(100.0 * light),
            },
            oklch: coordinates(rgb, &RGBTOXYZ),
            p3: None,
            css: None,
            srgb_clipped: false,
        }
    }
}

fn coordinates(rgb: [u8; 3], matrix: &[[f64; 3]; 3]) -> Oklch {
    let [l, a, lab_b] = lab_from_channels(rgb, matrix);
    let neutral = rgb[0] == rgb[1] && rgb[1] == rgb[2];
    let degrees = (lab_b.atan2(a) * 180.0 / std::f64::consts::PI + 360.0) % 360.0;
    Oklch {
        l: round6(l),
        c: if neutral {
            0.0
        } else {
            round6((a * a + lab_b * lab_b).sqrt())
        },
        h: if neutral {
            0.0
        } else {
            round6(degrees) % 360.0
        },
    }
}

impl Color {
    /// Build a native Display-P3 rendition and its clipped sRGB fallback.
    pub fn from_display_p3(bytes: [u8; 3]) -> Self {
        let (fallback, srgb_clipped) = crate::p3_fallback(bytes);
        let channels = bytes.map(|v| round6(f64::from(v) / 255.0));
        let [r, g, b] = channels;
        Self {
            oklch: coordinates(bytes, &crate::gamut::P3TOXYZ),
            p3: Some(channels),
            css: Some(format!("color(display-p3 {r} {g} {b})")),
            srgb_clipped,
            ..Self::from(fallback)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde::Deserialize;
    use serde_json::Value;

    #[test]
    fn shared_role_formats() {
        #[derive(Deserialize)]
        struct Corpus {
            vectors: Vec<Value>,
        }
        let corpus: Corpus =
            serde_json::from_str(include_str!("../testdata/vectors.json")).unwrap();
        let mut count = 0;
        for row in corpus.vectors {
            for theme in ["light", "dark"] {
                for role in [
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
                ] {
                    let expected = &row["expected"][theme][role];
                    let color = Color::from(
                        ["r", "g", "b"]
                            .map(|k| u8::try_from(expected["rgb"][k].as_u64().unwrap()).unwrap()),
                    );
                    assert_eq!(color.hex, expected["hex"]);
                    for (format, field, value) in [
                        ("hsl", "h", color.hsl.h),
                        ("hsl", "s", color.hsl.s),
                        ("hsl", "l", color.hsl.l),
                        ("oklch", "l", color.oklch.l),
                        ("oklch", "c", color.oklch.c),
                        ("oklch", "h", color.oklch.h),
                    ] {
                        assert!(
                            (value - expected[format][field].as_f64().unwrap()).abs()
                                <= 1.000001e-6,
                            "{theme} {role} {format}.{field}"
                        );
                    }
                    count += 1;
                }
            }
        }
        assert_eq!(count, 640);
    }
}
