# TextHue for .NET

The C# package targets .NET 9 and uses the platform SHA-256 implementation. Resolve a label into ten sRGB roles for each theme, or use a batch to preserve input order and reuse duplicate assignments.

```csharp
using TextHue;

var renderer = new Renderer(scope: "project", seed: 42);
var palettes = renderer.Batch(["apple", "pear", "apple"]);
var apple = palettes[0];
Console.WriteLine($"{apple.Light["fill"].Hex} {apple.Dark["onFill"].Hex}");
```

Expected output is `#5ab95a #ffffff`. Use `renderer.Resolve("apple")` to resolve one label. Each color exposes its RGB bytes, hex string, HSL and OKLCH coordinates.

From the repository root, build the NuGet package with `dotnet pack packages/csharp/src/TextHue -c Release -o artifacts/nuget`. From a .NET 9 consumer project, install it with `dotnet add package TextHue --version 0.1.0 --source <absolute-path-to-artifacts/nuget>`. Run the shared fixture suite from the repository root with `dotnet run -c Release --project packages/csharp/tests/Conformance`.

For one role, use `renderer.Hex("apple", dark: true, role: "border")` or
`renderer.ResolveColor("apple", role: "fill")`. Both render the selected theme
and the role's dependencies. `Hex` formats the sRGB bytes directly.
