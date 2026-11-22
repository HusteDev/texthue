# TextHue

![Light and dark label colors, collection assignments, and tonal roles](docs/assets/gallery.svg)

```js
import { assignTextColors, resolveTextColors } from 'texthue';

const research = resolveTextColors('research');
const issues = assignTextColors(['bug', 'question', 'feature']);
console.log(research.light.fill.hex, issues.colors.bug.light.fill.hex);
```

Turn exact text into repeatable colors for labels, projects, categories, charts, avatars, and other application data. The same text and options produce the same colors in JavaScript, TypeScript, Python, and Go. Every result includes light and dark themes, readable fill/foreground pairs, a text color, and Hex, RGB, HSL, and OKLCH representations.

TextHue is stateless. The JavaScript and Python packages have no runtime dependencies. Go uses golang.org/x/text for Unicode normalization and casing. It does not store inputs, contact a service, or require a user account. Each application decides what its input means.

Choose a workflow in the [task guide](docs/GUIDE.md).

## Libraries

| Platform | Package | Implementation and documentation |
| --- | --- | --- |
| JavaScript and TypeScript | `texthue` on npm | [TypeScript source, compiled ESM JavaScript and declarations](packages/npm/README.md) |
| Python | `texthue` on PyPI | [Typed Python package](packages/python/README.md) |
| Go | `github.com/HusteDev/texthue/packages/go` | [Native Go module](packages/go/README.md) |

### Additional source ports

These ports support single-label resolution, ordered batches, collection assignment, and replay of pinned placements. Each guide describes its toolchain and how to run the port from a checkout.

| Platform | Select Display-P3 | Assign a collection with previous placements | Guide |
| --- | --- | --- | --- |
| Rust | `Renderer { gamut: Gamut::DisplayP3, ..Renderer::default() }` | `compiled.assign(labels, &previous.assignments)` | [Rust](packages/rust/README.md) |
| C# / .NET | `new Renderer(gamut: Gamut.DisplayP3)` | `renderer.Assign(labels, previous.Assignments)` | [.NET](packages/csharp/README.md) |
| Kotlin | `Resolver(gamut = Gamut.DISPLAY_P3)` | `resolver.assign(labels, pinned = previous.assignments)` | [Kotlin and Android](packages/kotlin/README.md) |
| Swift | `options.gamut = .displayP3` | `try renderer.assign(labels, pinned: previous.assignments)` | [SwiftPM](packages/swift/README.md) |
| Dart | `Renderer(gamut: Gamut.displayP3)` | `renderer.assign(labels, pinned: previous.assignments)` | [Dart](packages/dart/README.md) |

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

## Quick examples

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

## Result and color formats

Each theme contains `background`, `fill`, `onFill`, and `text`. Use `fill` as a badge or surface background and `onFill` for its text. Use `text` for text or marks directly on the returned `background`. These are different contrast pairs: an text is not necessarily suitable on a fill. Both themes are returned; your application selects the active theme.

Every color has the same shape. For the default light fill for `research`:

```json
{
  "hex": "#59b8d8",
  "rgb": { "r": 191, "g": 151, "b": 252 },
  "hsl": { "h": 195.11811, "s": 61.95122, "l": 59.803922 },
  "oklch": { "l": 0.737459, "c": 0.100435, "h": 222.843011 }
}
```

RGB channels are integers from 0 through 255. HSL hue is in degrees and saturation/lightness are percentages. OKLCH lightness is a fraction from 0 through 1, chroma is numeric, and hue is in degrees. Hex is lowercase six-digit sRGB. HSL and OKLCH numbers are rounded to six decimal places and describe the final RGB color, not the originally requested OKLCH coordinates.

The top-level result also has `version` (the algorithm identifier) and `hue` (the original hash-derived hue). Each theme has `contrast.target`, `contrast.fill`, and `contrast.text`. The latter two report `ratio`, `meetsTarget`, `lightnessAdjusted`, `chromaReduced`, and `fallback`. Check these when using custom backgrounds or high contrast targets. An unattainable text target returns the better black/white endpoint with `meetsTarget: false` and `fallback: "unattainable-contrast"`; it does not claim success or throw an input error.

## Assigning a collection

Use a configured resolver when the labels appear together. Assignment sorts normalized labels by digest, checks spacing around the hue circle, and uses additional lightness rings when the first ring fills. Persist the returned assignments to extend the collection later.

