use crate::Renderer;
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
        .map_err(JsError::new)
}
