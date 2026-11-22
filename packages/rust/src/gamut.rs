use crate::{contrast::linear_channel, Gamut};

const LABTOLMS: [[f64; 3]; 3] = [
    [1.0, 0.3963377773761749, 0.2158037573099136],
    [1.0, -0.1055613458156586, -0.0638541728258133],
    [1.0, -0.0894841775298119, -1.2914855480194092],
];
const LMSTOXYZ: [[f64; 3]; 3] = [
    [1.2268798758459243, -0.5578149944602171, 0.2813910456659647],
    [-0.0405757452148008, 1.112286803280317, -0.0717110580655164],
    [-0.0763729366746601, -0.4214933324022432, 1.5869240198367816],
];
const XYZTORGB: [[f64; 3]; 3] = [
    [12831.0 / 3959.0, -329.0 / 214.0, -1974.0 / 3959.0],
    [
        -851781.0 / 878810.0,
        1648619.0 / 878810.0,
        36519.0 / 878810.0,
    ],
    [705.0 / 12673.0, -2585.0 / 12673.0, 705.0 / 667.0],
];
const XYZTOP3: [[f64; 3]; 3] = [
    [
        446124.0 / 178915.0,
        -333277.0 / 357830.0,
        -72051.0 / 178915.0,
    ],
    [-14852.0 / 17905.0, 63121.0 / 35810.0, 423.0 / 17905.0],
    [11844.0 / 330415.0, -50337.0 / 660830.0, 316169.0 / 330415.0],
];
const P3TOXYZ: [[f64; 3]; 3] = [
    [
        608311.0 / 1250200.0,
        189793.0 / 714400.0,
        198249.0 / 1000160.0,
    ],
    [
        35783.0 / 156275.0,
        247089.0 / 357200.0,
        198249.0 / 2500400.0,
    ],
    [0.0, 32229.0 / 714400.0, 5220557.0 / 5000800.0],
];

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct FittedColor {
    pub bytes: [u8; 3],
    pub lightness: f64,
    pub chroma: f64,
}

pub(crate) fn multiply(matrix: &[[f64; 3]; 3], v: [f64; 3]) -> [f64; 3] {
    matrix.map(|row| (row[0] * v[0] + row[1] * v[1]) + row[2] * v[2])
}

fn inside(channels: [f64; 3]) -> bool {
    channels.iter().all(|v| (-1e-12..=1.0 + 1e-12).contains(v))
}

pub(crate) fn channel_byte(linear: f64) -> u8 {
    let x = linear.clamp(0.0, 1.0);
    let encoded = if x <= 0.0031308 {
        x * 12.92
    } else {
        1.055 * x.powf(1.0 / 2.4) - 0.055
    };
    (encoded * 255.0 + 0.5).floor() as u8
}

/// Convert quantized Display-P3 channels to sRGB and report whether clipping was required.
pub fn p3_fallback(bytes: [u8; 3]) -> ([u8; 3], bool) {
    let xyz = multiply(
        &P3TOXYZ,
        bytes.map(|b| linear_channel(f64::from(b) / 255.0)),
    );
    let rgb = multiply(&XYZTORGB, xyz);
    (rgb.map(channel_byte), !inside(rgb))
}

impl Gamut {
    fn linear(self, l: f64, c: f64, h: f64) -> [f64; 3] {
        let angle = h * std::f64::consts::PI / 180.0;
        let lms = multiply(&LABTOLMS, [l, c * angle.cos(), c * angle.sin()]);
        let xyz = multiply(&LMSTOXYZ, lms.map(|x| x * x * x));
        multiply(
            match self {
                Self::Srgb => &XYZTORGB,
                Self::DisplayP3 => &XYZTOP3,
            },
            xyz,
        )
    }

    fn limit(self, l: f64, c: f64, h: f64, steps: usize) -> f64 {
        let (mut low, mut high) = (0.0, c);
        for _ in 0..steps {
            let mid = (low + high) / 2.0;
            if inside(self.linear(l, mid, h)) {
                low = mid;
            } else {
                high = mid;
            }
        }
        low
    }

    pub fn cusp(self, l: f64, h: f64) -> f64 {
        #[cfg(test)]
        crate::work::CUSPS.set(crate::work::CUSPS.get() + 1);
        if l == 0.0 || l == 1.0 {
            0.0
        } else {
            self.limit(l, 0.4, h, 20)
        }
    }

    pub fn fit(self, l: f64, c: f64, h: f64) -> FittedColor {
        #[cfg(test)]
        crate::work::FITS.set(crate::work::FITS.get() + 1);
        if l == 0.0 || l == 1.0 {
            return FittedColor {
                bytes: [(l * 255.0) as u8; 3],
                lightness: l,
                chroma: 0.0,
            };
        }
        let mut channels = self.linear(l, c, h);
        let mut retained = c;
        if !inside(channels) {
            retained = self.limit(l, c, h, 24);
            channels = self.linear(l, retained, h);
        }
        FittedColor {
            bytes: channels.map(channel_byte),
            lightness: l,
            chroma: retained,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde::Deserialize;

    #[test]
    fn shared_p3_fits_and_fallbacks() {
        #[derive(Deserialize)]
        struct Row {
            l: f64,
            c: f64,
            h: f64,
            rgb: [u8; 3],
            fallback: [u8; 3],
            clipped: bool,
        }
        let rows: Vec<Row> =
            serde_json::from_str(include_str!("../testdata/p3-fit-v1.json")).unwrap();
        assert_eq!(rows.len(), 108);
        for row in rows {
            let fit = Gamut::DisplayP3.fit(row.l, row.c, row.h);
            assert_eq!(fit.bytes, row.rgb);
            assert_eq!(p3_fallback(fit.bytes), (row.fallback, row.clipped));
        }
    }
}
