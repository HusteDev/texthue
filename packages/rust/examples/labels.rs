use texthue::{Renderer, Role, TextColorError};

fn main() -> Result<(), TextColorError> {
    let renderer = Renderer {
        namespace: "project".into(),
        seed: 42,
        ..Renderer::default()
    };
    let compiled = renderer.compile()?;
    println!(
        "{} {}",
        compiled.hex("apple", false, Role::Fill)?,
        compiled.color("apple", true, Role::OnFill)?.hex
    );
    Ok(())
}
