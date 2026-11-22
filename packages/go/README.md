# TextHue for Go

`texthue` turns exact text into repeatable light/dark color sets in Hex, RGB, HSL, and OKLCH. This native Go implementation requires Go 1.23+ and uses only the standard library. It has no global mutable configuration and can be called concurrently. Results match the JavaScript/TypeScript and Python libraries.

```bash
go get github.com/HusteDev/texthue/packages/go
```

## Basic use and every output format

```go
package main

import (
    "fmt"
    texthue "github.com/HusteDev/texthue/packages/go"
)

func main() {
    colors, err := texthue.Resolve("research", nil)
    if err != nil { panic(err) }
    theme := colors.Light // Or colors.Dark; the application chooses.
    fill := theme.Fill
    fmt.Println(fill.Hex) // #59b8d8
    fmt.Printf("rgb(%d %d %d)\n", fill.RGB.R, fill.RGB.G, fill.RGB.B)
    fmt.Printf("hsl(%g %g%% %g%%)\n", fill.HSL.H, fill.HSL.S, fill.HSL.L)
    fmt.Printf("oklch(%g %g %g)\n", fill.OKLCH.L, fill.OKLCH.C, fill.OKLCH.H)
    fmt.Println(theme.OnFill.Hex)      // Text on Fill.
    fmt.Println(theme.Text.Hex)      // Text/marks on Background.
    fmt.Println(theme.Background.Hex)
    fmt.Println(theme.Contrast.Fill.Ratio, theme.Contrast.Text.MeetsTarget)
}
```

Every color has `Hex`, `RGB`, `HSL`, and `OKLCH`. RGB channels are integers 0–255. HSL uses degrees and percentages. OKLCH uses fractional lightness 0–1, numeric chroma, and hue degrees. Hex uses lowercase six-digit sRGB. HSL/OKLCH are rounded to six decimal places and describe the final RGB bytes. Result structs have camelCase JSON tags matching the other libraries.

## API and complete options

```go
func Resolve(text string, options ...Option) (ColorSet, error)
func NewResolver(options ...Option) (*Resolver, error)
func ParseOptions(data []byte) ([]Option, error)
func WithPalette(values []PaletteEntry) Option
func WithOverrides(values map[string]Override) Option
func Ptr[T any](value T) *T
```

`Resolve` is synchronous. `nil` options and `&Options{}` use defaults. Optional pointer fields distinguish an omitted value from a meaningful zero. `Ptr` creates a pointer to a value; use `Ptr(7.0)` rather than `Ptr(7)` for a `*float64`. Ranges are `[2]float64` arrays named `Range`. Inputs are not mutated; callers must not mutate shared options concurrently with a call.

```go
options := &texthue.Options{
    Namespace: "workspace:demo",
    Backgrounds: &texthue.Backgrounds{
        Light: texthue.Ptr("#f5f0e8"), Dark: texthue.Ptr("#20242b"),
    },
    ContrastTarget: texthue.Ptr(7.0),
    Profiles: &texthue.Profiles{
        Light: &texthue.ThemeProfiles{
            Fill: &texthue.Profile{
                Lightness: &texthue.Range{0.74, 0.84}, ChromaScale: &texthue.Range{0.08, 0.14},
            },
            Text: &texthue.Profile{
                Lightness: &texthue.Range{0.40, 0.52}, ChromaScale: &texthue.Range{0.60, 0.80},
            },
        },
        Dark: &texthue.ThemeProfiles{
            Fill: &texthue.Profile{
                Lightness: &texthue.Range{0.38, 0.48}, ChromaScale: &texthue.Range{0.08, 0.14},
            },
            Text: &texthue.Profile{
                Lightness: &texthue.Range{0.74, 0.86}, ChromaScale: &texthue.Range{0.60, 0.80},
            },
        },
    },
}
colors, err := texthue.Resolve("project:atlas", options)
if err != nil { panic(err) }
fmt.Println(colors.Light.Contrast, colors.Dark.Contrast)
```

| Field | Default | Rule |
| --- | --- | --- |
| `Namespace` | `""` | Valid UTF-8 string; changes the hash |
| `Backgrounds.Light` | `"#ffffff"` | Opaque six-digit `#RRGGBB` |
| `Backgrounds.Dark` | `"#121212"` | Opaque six-digit `#RRGGBB` |
| `ContrastTarget` | `4.5` | Finite float64 in 1–21 inclusive |
| `Profiles.Light.Fill.Lightness` | `{0.72, 0.82}` | Ordered range in 0–1 |
| `Profiles.Light.Text.Lightness` | `{0.45, 0.55}` | Ordered range in 0–1 |
| `Profiles.Dark.Fill.Lightness` | `{0.40, 0.50}` | Ordered range in 0–1 |
| `Profiles.Dark.Text.Lightness` | `{0.72, 0.82}` | Ordered range in 0–1 |
| Each role's `Chroma` | `{0.60, 0.80}` | Ordered range in 0–0.4 |

