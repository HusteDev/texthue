# TextHue for Rust

Resolve a label into ten sRGB roles for each theme with `Renderer::resolve`. Each role has hex, RGB, HSL and OKLCH representations. Use `Renderer::batch` to preserve input order and share palettes for duplicate normalized labels.

For Display-P3, construct `Renderer { gamut: Gamut::DisplayP3, ..Renderer::default() }` with `texthue::{Gamut, Renderer}` in scope. Each role exposes native channels in `p3` and a CSS color in `css`. Its hex value represents the sRGB fallback, and `srgb_clipped` indicates whether that fallback required clipping.

From a Rust consumer project, add the local checkout with `cargo add --path ../texthue/packages/rust`, adjusting the path to your checkout. The [labels example](examples/labels.rs) uses namespace `project` and seed `42` and prints the light fill and dark foreground for `apple`.

From the crate directory, run `cargo run --locked --example labels`. The example calls `compiled.hex("apple", false, "fill")` for the light fill and `compiled.color("apple", true, "onFill")` for the dark foreground. Expected output is `#5ab95a #ffffff`. Run `cargo test --locked` to check the reference vectors included in the crate.

Runtime dependencies are pinned to `sha2` 0.11.1 and `unicode-normalization` 0.1.26. Exact text is the default. Configure `Normalization` to apply NFC or NFKC, lowercasing, or whitespace handling before hashing.

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

Use `compiled.hex_strict(text, dark, role)` to return an error when a selected contrast target fails. Text is checked against both the background and subtle surface.

For a fresh label set, call `compiled.assign(labels, &BTreeMap::new())` with
`std::collections::BTreeMap` in scope. Pass the returned `assignments` map
on the next call to retain prior placements. The result includes palettes
for requested normalized labels and a report measuring distances between
rendered light fills. Its ring-capacity flag describes placement capacity.
The `distinct_fills` field reports whether those fills have unique RGB bytes.

## Fuzz the option parser

From the Rust package directory, install `cargo-fuzz` and use a nightly Rust toolchain. Create `fuzz/corpus/options` to hold generated inputs, then run:

```sh
cargo +nightly fuzz run options fuzz/corpus/options fuzz/seeds/options -- -runs=10000
```

The target parses the same JSON options as the conformance runner. Accepted configurations must compile or return a validation error. For each compiled configuration it compares the selective light-fill hex with the full palette. Run the instrumented target on Linux. Windows MSVC also builds the library as a DLL and can fail to link the coverage hooks for that DLL.
