use crate::{contrast::linear_channel, gamut::multiply};
pub(crate) const RGBTOXYZ: [[f64; 3]; 3] = [
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
    lab_from_channels(rgb.map(|v| f64::from(v) / 255.0), &RGBTOXYZ)
}

fn lab_from_channels(rgb: [f64; 3], matrix: &[[f64; 3]; 3]) -> [f64; 3] {
    let xyz = multiply(matrix, rgb.map(linear_channel));
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
            oklch: coordinates([r, g, b], &RGBTOXYZ),
            p3: None,
            css: None,
            srgb_clipped: false,
        }
    }
}

fn coordinates(rgb: [f64; 3], matrix: &[[f64; 3]; 3]) -> Oklch {
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

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CssFormat {
    Hex,
    Rgb,
    Hsl,
    Oklch,
    DisplayP3,
}

impl Color {
    /// Format the rendered color for use as a CSS property value.
    pub fn to_css(&self, format: CssFormat) -> String {
        match format {
            CssFormat::Hex => self.hex.clone(),
            CssFormat::Rgb => {
                let [r, g, b] = self.rgb;
                format!("rgb({r} {g} {b})")
            }
            CssFormat::Hsl => {
                let Hsl { h, s, l } = self.hsl;
                format!("hsl({h} {s}% {l}%)")
            }
            CssFormat::Oklch => {
                let Oklch { l, c, h } = self.oklch;
                format!("oklch({l} {c} {h})")
            }
            CssFormat::DisplayP3 => {
                let [r, g, b] = self.p3.unwrap_or_else(|| {
                    crate::Gamut::DisplayP3
                        .channels_from_srgb(self.rgb)
                        .map(round6)
                });
                format!("color(display-p3 {r} {g} {b})")
            }
        }
    }

    /// Build a native Display-P3 rendition and its clipped sRGB fallback.
    pub fn from_display_p3(bytes: [u8; 3]) -> Self {
        Self::from_p3_channels(bytes.map(|v| f64::from(v) / 255.0))
    }

    pub(crate) fn from_p3_channels(native: [f64; 3]) -> Self {
        let (fallback, srgb_clipped) = crate::gamut::fallback_channels(native);
        let channels = native.map(round6);
        let [r, g, b] = channels;
        Self {
            oklch: coordinates(native, &crate::gamut::P3TOXYZ),
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
    fn css_formats() {
        let red = Color::from([255, 0, 0]);
        assert_eq!(red.to_css(CssFormat::Hex), "#ff0000");
        assert_eq!(red.to_css(CssFormat::Rgb), "rgb(255 0 0)");
        assert_eq!(red.to_css(CssFormat::Hsl), "hsl(0 100% 50%)");
        assert_eq!(
            red.to_css(CssFormat::Oklch),
            "oklch(0.627955 0.257683 29.23388)"
        );
        assert_eq!(
            red.to_css(CssFormat::DisplayP3),
            "color(display-p3 0.917488 0.200287 0.138561)"
        );
        assert_eq!(
            Color::from_display_p3([255, 0, 0]).to_css(CssFormat::DisplayP3),
            "color(display-p3 1 0 0)"
        );
    }

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
