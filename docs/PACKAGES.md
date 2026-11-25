# Packages and installation

The repository contains eight language implementations plus three JavaScript ecosystem packages: the [WebAssembly binding](../packages/wasm/README.md), [React hooks](../packages/react/README.md), and [Tailwind adapter](../packages/tailwind/README.md).

TextHue is stateless. The JavaScript and Python packages have no runtime dependencies. Go uses `golang.org/x/text` for Unicode normalization and casing. The libraries run in your application without an account or service.

| Platform | Package | Implementation and documentation |
| --- | --- | --- |
| JavaScript and TypeScript | `texthue` on npm | [TypeScript source, compiled ESM JavaScript and declarations](../packages/npm/README.md) |
| Python | `texthue` on PyPI | [Typed Python package](../packages/python/README.md) |
| Go | `github.com/HusteDev/texthue/packages/go` | [Native Go module](../packages/go/README.md) |

### Additional source ports

These ports support single-label resolution, ordered batches, collection assignment, and replay of pinned placements. Each guide describes its toolchain and how to run the port from a checkout.

| Platform | Select Display-P3 | Assign a collection with previous placements | Guide |
| --- | --- | --- | --- |
| Rust | `Renderer { gamut: Gamut::DisplayP3, ..Renderer::default() }` | `compiled.assign(labels, &previous.assignments)` | [Rust](../packages/rust/README.md) |
| C# / .NET | `new Renderer(gamut: Gamut.DisplayP3)` | `renderer.Assign(labels, previous.Assignments)` | [.NET](../packages/csharp/README.md) |
| Kotlin | `Resolver(gamut = Gamut.DISPLAY_P3)` | `resolver.assign(labels, pinned = previous.assignments)` | [Kotlin and Android](../packages/kotlin/README.md) |
| Swift | `options.gamut = .displayP3` | `try renderer.assign(labels, pinned: previous.assignments)` | [SwiftPM](../packages/swift/README.md) |
| Dart | `Renderer(gamut: Gamut.displayP3)` | `renderer.assign(labels, pinned: previous.assignments)` | [Dart](../packages/dart/README.md) |

Keep the resolver configuration stable when reusing placements. JavaScript, Python, and Go also expose configuration and registry import/export with fingerprint verification.

```bash
npm install texthue
```

```bash
python -m pip install texthue
```

```bash
go get github.com/HusteDev/texthue/packages/go
```

## Resolve your first label

Each example resolves the same label, then reads its fill color for a light and a dark background. The hex values match in these examples.

```typescript
import { resolveTextColors } from 'texthue';

const colors = resolveTextColors('research');
console.log(colors.light.fill.hex); // #59b8d8
console.log(colors.dark.fill.hex);  // #255464
```

```python
from texthue import resolve_text_colors

colors = resolve_text_colors("research")
print(colors.light.fill.hex)  # #59b8d8
print(colors.dark.fill.hex)   # #255464
```

```go
package main

import (
    "fmt"
    texthue "github.com/HusteDev/texthue/packages/go"
)

func main() {
    colors, err := texthue.Resolve("research", nil)
    if err != nil { panic(err) }
    fmt.Println(colors.Light.Fill.Hex) // #59b8d8
    fmt.Println(colors.Dark.Fill.Hex)  // #255464
}
```
