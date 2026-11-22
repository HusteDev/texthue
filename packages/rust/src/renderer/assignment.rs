use super::{CompiledRenderer, RenderedPalette};
use crate::{color::oklab, identity_digest};
use std::collections::{BTreeMap, BTreeSet};

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Placement {
    pub hue_fraction: f64,
    pub ring: u64,
    pub moved: bool,
}

pub struct Assignment {
    pub assignments: BTreeMap<String, Placement>,
    pub colors: BTreeMap<String, RenderedPalette>,
    pub report: AssignmentReport,
}

pub struct AssignmentReport {
    pub min_distance: Option<f64>,
    pub closest_pairs: Vec<(String, String)>,
    pub within_ring_capacity: bool,
    pub distinct_fills: bool,
}

fn place(natural: f64, occupied: &BTreeMap<String, Placement>, separation: f64) -> Placement {
    for ring in 0.. {
        let neighbors: Vec<_> = occupied.values().filter(|p| p.ring == ring).collect();
        for i in 0..385 {
            let step = ((i + 1) / 2) * if i % 2 == 0 { 1 } else { -1 };
            let raw = natural + f64::from(step) * (separation / 4.0);
            let hue_fraction = raw - raw.floor();
            if neighbors.iter().all(|p| {
                let d = (p.hue_fraction - hue_fraction).abs();
                d.min(1.0 - d) >= separation
            }) {
                return Placement {
                    hue_fraction,
                    ring,
                    moved: i != 0 || ring != 0,
                };
            }
        }
    }
    unreachable!()
}

impl CompiledRenderer<'_> {
    pub fn assign<S: AsRef<str>>(
        &self,
        texts: impl IntoIterator<Item = S>,
        pinned: &BTreeMap<String, Placement>,
    ) -> Result<Assignment, &'static str> {
        let normalize = |s: &str| self.renderer.normalization.apply(s);
        let names: BTreeSet<_> = texts.into_iter().map(|s| normalize(s.as_ref())).collect();
        let mut assignments = BTreeMap::new();
        for (name, p) in pinned {
            if !(0.0..1.0).contains(&p.hue_fraction)
                || p.ring > (1_u64 << 53) - 1
                || assignments.insert(normalize(name), *p).is_some()
            {
                return Err("Invalid pinned placement");
            }
        }
        let size = names.len() + assignments.keys().filter(|k| !names.contains(*k)).count();
        let separation = (1.0 / size as f64).clamp(1.0 / 24.0, 1.0 / 12.0);
        let mut entries = Vec::with_capacity(names.len());
        for name in names {
            let digest = identity_digest(&name, &self.scope, self.renderer.seed)
                .map_err(|_| "Namespace too long")?;
            let mapped = self.renderer.mapping(&name, self)?;
            if mapped.fixed.is_some() {
                assignments.entry(name.clone()).or_insert(Placement {
                    hue_fraction: mapped.fraction,
                    ring: 0,
                    moved: false,
                });
            }
            entries.push((digest, name, mapped));
        }
        entries.sort_by_key(|entry| entry.0);
        let mut colors = BTreeMap::new();
        let mut points = Vec::new();
        let mut fills = BTreeSet::new();
        for (_, name, mut mapped) in entries {
            let p = assignments
                .get(&name)
                .copied()
                .unwrap_or_else(|| place(mapped.fraction, &assignments, separation));
            assignments.insert(name.clone(), p);
            mapped.ring = (p.ring % 5) as usize;
            if mapped.fixed.is_none() {
                mapped.source = "assigned";
                mapped.fraction = p.hue_fraction;
                mapped.hue = self.mapped_hue(p.hue_fraction);
            }
            let palette = self.renderer.render_mapping(mapped);
            let rgb = palette.light["fill"].rgb;
            fills.insert(rgb);
            points.push((name.clone(), oklab(rgb)));
            colors.insert(name, palette);
        }
        let mut min_distance = None;
        let mut closest_pairs = Vec::new();
        for (i, (first, a)) in points.iter().enumerate() {
            for (second, b) in &points[i + 1..] {
                let d = (a[0] - b[0]).hypot(a[1] - b[1]).hypot(a[2] - b[2]);
                if min_distance.is_none_or(|best| d < best) {
                    min_distance = Some(d);
                    closest_pairs.clear();
                }
                if min_distance == Some(d) {
                    closest_pairs.push((first.clone(), second.clone()));
                }
            }
        }
        let report = AssignmentReport {
            min_distance,
            closest_pairs,
            distinct_fills: fills.len() == colors.len(),
            within_ring_capacity: size <= 5 * (1.0 / separation).floor() as usize,
        };
        Ok(Assignment {
            assignments,
            colors,
            report,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{BrandColors, Renderer};
    use serde_json::Value;

    fn placement(v: &Value) -> Placement {
        Placement {
            hue_fraction: v["hueFraction"].as_f64().unwrap(),
            ring: v["ring"].as_u64().unwrap(),
            moved: v["moved"].as_bool().unwrap(),
        }
    }
    fn bytes(hex: &str) -> [u8; 3] {
        std::array::from_fn(|i| u8::from_str_radix(&hex[1 + i * 2..3 + i * 2], 16).unwrap())
    }

    #[test]
    fn shared_assignment_vectors() {
        let rows: Vec<Value> =
            serde_json::from_str(include_str!("../../testdata/assign-vectors.json")).unwrap();
        for row in rows {
            let mut renderer = Renderer::default();
            renderer.normalization.lowercase = row["options"]["normalize"]["case"] == "lower";
            if let Some(overrides) = row["options"]["overrides"].as_object() {
                for (label, pair) in overrides {
                    let light = bytes(pair.as_str().or_else(|| pair["light"].as_str()).unwrap());
                    let dark = pair["dark"].as_str().map(bytes).unwrap_or(light);
                    renderer
                        .overrides
                        .insert(label.clone(), BrandColors { light, dark });
                }
            }
            let pins = row["pinned"]
                .as_object()
                .into_iter()
                .flatten()
                .map(|(k, v)| (k.clone(), placement(v)))
                .collect();
            let labels = row["texts"]
                .as_array()
                .unwrap()
                .iter()
                .map(|v| v.as_str().unwrap());
            let result = renderer.compile().unwrap().assign(labels, &pins).unwrap();
            let expected: BTreeMap<_, _> = row["assignments"]
                .as_object()
                .unwrap()
                .iter()
                .map(|(k, v)| (k.clone(), placement(v)))
                .collect();
            assert_eq!(result.assignments, expected);
            for (k, hex) in row["lightFills"].as_object().unwrap() {
                assert_eq!(result.colors[k].light["fill"].hex, hex.as_str().unwrap());
            }
            let report = &row["report"];
            assert!(
                (result.report.min_distance.unwrap() - report["minDistance"].as_f64().unwrap())
                    .abs()
                    < 1e-12
            );
            assert_eq!(
                serde_json::to_value(result.report.closest_pairs).unwrap(),
                report["closestPairs"]
            );
            assert_eq!(
                result.report.within_ring_capacity,
                report["withinRingCapacity"].as_bool().unwrap()
            );
            assert_eq!(
                result.report.distinct_fills,
                report["distinctFills"].as_bool().unwrap()
            );
        }
    }
}
