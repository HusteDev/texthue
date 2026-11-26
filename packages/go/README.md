# TextHue for Go

Configure a resolver once to generate deterministic colors for usernames or other labels. A resolver can be shared by concurrent callers. The module requires Go 1.23 or newer.

To try the pre-release module in a sibling checkout, run these commands in your consumer module:

```sh
go mod edit -replace github.com/HusteDev/texthue/packages/go=../texthue/packages/go
go get github.com/HusteDev/texthue/packages/go
```

```go
package main

import (
    "fmt"
    "log"

    "github.com/HusteDev/texthue/packages/go"
)

func main() {
    resolver, err := texthue.NewResolver()
    if err != nil { log.Fatal(err) }
    palette, err := resolver.Resolve("research")
    if err != nil { log.Fatal(err) }
    fmt.Println(palette.Light.Fill.Hex, palette.Light.OnFill.Hex) // #59b8d8 #000000
}
```

The declared package name is `texthue`. Pass one base `*texthue.Options` plus any `With…` options. Functional options take precedence over the base. For collections, `resolver.Assign(labels, nil)` returns one placement per normalized identity. Pass those placements to `ExportRegistry` and restore them with `ImportRegistry` before extending a collection.

Use `AssignWithOptions` for marker shapes and vision-aware placement. Its `ColorsByInput` map accepts the original label spelling when normalization is enabled. Use `WithPaletteMode("anchors")` to generate variations around the colors in `WithPalette`.

[Three-session roster example](https://github.com/HusteDev/texthue/tree/main/examples/roster) · [Algorithm and option contract](SPECIFICATION.md)
