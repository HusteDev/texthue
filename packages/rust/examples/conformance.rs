use serde::Deserialize;
use serde_json::{json, Value};
use std::{collections::BTreeMap, error::Error, io};
use texthue::*;

type Result<T> = std::result::Result<T, Box<dyn Error>>;

#[path = "support/options.rs"]
mod options;
use options::Options;

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
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Request {
    text: String,
    #[serde(default)]
    options: Options,
}
fn main() -> Result<()> {
    let requests: Vec<Request> = serde_json::from_reader(io::stdin().lock())?;
    let mut output = Vec::with_capacity(requests.len());
    for request in requests {
        let p = request.options.renderer()?.resolve(&request.text)?;
        output.push(json!({"version":p.version,"source":p.source,"hue":p.hue,"hueFraction":p.hue_fraction,"light":theme(p.light,p.light_contrast),"dark":theme(p.dark,p.dark_contrast)}));
    }
    serde_json::to_writer(io::stdout().lock(), &output)?;
    Ok(())
}
