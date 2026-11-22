use texthue::Renderer;

fn main() -> Result<(), &'static str> {
    let renderer = Renderer {
        namespace: "project".into(),
        seed: 42,
        ..Renderer::default()
    };
    let compiled = renderer.compile()?;
    println!(
        "{} {}",
        compiled.hex("apple", false, "fill")?,
        compiled.color("apple", true, "onFill")?.hex
    );
    Ok(())
}
