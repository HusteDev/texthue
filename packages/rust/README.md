# TextHue for Rust

Resolve a label into ten sRGB roles for each theme with `Renderer::resolve`. Each role has hex, RGB, HSL and OKLCH representations. Use `Renderer::batch` to preserve input order and share palettes for duplicate normalized labels.

From a Rust consumer project, add the local checkout with `cargo add --path ../texthue/packages/rust`, adjusting the path to your checkout. The [labels example](examples/labels.rs) uses namespace `project` and seed `42` and prints the light fill and dark foreground for `apple`.

From the crate directory, run `cargo run --locked --example labels`. Expected output is `#5ab95a #ffffff`. Run `cargo test --locked` to check the reference vectors included in the crate.

Runtime dependencies are pinned to `sha2` 0.10.9 and `unicode-normalization` 0.1.24. Exact text is the default. Configure `Normalization` to apply NFC or NFKC, lowercasing, or whitespace handling before hashing.

Run `cargo bench --locked --bench renderer` from the crate directory to measure default, high-contrast and unattainable targets, plus ordered batches of 40 labels with either 40 or eight distinct values.

For repeated calls with the same options, compile the renderer once. Compilation validates the configuration, normalizes the namespace and override keys, and filters the approved palette for both themes.

```rust
use texthue::Renderer;

let options = Renderer { namespace: "project".into(), ..Renderer::default() };
let renderer = options.compile().unwrap();
let single = renderer.resolve("atlas").unwrap();
let batch = renderer.batch(["atlas", "nova", "atlas"]).unwrap();
assert_eq!(single, *batch[0]);
assert!(std::sync::Arc::ptr_eq(&batch[0], &batch[2]));
```
