#![no_main]

#[path = "../../examples/support/options.rs"]
mod options;

use libfuzzer_sys::fuzz_target;

fuzz_target!(|data: &[u8]| {
    if let Ok(options) = serde_json::from_slice::<options::Options>(data) {
        if let Ok(renderer) = options.renderer() {
            if let Ok(compiled) = renderer.compile() {
                let palette = compiled.resolve("fuzz").unwrap();
                assert_eq!(
                    compiled.hex("fuzz", false, "fill").unwrap(),
                    palette.light["fill"].hex
                );
            }
        }
    }
});