```typescript
const resolver = createResolver({ normalize: { unicode: 'NFC' }, namespace: 'issues' });
const first = resolver.assign(['bug', 'question', 'feature']);
const next = resolver.assign(['feature', 'question', 'bug', 'docs'], { pinned: first.assignments });
console.log(next.colors.docs.light.fill.hex, next.report.minDistance);
```

Python provides `Resolver.assign(texts, pinned=...)`. Go provides `NewResolver(WithNamespace("issues"))` and `resolver.Assign(texts, pinned)`. The report measures distance between rendered light fills in OKLab. Ring capacity describes the search space. Consumers can inspect the closest pair before relying on color to distinguish labels.

## Brand colors and foregrounds

A configured resolver can export its expanded settings for replay in another
language. JavaScript uses `resolver.exportConfig()` and `importConfig(value)`.
Python uses `resolver.export_config()` and `import_config(value)`. Both return a
JSON-compatible object on export. Go uses `resolver.ExportConfig()` and
`texthue.ImportConfig(data)` with JSON bytes and an error return. Imports check
the schema, algorithm identifier, and SHA-256 fingerprint of the expanded
settings. The fingerprint detects accidental changes. A caller able to edit the
settings can also calculate a replacement fingerprint.

To persist collection placements, export the assignment map with
`resolver.exportRegistry(assignments)`, `resolver.export_registry(assignments)`,
or Go's `resolver.ExportRegistry(assignments)`. Store the returned value alongside
the configuration snapshot. On restart, restore the resolver, call its matching
registry import method, and pass the returned pins to the next assignment call.
A registry from a different configuration is rejected. Previously pinned labels
retain their placements even when absent from the new batch.

Select APCA with `contrastModel: 'apca'`, Python's `contrast_model="apca"`, or
Go's `WithContrastModel("apca")`. The default target in this mode is 60 Lc.
Targets from 0 through 106 apply to the magnitude of signed Lc. Each APCA
relationship reports its signed `value` and whether it meets its target.
Positive Lc indicates darker foreground text. The separate `ratio` field
records the luminance contrast ratio in the selected gamut. With sRGB this is the WCAG 2 ratio. A text color can pass on the
theme background and fail on the subtle surface, so check both relationships.

Select Display-P3 with JavaScript’s `createResolver({gamut: 'display-p3'})`,
Python’s `Resolver(gamut="display-p3")`, or Go’s `NewResolver(WithGamut("display-p3"))`. Use the returned `css` string for that rendition and `hex` for the
sRGB fallback. A true `srgbClipped` flag means at least one fallback channel
reached the sRGB boundary through clipping. Contrast is measured on the
Display-P3 rendition using its luminance coefficients. A fallback used in an
sRGB interface needs a separate contrast check. Supplied sRGB brand colors and
backgrounds are converted to P3 before measuring their relationships.

The CSS helper accepts `p3` in JavaScript, Python, and Go. For a native P3 rendition it returns its native CSS string. For an sRGB rendition it converts the color to Display-P3 coordinates and emits a CSS string with up
to six fractional digits per channel. For example, sRGB red serializes as
`color(display-p3 0.917488 0.200287 0.138561)`.

For a translucent surface over a known opaque backdrop, use
`compositeOver(source, alpha, backdrop)` in JavaScript,
`composite_over(source, alpha, backdrop)` in Python, or `CompositeOver` in Go.
Both inputs are TextHue colors. Alpha ranges from zero to one. The helper blends
in linear sRGB and rounds once to opaque sRGB bytes. Half-opacity white over
black produces `#bcbcbc`. Use the result as a theme background to check contrast
against that composite. Go accepts two resulting colors via `WithColorBackgrounds`.

Preview a migration before saving the new registry. In JavaScript, use
`compareAssignments({resolver: old, registry}, {resolver: next}, labels)`.
Python exposes `compare_assignments` with dictionaries for the two sides. Go
accepts two `MigrationSide` values and the label slice. Each side applies its
own normalization and optional pins. The report lists changed placements,
per-role rendered hex changes with Euclidean OKLab distance, contrast ratio
and pass/fail changes, and exact fill collisions in both themes. Collision
groups contain distinct normalized identities. The preview leaves caller-owned
registries untouched.

Use `overrides` to pin a label to a hex fill for both themes, or supply distinct light and dark fills. A palette entry has a stable `id` and at least one theme color. A single supplied theme color applies to both. The resolver prefers palette entries meeting the fill target in both themes, then ranks them by the SHA-256 digest of the identity digest followed by the UTF-8 entry ID. Reordering entries preserves assignments.