Nil nested fields retain defaults. A provided range replaces both endpoints. Equal endpoints fix a requested value; `&texthue.Range{0, 0}` chroma requests grayscale. Contrast can move lightness outside the requested range, and gamut fitting can reduce chroma. There are no other v1 tuning parameters.

```go
gray, err := texthue.Resolve("plain", &texthue.Options{
    Profiles: &texthue.Profiles{Light: &texthue.ThemeProfiles{Fill: &texthue.Profile{
        Lightness: &texthue.Range{0.75, 0.75}, ChromaScale: &texthue.Range{0, 0},
    }}},
})
if err != nil { panic(err) }
fmt.Println(gray.Light.Fill.OKLCH.C) // 0

impossible, err := texthue.Resolve("project:atlas", &texthue.Options{
    Backgrounds: &texthue.Backgrounds{Light: texthue.Ptr("#777777")},
    ContrastTarget: texthue.Ptr(7.0),
})
if err != nil { panic(err) }
status := impossible.Light.Contrast.Text
fmt.Println(status.MeetsTarget) // false
if status.Fallback != nil { fmt.Println(*status.Fallback) } // unattainable-contrast
```

`Contrast.Fill` compares fill to its chosen black/white `OnFill`. `Contrast.Text` compares text to the theme background. Each has `Ratio`, `MeetsTarget`, `LightnessAdjusted`, `ChromaReduced`, and `Fallback` (`nil` or a reason string). A valid but impossible text target returns the better black/white endpoint and reports failure, not an input error. Pair contrast alone does not establish accessibility of an entire interface.

## JSON, errors, and exact identity

Use `ParseOptions` when accepting the shared JSON format. It rejects null, unknown or incorrectly cased keys, malformed ranges, invalid Unicode escapes, trailing data, and wrong types. Ordinary `encoding/json.Unmarshal` into `Options` does not enforce all those rules, because it can ignore unknown keys and replace malformed Unicode. Native nil fields mean omission; an explicit JSON null is invalid.

```go
options, err := texthue.ParseOptions([]byte(`{"namespace":"projects","contrastTarget":4.5}`))
if err != nil { panic(err) }
colors, err := texthue.Resolve("project-id:42", options...)
if err != nil { panic(err) }
data, err := json.Marshal(colors) // Import encoding/json.
if err != nil { panic(err) }
fmt.Println(string(data))
```

```go
_, err := texthue.Resolve("research", &texthue.Options{ContrastTarget: texthue.Ptr(22.0)})
var invalid *texthue.Error
if errors.As(err, &invalid) { // Import errors.
    fmt.Println(invalid.Code) // INVALID_OPTIONS
}
```

`*Error` has `Code` (`INVALID_TEXT` or `INVALID_OPTIONS`) and `Message`. Go's signature excludes non-string text at compile time; runtime validation rejects invalid UTF-8 strings, non-finite numbers, invalid ranges, and malformed hex colors. Empty strings and NUL characters are valid. Text and namespace are neither trimmed nor normalized nor case-folded. If your application needs normalization, do it consistently before calling TextHue; the Go standard library does not provide general Unicode normalization. Stable non-secret IDs survive display-name changes. Namespace separates domains and is not a secret salt. Different inputs can have identical visible colors.

## Algorithm and versioning

The renderer hashes a seeded UTF-8 payload, interpolates between pinned hue anchors and samples gamut-relative chroma. Each theme returns ten roles. Contrast repair bisects a 1/4096 lightness grid and measures the final RGB bytes. See [the specification](SPECIFICATION.md) for tables, defaults and tie rules.

The [complete included specification](SPECIFICATION.md) defines the matrices, byte framing, precision, validation, tie breaks, and fallback rules. Go uses explicit float64 conversions to preserve specified arithmetic ordering where fused operations could change boundary rounding. Hex/RGB match the other implementations exactly; derived components allow one unit in the sixth decimal place. The algorithm identifier is part of the hashed payload and changes only when the color mapping changes. This library is not a cryptographic hash API, an anonymizer, or a guarantee of unique colors.

## Executable examples and tests

[example_test.go](example_test.go) contains complete, runnable examples for basic formats, every option, grayscale/fixed ranges, impossible contrast, errors, JSON parsing, and stable identity. Go runs these examples and checks their output with `go test ./...` inside this module. Use `go test -run Example -v` to run only examples. [resolve_test.go](resolve_test.go) verifies frozen fixtures, input rejection, concurrent determinism, and 25,920 default-profile samples. The included `testdata/vectors.json` lets the module's tests run independently of the monorepo.

To develop against a repository checkout from another module, add a `replace` directive pointing at the `packages/go` directory. From the repository root, `python tools/verify.py` also compares generated cases across Go, Python, and JavaScript.

[MIT license](LICENSE). Adapted color conversions also carry the [W3C notice](THIRD_PARTY_NOTICES.md).
