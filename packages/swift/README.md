# TextHue for Swift

Resolve a label into ten sRGB roles for each of two themes. Each role includes hex, RGB, HSL and OKLCH representations. Use the same namespace, seed and options to reproduce an assignment.

Pass `strict: true` to `renderer.hex` to throw `RenderError.unmetConstraint` when the selected role misses a contrast target. Selecting text checks it against both the background and the subtle surface.

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

Read `lightContrast.relationships` and `darkContrast.relationships` for the seven measured pairs in each theme. Each entry includes its WCAG ratio, target result, repair flags and fallback reason. APCA entries also expose the signed APCA value. Encoded palettes place each report under the `contrast` field in its theme.

For brand colors, construct `RenderOptions` and pass it to `Renderer(options:)`. The `palette` property accepts entries with stable IDs and light or dark fills. The `overrides` property pins both theme fills for a label and takes precedence over the palette. Inspect the result's `source` for `hash`, `palette` or `override`.

Set `options.gamut = .displayP3` before constructing `Renderer(options: options)` to render in Display-P3. Each color carries native `p3` channels, a `css` string, an sRGB `hex` fallback, and `srgbClipped`. Strict role lookups evaluate the relationship in the selected gamut.

## Verify the checkout

Run the single-role example with `swift run --package-path packages/swift TextHueLabels apple pear apple`. Each line prints the label, light fill from `renderer.hex(label)`, and dark foreground from `renderer.color(label, dark: true, role: "onFill")`. Both helpers throw on an unknown role.

Run `swift test --package-path packages/swift --force-resolved-versions` from the repository root with Swift 6 or later. The SwiftPM test target bundles the shared reference vectors. From a standalone copy of the Swift package, run `swift test --force-resolved-versions`.

The package uses CryptoKit on Apple platforms and pins swift-crypto 3.0.0 for Linux and Windows. The package manifest declares deployment minimums of macOS 10.15, iOS 13, tvOS 13 and watchOS 6.

On the Windows development host, Swift 6.1.3 passed all 34 XCTest cases at commit `f42cd89` in the Linux x86_64 container. The complete two-theme results matched JavaScript for 24 Display-P3 cases covering both contrast models. The Linux Swift conformance executable also matched the JavaScript reference on all 228 generated sRGB cases. Collection tests cover all nine shared assignment fixtures and byte-distinct Unicode label replay. Use `try renderer.assign(labels, pinned: previous.assignments)` to retain earlier placements. The returned dictionaries use normalized UTF-8 `Data` keys because Swift strings compare canonically equivalent spellings as equal. The renderer test checks ten roles in each theme for all 32 frozen identity vectors. The following PowerShell command reproduces the locked build from the repository root. Keep the cache mounted at the same container path across runs because Swift precompiled headers record absolute paths.

```powershell
$source = (Resolve-Path packages/swift).Path
docker run --rm --mount "type=bind,source=$source,target=/src,readonly" --mount type=volume,source=texthue-swift61-build,target=/tmp/build -w /src swift:6.1.3-jammy swift test --scratch-path /tmp/build --force-resolved-versions -j 4
```
