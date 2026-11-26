use crate::{Color, ContrastReport, RenderedPalette};
use serde_json::{json, Value};
use std::collections::BTreeMap;
fn theme(colors: BTreeMap<&str, Color>, report: ContrastReport) -> Value {
    let mut result = json!({});
    for (role, c) in colors {
        let [r, g, b] = c.rgb;
        result[role] = json!({"hex":c.hex,"rgb":{"r":r,"g":g,"b":b},"hsl":{"h":c.hsl.h,"s":c.hsl.s,"l":c.hsl.l},"oklch":{"l":c.oklch.l,"c":c.oklch.c,"h":c.oklch.h}});
        if let Some([r, g, b]) = c.p3 {
            result[role]["p3"] = json!({"r":r,"g":g,"b":b});
            result[role]["css"] = json!(c.css);
            result[role]["srgbClipped"] = json!(c.srgb_clipped);
        }
    }
    let mut contrast = json!({"target":report.target});
    for (role, p) in report.relationships {
        let mut pair = json!({"ratio":p.ratio,"meetsTarget":p.meets_target,"fallback":p.fallback,"chromaReduced":p.chroma_reduced,"lightnessAdjusted":p.lightness_adjusted,"chromaCapped":p.chroma_capped});
        if let Some(v) = p.apca_value {
            pair["model"] = json!("apca");
            pair["value"] = json!(v);
        }
        contrast[role] = pair;
    }
    result["contrast"] = contrast;
    result
}
pub fn palette(p: RenderedPalette) -> Value {
    json!({"version":p.version,"source":p.source,"hue":p.hue,"hueFraction":p.hue_fraction,"light":theme(p.light,p.light_contrast),"dark":theme(p.dark,p.dark_contrast)})
}
