# TextHue

Turn exact text into repeatable colors for labels, projects, categories, charts, avatars, and other application data. The same text and options produce the same colors in JavaScript, TypeScript, Python, and Go. Every result includes light and dark themes, readable fill/foreground pairs, an accent color, and Hex, RGB, HSL, and OKLCH representations.

TextHue is stateless and has no runtime dependencies. It does not store inputs, contact a service, or require a user account. Each application decides what its input means.

## Libraries

| Platform | Package | Implementation and documentation |
| --- | --- | --- |
| JavaScript and TypeScript | `texthue` on npm | [TypeScript source, compiled ESM JavaScript and declarations](packages/npm/README.md) |
| Python | `texthue` on PyPI | [Typed Python package](packages/python/README.md) |
| Go | `github.com/HusteDev/texthue/packages/go` | [Native Go module](packages/go/README.md) |

JavaScript and TypeScript share one npm package. Python and Go have independent native implementations of the same specification.

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

const colors = await resolveTextColors('research');
console.log(colors.light.fill.hex); // #bf97fc
console.log(colors.dark.fill.hex);  // #5f3692
```

```python
from texthue import resolve_text_colors

colors = resolve_text_colors("research")
print(colors["light"]["fill"]["hex"])  # #bf97fc
print(colors["dark"]["fill"]["hex"])   # #5f3692
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
    fmt.Println(colors.Light.Fill.Hex) // #bf97fc
    fmt.Println(colors.Dark.Fill.Hex)  // #5f3692
}
```

## Result and color formats

Each theme contains `background`, `fill`, `onFill`, and `accent`. Use `fill` as a badge or surface background and `onFill` for its text. Use `accent` for text or marks directly on the returned `background`. These are different contrast pairs: an accent is not necessarily suitable on a fill. Both themes are returned; your application selects the active theme.

Every color has the same shape. For the default light fill for `research`:

```json
{
  "hex": "#bf97fc",
  "rgb": { "r": 191, "g": 151, "b": 252 },
  "hsl": { "h": 263.762376, "s": 94.392523, "l": 79.019608 },
  "oklch": { "l": 0.752216, "c": 0.146392, "h": 301.214339 }
}
```

RGB channels are integers from 0 through 255. HSL hue is in degrees and saturation/lightness are percentages. OKLCH lightness is a fraction from 0 through 1, chroma is numeric, and hue is in degrees. Hex is lowercase six-digit sRGB. HSL and OKLCH numbers are rounded to six decimal places and describe the final RGB color, not the originally requested OKLCH coordinates.

The top-level result also has `version` (the algorithm identifier) and `hue` (the original hash-derived hue). Each theme has `contrast.target`, `contrast.fill`, and `contrast.accent`. The latter two report `ratio`, `meetsTarget`, `lightnessAdjusted`, `chromaReduced`, and `fallback`. Check these when using custom backgrounds or high contrast targets. An unattainable accent target returns the better black/white endpoint with `meetsTarget: false` and `fallback: "unattainable-contrast"`; it does not claim success or throw an input error.

## Algorithm

The [full specification](SPECIFICATION.md) defines exact matrices, ordering, rounding, error handling, and portability rules. Each package includes a copy of it. The algorithm identifier is **`text-to-color-v1`**. It is part of the hashed payload and is independent of package versions: any change to the color mapping is released under a new identifier, so existing assignments never change silently.

1. **Validate exact text.** Accept well-formed Unicode, including empty strings and embedded NUL characters. Do not trim, change case, or normalize Unicode. Reject invalid text and malformed options rather than coercing them.
2. **Frame the input.** Encode the bytes `UTF8("text-to-color-v1")`, a NUL byte, the namespace byte length as an unsigned 32-bit big-endian integer, the UTF-8 namespace, and the UTF-8 text, in that order. The length prefix makes the namespace/text boundary unambiguous.
3. **Hash with SHA-256.** Read the first three unsigned 32-bit big-endian digest words and divide each by `4294967296`. They supply hue, lightness variation, and chroma variation. Hue is the first fraction times 360; interpolate the other fractions within each role's configured ranges. All roles share the hue and variation fractions.
4. **Start in OKLCH.** Generate a light-theme fill and accent plus a dark-theme fill and accent. OKLCH allows separate controls for perceived lightness, colorfulness, and hue.
5. **Fit to sRGB.** Convert through OKLab, LMS, XYZ, and linear sRGB using the pinned specification matrices. If out of gamut, reduce chroma with exactly 24 binary-search iterations, retaining lightness and hue. Gamma-encode, clamp, and round half up to RGB bytes.
6. **Choose the fill foreground.** Compare black and white against the canonical RGB fill and choose the higher contrast ratio; an exact tie chooses black. Accent contrast is measured against the configured theme background.
7. **Enforce the contrast target.** If the initial result fails, try lightness values `k / 1000` for `k = 0..1000`, each with the original requested chroma and hue, fitting each candidate again. Choose the passing candidate nearest to the original lightness; ties choose lower lightness. Readability can therefore move lightness outside the requested range. If the accent target is impossible, report the best endpoint and failure explicitly.
8. **Serialize one color consistently.** Treat the final RGB bytes as canonical. Derive Hex, HSL, and OKLCH from those bytes. Preserve full precision for contrast ratios and the original hue; round derived HSL/OKLCH components half up to six decimal places. Achromatic colors have zero hue and chroma.

The algorithm uses the WCAG relative-luminance contrast formula. Its checks cover the returned opaque sRGB color pairs. They do not assess font size, surrounding content, transparency, gradients, hover states, or the accessibility of a complete interface. Distinct inputs can collide or look similar; this is not a categorical palette optimizer or a security hash API. A color reveals very little hash information but is still deterministic, so do not treat it as anonymization. Prefer a stable, non-secret ID over a rotating access token.

## All tuning controls

Option paths below use the shared JSON names. TypeScript and Python use these directly; Go exposes native structs with matching JSON tags.

| Option | Default | Accepted values / purpose |
| --- | --- | --- |
| `namespace` | `""` | Exact Unicode string; separates domains such as `projects` and `people`; changes the hash |
| `backgrounds.light` | `"#ffffff"` | Opaque six-digit `#RRGGBB`; case-insensitive hex input |
| `backgrounds.dark` | `"#121212"` | Same format; used for dark accent contrast |
| `contrastTarget` | `4.5` | Finite number from 1 through 21, inclusive; applies to both contrast pairs in both themes |
| `profiles.<theme>.<role>.lightness` | See below | Ordered pair `[min, max]`, both from 0 through 1 |
| `profiles.<theme>.<role>.chroma` | `[0.10, 0.16]` | Ordered pair `[min, max]`, both from 0 through 0.4 |

| Theme and role | Default lightness | Default chroma |
| --- | --- | --- |
| `light.fill` | `[0.72, 0.82]` | `[0.10, 0.16]` |
| `light.accent` | `[0.45, 0.55]` | `[0.10, 0.16]` |
| `dark.fill` | `[0.40, 0.50]` | `[0.10, 0.16]` |
| `dark.accent` | `[0.72, 0.82]` | `[0.10, 0.16]` |

Omitted fields keep their defaults. A supplied range replaces the complete range. Equal endpoints fix a value; chroma `[0, 0]` requests grayscale. Lightness is a preference subject to contrast enforcement, and requested chroma may be reduced for the sRGB gamut. Namespace changes identity; profile and background changes preserve the hash-derived hue but can change final colors. There is no seed, random mode, alpha, hue override, implicit theme detection, or format-only parameter in v1. All formats and both themes are always returned.

Use exactly the same input, namespace, options, and algorithm version wherever colors must match. If your product treats composed/decomposed Unicode or differently cased names as equivalent, canonicalize them consistently before calling TextHue. The library deliberately leaves this policy to the caller.

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
