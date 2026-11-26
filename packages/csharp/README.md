# TextHue for .NET

**Experimental source port.** See the [package capability table](https://github.com/HusteDev/texthue/blob/main/docs/PACKAGES.md).

The C# package targets .NET 10 and uses the platform SHA-256 implementation. Resolve a label into ten sRGB [roles](https://github.com/HusteDev/texthue/blob/main/docs/GLOSSARY.md#theme-and-role) for each theme, or use a batch to preserve input order and reuse duplicate assignments.

Use `color.ToCss(CssFormat.Hsl)` for HSL with percentages or `color.ToCss(CssFormat.DisplayP3)` for a Display P3 rendition. Calling `color.ToCss()` returns hex.

For [Display-P3](https://github.com/HusteDev/texthue/blob/main/docs/GLOSSARY.md#gamut-and-display-p3), use `new Renderer(gamut: Gamut.DisplayP3)`. Each role exposes native channels in `P3` and a CSS color in `Css`. Its `Hex` value represents the sRGB fallback, and `SrgbClipped` indicates whether that fallback required clipping.

```csharp
using TextHue;

var renderer = new Renderer(scope: "project", seed: 42);
var palettes = renderer.Batch(["apple", "pear", "apple"]);
var apple = palettes[0];
Console.WriteLine($"{apple.Light["fill"].Hex} {apple.Dark["onFill"].Hex}");
```

Expected output is `#5ab95a #ffffff`. Use `renderer.Resolve("apple")` to resolve one label. Each color exposes its RGB bytes, hex string, HSL and [OKLCH](https://github.com/HusteDev/texthue/blob/main/docs/GLOSSARY.md#color-formats) coordinates.

From the repository root, build the NuGet package with `dotnet pack packages/csharp/src/TextHue -c Release -o artifacts/nuget`. From a .NET 10 consumer project, install it with `dotnet add package TextHue --version 0.1.0 --source <absolute-path-to-artifacts/nuget>`. Run the shared fixture suite from the repository root with `dotnet run -c Release --project packages/csharp/tests/Conformance`.

For one role, use `renderer.Hex("apple", dark: true, role: "border")` or
`renderer.ResolveColor("apple", role: "fill")`. Both render the selected theme
and the role's dependencies. `Hex` formats the sRGB bytes directly.

Read `palette.LightContrast["textOnSubtle"]` or the corresponding `DarkContrast` entry to inspect the rendered relationship. Each report includes the [WCAG](https://github.com/HusteDev/texthue/blob/main/docs/GLOSSARY.md#contrast-models) ratio, the selected model and its signed measurement, pass status, lightness and chroma adjustments, and any fallback reason.

Use `renderer.HexStrict(text, role: "text")` to enforce the selected role's [contrast](https://github.com/HusteDev/texthue/blob/main/docs/GLOSSARY.md#distance-and-contrast) targets. Text is checked against both the background and subtle surface. An unmet target throws `InvalidOperationException`.

Use `renderer.Assign(labels)` to assign a collection and
`renderer.Assign(updatedLabels, previous.Assignments)` to retain prior
placements. The result contains palettes for the requested normalized labels.
Its report measures the closest pairs using rendered light-fill OKLab distance.

NFC and NFKC require runtime globalization data. With invariant globalization enabled, requesting either form raises `PlatformNotSupportedException`. Raw identities work in invariant mode.

The renderer targets .NET 10. NFC and NFKC require globalization data. Under invariant globalization, requesting either form throws a `PlatformNotSupportedException`. Read stable error codes with `TextHueErrors.GetCode(exception)`. Colors, palettes and assignment results compare by value.
