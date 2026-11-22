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
    let palette = renderer.resolve(text).map_err(JsError::new)?;
    let theme = if dark { palette.dark } else { palette.light };
    theme
        .get(role)
        .map(|color| color.hex.clone())
        .ok_or_else(|| JsError::new("Unknown role"))
}