```typescript
const resolver = createResolver({
  overrides: { blocked: { light: '#981b32', dark: '#ee9aab' } },
  palette: [{ id: 'ocean', light: '#267394' }, { id: 'sage', light: '#658b70' }],
  foregrounds: ['#181818', '#ffffff'],
  foregroundPolicy: 'first-passing',
});
const colors = resolver.resolve('blocked');
console.log(colors.source, colors.light.fill.hex, colors.light.contrast.fill);
```

The default foreground policy chooses the highest contrast, with list order breaking ties. First-passing chooses the first candidate meeting the target and otherwise uses the highest contrast. A fixed fill that misses its target keeps its supplied bytes and reports `palette-constraint`.

Hex helpers return the selected fallback by default. To require a passing result, use
`resolver.hex(id, {theme: 'light', role: 'text', strict: true})` in JavaScript,
`resolver.hex(id, theme="light", role="text", strict=True)` in Python, or
`resolver.HexStrict(id, "light", "text")` in Go. Each reports `UNMET_CONSTRAINT`
if the selected role misses its target. Text must pass against both background
and subtle. Fill and on-fill share the fill pair. Hover, active, border, and
strong each use their own pair. Background, subtle, and muted have no independent
target when requested as surfaces.


## Algorithm

The [full specification](SPECIFICATION.md) defines exact matrices, ordering, rounding, error handling, and portability rules. Each package includes a copy of it. The algorithm identifier is **`text-to-color-v1`**. It is part of the hashed payload and is independent of package versions: any change to the color mapping is released under a new identifier, so existing assignments never change silently.

1. **Validate exact text.** Accept well-formed Unicode, including empty strings and embedded NUL characters. Do not trim, change case, or normalize Unicode. Reject invalid text and malformed options rather than coercing them.
2. **Frame the input.** Concatenate the algorithm identifier, NUL, seed and namespace byte length (both unsigned 32-bit big-endian), UTF-8 namespace and UTF-8 text.
3. **Sample the palette.** Three SHA-256 words select hue, lightness and chroma. Interpolate between pinned hue anchors. Apply the profile's hue-dependent lightness correction.
4. **Build the tonal scale.** Each theme includes background, subtle, muted, fill, onFill, fillHover, fillActive, border, text and strong. Chroma scales with the available sRGB gamut at each tone's hue and lightness.
5. **Check final RGB bytes.** Choose the better black or white foreground for fill. Evaluate both interaction states against this foreground, border and strong against background, and text against both background and subtle.
6. **Repair contrast.** Bisect the 1/4096 lightness grid from the passing endpoints. Choose the closer passing result, breaking exact ties toward lower lightness. Inspect each relationship's contrast metadata when applying custom targets.
7. **Serialize one color consistently.** Treat the final RGB bytes as canonical. Derive Hex, HSL, and OKLCH from those bytes. Preserve full precision for contrast ratios and the original hue; round derived HSL/OKLCH components half up to six decimal places. Achromatic colors have zero hue and chroma.

The algorithm uses the WCAG relative-luminance contrast formula. Its checks cover the returned opaque sRGB color pairs. They do not assess font size, surrounding content, transparency, gradients, hover states, or the accessibility of a complete interface. Distinct inputs can collide or look similar; this is not a categorical palette optimizer or a security hash API. A color reveals very little hash information but is still deterministic, so do not treat it as anonymization. Prefer a stable, non-secret ID over a rotating access token.

## All tuning controls

Option paths below use the shared JSON names. TypeScript and Python use these directly; Go exposes native structs with matching JSON tags.

| Option | Default | Accepted values / purpose |
| --- | --- | --- |
| `namespace` | `""` | Exact Unicode string; separates domains such as `projects` and `people`; changes the hash |
| `backgrounds.light` | `"#ffffff"` | Opaque six-digit `#RRGGBB`; case-insensitive hex input |
| `backgrounds.dark` | `"#121212"` | Same format; used for dark text contrast |
| `contrastTarget` | `4.5` | WCAG ratio 1–21 or APCA magnitude 0–106. The controls preset defaults to 7 under WCAG. APCA defaults to 60 |
| `profiles.<theme>.<role>.lightness` | See below | Ordered pair `[min, max]`, both from 0 through 1 |
| `profiles.<theme>.<role>.chromaScale` | [0.60, 0.80] | Ordered fractions of available chroma from 0 through 1 |
| `profiles.<theme>.<role>.chromaCap` | 0.16 fill, 0.19 text | Maximum requested chroma from 0 through 0.4 |
| `seed` | 0 | Unsigned 32-bit integer |
| `contrastTargets` | Global target, WCAG border capped at 3 | Override individual role relationships in the selected model’s units |
| `preset` | `labels` | Role defaults for `labels`, `controls`, `chart`, `subdued`, or `mono` |
| `gamut` | `srgb` | Select `display-p3` for native P3 output with an sRGB fallback |
| `contrastModel` | `wcag2` | Select `apca` for polarity-aware contrast measurements |
| `normalize` | Exact identity | Configure Unicode form (`none`, `NFC`, `NFKC`), case (`none`, `lower`), and whitespace (`none`, `trim`, `collapse`) |
| `hueRange`, `excludeHues` | Full circle, no exclusions | Set the hue interval and exclude arcs before placing generated colors |
| `palette` | No supplied palette | Supply stable IDs and theme fills for brand assignments |
| `overrides` | Empty mapping | Pin a label to one hex fill or a light/dark pair |
| `foregrounds`, `foregroundPolicy` | Black and white, `best` | Supply foreground candidates and choose `best` or `first-passing` |

