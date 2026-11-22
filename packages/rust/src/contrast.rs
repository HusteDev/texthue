#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Gamut {
    Srgb,
    DisplayP3,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ContrastModel {
    Wcag2,
    Apca,
}

pub(crate) fn linear_channel(x: f64) -> f64 {
    if x <= 0.04045 {
        x / 12.92
    } else {
        ((x + 0.055) / 1.055).powf(2.4)
    }
}

impl ContrastModel {
    /// Measure foreground text against its background in the supplied gamut.
    /// APCA preserves polarity. The ratio uses each gamut's luminance weights.
    pub fn measure(self, text: [u8; 3], background: [u8; 3], gamut: Gamut) -> f64 {
        let weights = match (gamut, self) {
            (Gamut::Srgb, Self::Wcag2) => [0.2126, 0.7152, 0.0722],
            (Gamut::Srgb, Self::Apca) => [0.2126729, 0.7151522, 0.0721750],
            (Gamut::DisplayP3, Self::Wcag2) => [
                35783.0 / 156275.0,
                247089.0 / 357200.0,
                198249.0 / 2500400.0,
            ],
            (Gamut::DisplayP3, Self::Apca) => {
                [0.228982959480578, 0.691749262585238, 0.0792677779341829]
            }
        };
        let luminance = |rgb: [u8; 3]| {
            let y: f64 = rgb
                .into_iter()
                .zip(weights)
                .map(|(byte, w)| {
                    let x = f64::from(byte) / 255.0;
                    w * if self == Self::Apca {
                        x.powf(2.4)
                    } else {
                        linear_channel(x)
                    }
                })
                .sum();
            if self == Self::Apca && y < 0.022 {
                y + (0.022 - y).powf(1.414)
            } else {
                y
            }
        };
        let fg = luminance(text);
        let bg = luminance(background);
        if self == Self::Wcag2 {
            return (fg.max(bg) + 0.05) / (fg.min(bg) + 0.05);
        }
        if (fg - bg).abs() < 0.0005 {
            return 0.0;
        }
        let (bg_exp, fg_exp, offset) = if bg > fg {
            (0.56, 0.57, 0.027)
        } else {
            (0.65, 0.62, -0.027)
        };
        let raw = 1.14 * (bg.powf(bg_exp) - fg.powf(fg_exp));
        if raw.abs() < 0.1 {
            0.0
        } else {
            100.0 * (raw - offset)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde::Deserialize;

    #[test]
    fn shared_measurements() {
        type SrgbRow = (u8, u8, u8, u8, u8, u8, f64);
        #[derive(Deserialize)]
        struct P3Row {
            text: [u8; 3],
            background: [u8; 3],
            ratio: f64,
            lc: f64,
        }
        let srgb: Vec<SrgbRow> =
            serde_json::from_str(include_str!("../testdata/apca-srgb-v1.json")).unwrap();
        let p3: Vec<P3Row> =
            serde_json::from_str(include_str!("../testdata/p3-contrast-v1.json")).unwrap();
        assert_eq!(srgb.len() + 2 * p3.len(), 1135);
        let check = |actual: f64, expected: f64| {
            assert!((actual - expected).abs() <= 1e-12, "{actual} vs {expected}")
        };
        for (r, g, b, x, y, z, expected) in srgb {
            check(
                ContrastModel::Apca.measure([r, g, b], [x, y, z], Gamut::Srgb),
                expected,
            );
        }
        for row in p3 {
            check(
                ContrastModel::Apca.measure(row.text, row.background, Gamut::DisplayP3),
                row.lc,
            );
            check(
                ContrastModel::Wcag2.measure(row.text, row.background, Gamut::DisplayP3),
                row.ratio,
            );
        }
        check(
            ContrastModel::Wcag2.measure([0; 3], [255; 3], Gamut::Srgb),
            21.0,
        );
        check(
            ContrastModel::Wcag2.measure([255, 0, 0], [0; 3], Gamut::Srgb),
            5.252,
        );
    }
}
