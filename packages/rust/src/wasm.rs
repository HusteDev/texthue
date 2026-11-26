use crate::*;

#[path = "wire/options.rs"]
mod options;
#[path = "wire/output.rs"]
mod output;
use wasm_bindgen::prelude::*;

#[wasm_bindgen(js_name = resolveRoleHex)]
pub fn resolve_role_hex(
    text: &str,
    namespace: &str,
    seed: u32,
    dark: bool,
    role: &str,
) -> Result<String, JsError> {
    let renderer = Renderer {
        namespace: namespace.to_owned(),
        seed,
        ..Renderer::default()
    };
    renderer
        .compile()
        .and_then(|compiled| compiled.hex(text, dark, role))
        .map_err(|err| JsError::new(&err.to_string()))
}

#[wasm_bindgen(js_name = resolvePaletteJson)]
pub fn resolve_palette_json(text: &str, settings: &str) -> Result<String, JsError> {
    let options: options::Options = serde_json::from_str(settings)?;
    let palette = options
        .renderer()
        .map_err(|error| JsError::new(&error.to_string()))?
        .resolve(text)?;
    Ok(serde_json::to_string(&output::palette(palette))?)
}

#[derive(serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Pin {
    hue_fraction: f64,
    ring: u64,
    moved: bool,
}

#[wasm_bindgen(js_name = assignPaletteJson)]
pub fn assign_palette_json(labels: &str, settings: &str, pins: &str) -> Result<String, JsError> {
    use serde_json::{json, Value};
    use std::collections::BTreeMap;

    let options: options::Options = serde_json::from_str(settings)?;
    let labels: Vec<String> = serde_json::from_str(labels)?;
    let pins: BTreeMap<String, Pin> = serde_json::from_str(pins)?;
    let placements = pins
        .into_iter()
        .map(|(label, pin)| {
            (
                label,
                Placement {
                    hue_fraction: pin.hue_fraction,
                    ring: pin.ring,
                    moved: pin.moved,
                },
            )
        })
        .collect();
    let renderer = options
        .renderer()
        .map_err(|error| JsError::new(&error.to_string()))?;
    let result = renderer.compile()?.assign(labels, &placements)?;
    let colors: BTreeMap<String, Value> = result
        .colors
        .into_iter()
        .map(|(name, palette)| (name, output::palette(palette)))
        .collect();
    let assignments: BTreeMap<String, Pin> = result
        .assignments
        .into_iter()
        .map(|(name, p)| {
            (
                name,
                Pin {
                    hue_fraction: p.hue_fraction,
                    ring: p.ring,
                    moved: p.moved,
                },
            )
        })
        .collect();
    let report = result.report;
    Ok(serde_json::to_string(
        &json!({ "colors":colors, "assignments":assignments, "report":{
            "minDistance":report.min_distance, "closestPairs":report.closest_pairs,
            "withinRingCapacity":report.within_ring_capacity, "distinctFills":report.distinct_fills
        }}),
    )?)
}
