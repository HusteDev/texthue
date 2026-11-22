use texthue::Renderer;

fn main() -> Result<(), &'static str> {
    let renderer = Renderer {
        namespace: "project".into(),
        seed: 42,
        ..Renderer::default()
    };
    let palettes = renderer.batch(["apple", "pear", "apple"])?;
    println!(
        "{} {}",
        palettes[0].light["fill"].hex, palettes[0].dark["onFill"].hex
    );
    Ok(())
}
