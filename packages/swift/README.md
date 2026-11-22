# TextHue for Swift

Resolve a label into ten sRGB roles for each of two themes. Each role includes hex, RGB, HSL and OKLCH representations. Use the same namespace, seed and options to reproduce an assignment.

## Use from a local Swift package

The checkout contains a SwiftPM library in `packages/swift`. In the consuming package manifest, add `.package(path: "../texthue/packages/swift")` to the dependencies, adjusting the path for your checkout. Add `.product(name: "TextHue", package: "swift")` to the consuming target's dependencies.

```swift
import TextHue

let renderer = try Renderer(namespace: "project", seed: 42)
let palettes = try renderer.batch(["apple", "pear", "apple"])
precondition(palettes[0] == palettes[2])
if let fill = palettes[0].light["fill"], let foreground = palettes[0].dark["onFill"] {
    print(fill.hex, foreground.hex)
}
```

Expected output is `#5ab95a #ffffff`. Batch results preserve input order. Repeated normalized labels share work within a single batch. Exact UTF-8 identity is the default. Set `normalize: Normalization(unicode: .NFC)` to merge canonically equivalent spellings.

For brand colors, construct `RenderOptions` and pass it to `Renderer(options:)`. The `palette` property accepts entries with stable IDs and light or dark fills. The `overrides` property pins both theme fills for a label and takes precedence over the palette. Inspect the result's `source` for `hash`, `palette` or `override`.

## Verify the checkout

Run `swift test --package-path packages/swift --force-resolved-versions` from the repository root with Swift 6 or later. The tests load shared reference vectors from the checkout's `conformance` directory.

The package uses CryptoKit on Apple platforms and pins swift-crypto 3.0.0 for Linux and Windows. The package manifest declares deployment minimums of macOS 10.15, iOS 13, tvOS 13 and watchOS 6.
