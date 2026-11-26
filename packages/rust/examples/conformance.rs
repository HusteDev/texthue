use serde::Deserialize;
use std::{error::Error, io};
use texthue::*;

type Result<T> = std::result::Result<T, Box<dyn Error>>;

#[path = "../src/wire/options.rs"]
mod options;
use options::Options;

#[path = "../src/wire/output.rs"]
mod output;
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
        output.push(output::palette(p));
    }
    serde_json::to_writer(io::stdout().lock(), &output)?;
    Ok(())
}
