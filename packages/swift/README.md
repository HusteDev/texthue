# Swift

**Experimental source port.** See the [package capability table](https://github.com/HusteDev/texthue/blob/main/docs/PACKAGES.md).

Resolve a label into ten sRGB [roles](https://github.com/HusteDev/texthue/blob/main/docs/GLOSSARY.md#theme-and-role) for each of two themes. Each role includes hex, RGB, HSL and [OKLCH](https://github.com/HusteDev/texthue/blob/main/docs/GLOSSARY.md#color-formats) representations. Use the same [namespace](https://github.com/HusteDev/texthue/blob/main/docs/GLOSSARY.md#identity-and-normalization), seed and options to reproduce an assignment.

Pass `strict: true` to `renderer.hex` to throw `RenderError.unmetConstraint` when the selected role misses a [contrast](https://github.com/HusteDev/texthue/blob/main/docs/GLOSSARY.md#distance-and-contrast) target. Selecting text checks it against both the background and the subtle surface.

Use `color.toCSS(.hsl)` for HSL with percentages or `color.toCSS(.displayP3)` for a Display P3 rendition. Calling `color.toCSS()` returns the sRGB hex value.

## Use from a local Swift package

The repository root exports the `TextHue` SwiftPM library. A sibling checkout
can depend on `.package(path: "../texthue")` and add
`.product(name: "TextHue", package: "texthue")` to its target. Version-based
resolution uses the repository URL and requires a published version tag
whose commit includes the root manifest.

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

Read `lightContrast.relationships` and `darkContrast.relationships` for the seven measured pairs in each [theme](https://github.com/HusteDev/texthue/blob/main/docs/GLOSSARY.md#theme-and-role). Each entry includes its [WCAG](https://github.com/HusteDev/texthue/blob/main/docs/GLOSSARY.md#contrast-models) ratio, target result, repair flags and fallback reason. APCA entries also expose the signed APCA value. Encoded palettes place each report under the `contrast` field in its theme.

For brand colors, construct `RenderOptions` and pass it to `Renderer(options:)`. The `palette` property accepts entries with stable IDs and light or dark fills. The `overrides` property [pins](https://github.com/HusteDev/texthue/blob/main/docs/GLOSSARY.md#pinned-placements) both theme fills for a label and takes precedence over the palette. Inspect the result's `source` for `hash`, `palette` or `override`.

Set `options.gamut = .displayP3` before constructing `Renderer(options: options)` to render in [Display-P3](https://github.com/HusteDev/texthue/blob/main/docs/GLOSSARY.md#gamut-and-display-p3). Each color carries native `p3` channels, a `css` string, an sRGB `hex` fallback, and `srgbClipped`. Strict role lookups evaluate the relationship in the selected gamut.

## Verify the checkout

Run the single-[role](https://github.com/HusteDev/texthue/blob/main/docs/GLOSSARY.md#theme-and-role) example with `swift run --package-path packages/swift TextHueLabels apple pear apple`. Each line prints the label, light fill from `renderer.hex(label)`, and dark foreground from `renderer.color(label, dark: true, role: "onFill")`. Both helpers throw on an unknown role.

Run `swift test --package-path packages/swift --force-resolved-versions` from the repository root with Swift 6 or later. The SwiftPM test target bundles the shared reference vectors. From a standalone copy of the Swift package, run `swift test --force-resolved-versions`.

The package uses CryptoKit on Apple platforms and pins swift-crypto 3.0.0 for Linux and Windows. The package manifest declares deployment minimums of macOS 10.15, iOS 13, tvOS 13 and watchOS 6.

Run the Swift test suite for the current fixture counts.

```powershell
$source = (Resolve-Path packages/swift).Path
docker run --rm --mount "type=bind,source=$source,target=/src,readonly" --mount type=volume,source=texthue-swift61-build,target=/tmp/build -w /src swift:6.1.3-jammy swift test --scratch-path /tmp/build --force-resolved-versions -j 4
```

Pass raw UTF-16 through `renderer.resolve(utf16: units)` to reject unpaired surrogates before conversion to Swift String. Render errors expose their stable identifier through `code`. JSON configuration rejects unknown option keys and explicit nulls.
