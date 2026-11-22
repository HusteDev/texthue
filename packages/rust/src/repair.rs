use crate::{FittedColor, Gamut};

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct RepairedTone {
    pub color: FittedColor,
    pub score: f64,
    pub fallback: Option<&'static str>,
}

impl Gamut {
    pub fn repair(
        self,
        lightness: f64,
        chroma: f64,
        hue: f64,
        target: f64,
        measure: impl Fn([u8; 3]) -> f64,
    ) -> RepairedTone {
        let evaluate = |l| {
            let color = self.fit(l, chroma, hue);
            RepairedTone {
                color,
                score: measure(color.bytes),
                fallback: None,
            }
        };
        let initial = evaluate(lightness);
        if initial.score >= target {
            return initial;
        }
        let black = evaluate(0.0);
        let white = evaluate(1.0);
        if black.score.max(white.score) < target {
            let best = if black.score >= white.score {
                black
            } else {
                white
            };
            return RepairedTone {
                fallback: Some("unattainable-contrast"),
                ..best
            };
        }
        let mut best = initial;
        let mut distance = f64::INFINITY;
        for endpoint in [black, white] {
            if endpoint.score < target {
                continue;
            }
            let mut candidate = endpoint;
            let mut pass = (endpoint.color.lightness * 4096.0) as i32;
            let mut fail = if pass == 0 {
                (lightness * 4096.0).ceil()
            } else {
                (lightness * 4096.0).floor()
            } as i32;
            while (pass - fail).abs() > 1 {
                let mid = (pass + fail) / 2;
                let probe = evaluate(f64::from(mid) / 4096.0);
                if probe.score >= target {
                    pass = mid;
                    candidate = probe;
                } else {
                    fail = mid;
                }
            }
            let delta = (candidate.color.lightness - lightness).abs();
            if delta < distance {
                best = candidate;
                distance = delta;
            }
        }
        best
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ContrastModel;

    #[test]
    fn shared_repairs() {
        let corpus = include_str!("../testdata/tone-repair-v1.tsv");
        assert_eq!(corpus.lines().count(), 192);
        for line in corpus.lines() {
            let f: Vec<_> = line.split('\t').collect();
            let gamut = match f[0] {
                "SRGB" => Gamut::Srgb,
                "DISPLAY_P3" => Gamut::DisplayP3,
                _ => panic!("invalid gamut"),
            };
            let model = match f[1] {
                "WCAG2" => ContrastModel::Wcag2,
                "APCA" => ContrastModel::Apca,
                _ => panic!("invalid model"),
            };
            let number = |i: usize| f[i].parse::<f64>().unwrap();
            let bytes = |i: usize| -> [u8; 3] {
                f[i].split(',')
                    .map(|v| v.parse().unwrap())
                    .collect::<Vec<_>>()
                    .try_into()
                    .unwrap()
            };
            let bg = bytes(5);
            let tone = gamut.repair(number(2), number(3), number(4), number(6), |rgb| {
                model.measure(rgb, bg, gamut).abs()
            });
            assert_eq!(tone.color.bytes, bytes(7), "{line}");
            assert_eq!(tone.color.lightness, number(8), "{line}");
            assert!((tone.color.chroma - number(9)).abs() <= 1e-12, "{line}");
            assert!((tone.score - number(10)).abs() <= 1e-12, "{line}");
            assert_eq!(tone.fallback.unwrap_or("-"), f[11], "{line}");
        }
        let tie = Gamut::Srgb.repair(0.5, 0.0, 0.0, 1.0, |_| 0.0);
        assert_eq!(tie.color.bytes, [0; 3]);
        assert_eq!(tie.fallback, Some("unattainable-contrast"));
    }
}