| Theme and role | Default lightness | Default chroma |
| --- | --- | --- |
| `light.fill` | `[0.72, 0.82]` | `[0.60, 0.80]` |
| `light.text` | `[0.43, 0.53]` | `[0.60, 0.80]` |
| `dark.fill` | `[0.40, 0.50]` | `[0.60, 0.80]` |
| `dark.text` | `[0.72, 0.82]` | `[0.60, 0.80]` |

Omitted fields inherit their preset defaults. Equal range endpoints fix a value. A chroma scale of `[0, 0]` requests grayscale. Contrast repair can adjust lightness, and gamut fitting can reduce chroma.

Use the same identity policy, seed, namespace, options, and algorithm version wherever colors must match. For a single JavaScript value, `createResolver(options).hex(label, {theme:'dark', role:'fill'})` computes the selected role. Use `resolver.project` to select multiple themes, roles, and formats.

## Repository and development

```text
packages/npm/       TypeScript implementation, ESM output, declarations, examples
packages/python/    Python implementation, typing marker, executable examples
packages/go/        Go module, executable examples, bundled conformance test data
conformance/        Frozen language-neutral valid and invalid vectors
tests/              JavaScript and cross-language Python tests
tools/              Verification, package builds, lint runners, shared-file synchronization
docs/               Maintainer release procedure
SPECIFICATION.md    Canonical algorithm specification
```

Development requires Node.js 22+, Python 3.11+, and Go 1.23+. From this directory:

```powershell
npm ci
python -m venv .venv
.venv\Scripts\python -m pip install -r requirements-dev.txt
.venv\Scripts\python tools/verify.py
.venv\Scripts\python tools/build-packages.py
```

On macOS/Linux use `.venv/bin/python` instead. Verification compiles the npm package, checks TypeScript examples, runs all language tests and examples, compares the three implementations on generated cases, lints every language, validates documentation links and shared files, and checks the frozen vectors. The package build produces an npm tarball, a Python wheel and source distribution, and installs each into an isolated consumer. Build outputs go to the ignored `artifacts/` directory.

Linting uses Ruff and Black for Python, Biome for JavaScript and TypeScript, gofmt, go vet, and golangci-lint for Go, and zizmor for the GitHub Actions workflows. Run `pre-commit install` once to apply all of them as a Git pre-commit hook; `npm run lint`, `npm run lint:python`, and `npm run lint:go` run each set directly, and `npm run coverage`, `npm run coverage:python`, and `npm run coverage:go` write coverage reports to `coverage/`. Continuous integration runs the lint hooks, the full verification on Windows, Linux, and macOS, coverage upload to Codecov, and dependency review on pull requests. A separate security workflow runs CodeQL analysis for all three languages and the workflow files, audits the workflows with zizmor, and publishes an OpenSSF Scorecard.

The specification and notices are shared files: edit the root copies and run `python tools/sync-shared.py` to refresh the copies distributed with each package. The conformance vectors are frozen and protected by a digest check; a change to v1 output is a new algorithm version, not a fixture update. See the [release procedure](docs/RELEASING.md) for versioning and publication steps.

## Sources and licensing

The project code is covered by [MIT](LICENSE); adapted W3C conversion code is covered by the [included W3C notice](THIRD_PARTY_NOTICES.md). Package metadata expresses both licenses. The [CSS Color 4 conversion algorithms](https://www.w3.org/TR/2026/CRD-css-color-4-20260901/#color-conversion-code) and [WCAG relative luminance definition](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html) explain the underlying color and contrast calculations. The versioned local specification defines the implementation contract.
