#[derive(Default)]
pub(crate) struct HueDomain {
    segments: Vec<(f64, f64)>,
    width: f64,
}

impl HueDomain {
    pub(crate) fn new(
        allowed: (f64, f64),
        excluded: &[(f64, f64)],
    ) -> Result<Self, crate::TextColorError> {
        fn split((a, b): (f64, f64)) -> Result<[(f64, f64); 2], crate::TextColorError> {
            if ![a, b].iter().all(|v| (0.0..=360.0).contains(v)) {
                return Err(crate::TextColorError::InvalidOptions(
                    "Hue endpoint outside [0, 360]",
                ));
            }
            Ok(if a <= b {
                [(a, b), (0.0, 0.0)]
            } else {
                [(0.0, b), (a, 360.0)]
            })
        }
        if excluded.len() > 16 {
            return Err(crate::TextColorError::InvalidOptions(
                "Too many excluded hue ranges",
            ));
        }
        let spans = split(allowed)?;
        if allowed == (0.0, 360.0) && excluded.is_empty() {
            return Ok(Self {
                width: 360.0,
                segments: Vec::new(),
            });
        }
        let mut segments: Vec<_> = spans.into_iter().filter(|(a, b)| a < b).collect();
        for &range in excluded {
            for (a, b) in split(range)? {
                if a == b {
                    continue;
                }
                segments = segments
                    .into_iter()
                    .flat_map(|(lo, hi)| [(lo, hi.min(a)), (lo.max(b), hi)])
                    .filter(|(lo, hi)| lo < hi)
                    .collect();
            }
        }
        let width = segments.iter().map(|(lo, hi)| hi - lo).sum();
        if width == 0.0 {
            return Err(crate::TextColorError::InvalidOptions("Empty hue domain"));
        }
        Ok(Self { width, segments })
    }

    pub(crate) fn map(&self, hue: f64) -> f64 {
        if self.width == 360.0 {
            return hue;
        }
        let mut distance = hue / 360.0 * self.width;
        for &(lo, hi) in &self.segments {
            if distance < hi - lo {
                return (lo + distance) % 360.0;
            }
            distance -= hi - lo;
        }
        self.segments[0].0
    }
}
