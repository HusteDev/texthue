# TextHue algorithm: text-to-color-v1

Algorithm identifier: `text-to-color-v1`.

This specification maps exact text to deterministic sRGB colors for any application domain. It defines light-theme and dark-theme fill/foreground pairs and texts. It does not allocate unique colors or inspect the meaning of the input.

## 1. Interface

Language-neutral operation:

```text
resolveTextColors(text, options = {}) -> ColorSet
```

The TypeScript/npm library uses this name and returns ColorSet synchronously. Python uses `resolve_text_colors` and returns directly. Go uses `Resolve(text string, options ...Option) (ColorSet, error)`. Language-specific naming and synchronous/asynchronous execution do not alter the mapping. Each library's README documents native types, examples, and installation.

Package versions are independent of the `text-to-color-v1` identifier. The identifier is part of the hashed payload, so it is fixed for as long as this mapping is in use.

### Input text

`text` and `options.namespace` are sequences of Unicode scalar values. Empty strings, embedded U+0000, whitespace, combining marks, noncharacters, and supplementary characters are accepted. Encode as UTF-8 without a BOM; an actual U+FEFF character supplied by the caller is preserved. By default the identity preserves every scalar. When callers enable normalization, transform both namespace and label independently before encoding:

1. Apply the requested Unicode form (NFC or NFKC).
2. Apply default Unicode lowercase mapping when requested. This preserves the distinction between lowercase mapping and full case folding.
3. For trim or collapse, remove leading and trailing Unicode White_Space characters. For collapse, replace each remaining White_Space run with one U+0020. U+FEFF is outside White_Space.

Each step defaults to `none`. For example, with NFKC, lower and collapse enabled, `"  Ａ   B "` and `"a b"` share one identity. Apply the same rules to override and pinned keys. Runtimes use their Unicode data versions. Newly assigned characters can yield different results on older runtimes. See [Unicode normalization stability](https://www.unicode.org/reports/tr15/#Versioning).

Reject malformed text, including unpaired UTF-16 surrogates. A valid UTF-16 surrogate pair represents one supplementary scalar and must encode accordingly. A Python string containing surrogate code points is malformed.

### Options

Options are JSON-style records with these keys. Omission selects a default; explicit null is invalid. Unknown keys are invalid at every level. Numbers must be finite binary64 values, not strings or booleans. Ranges are two-element numeric arrays; an override replaces the complete array. Inputs are not modified.

| Key | Default | Allowed values |
|---|---|---|
| `normalize.unicode` | `none` | `none`, `NFC`, `NFKC` |
| `normalize.case` | `none` | `none`, `lower` |
| `normalize.whitespace` | `none` | `none`, `trim`, `collapse` |
| `namespace` | `""` | Exact text; UTF-8 byte length at most `2^32 - 1` |
| `backgrounds.light` | `"#ffffff"` | Opaque six-digit Hex, case-insensitive |
| `backgrounds.dark` | `"#121212"` | Opaque six-digit Hex, case-insensitive |
| `gamut` | `srgb` | `srgb` or `display-p3` |
| `contrastModel` | `wcag2` | `wcag2` or `apca` |
| `contrastTarget` | WCAG 4.5 (7 for controls), APCA 60 | Inclusive range 1–21 for WCAG or 0–106 for APCA |
| `profiles.light.fill.lightness` | `[0.72, 0.82]` | `0 <= min <= max <= 1` |
| `profiles.dark.fill.lightness` | `[0.40, 0.50]` | `0 <= min <= max <= 1` |
| `profiles.light.text.lightness` | `[0.43, 0.53]` | `0 <= min <= max <= 1` |
| `profiles.dark.text.lightness` | `[0.72, 0.82]` | `0 <= min <= max <= 1` |
| Each profile's `chromaScale` | [0.6,0.8] | ordered range in [0,1] |
| Each profile's `chromaCap` | fill 0.16, text 0.19 | [0,0.4] |
| `seed` | 0 | uint32 |
| `preset` | `labels` | `labels`, `controls`, `chart`, `subdued`, `mono` |
| `hueRange` | `[0,360]` | Two endpoints in [0,360]. A descending pair crosses zero. |
| `excludeHues` | `[]` | Up to 16 intervals with the same endpoint rules. At least one allowed hue must remain. |
| `palette` | absent | Nonempty list of entries with a unique Unicode `id` and at least one opaque hex `light` or `dark` color. An omitted theme inherits the other. |
| `paletteMode` | `fixed` | `fixed` or `anchors` |
| `overrides` | `{}` | Map from labels to one opaque hex color or a record with both `light` and `dark`. Reject duplicate normalized identities. |
| `foregrounds` | `["#000000","#ffffff"]` | Nonempty ordered list of opaque hex colors |
| `foregroundPolicy` | `best` | `best` or `first-passing` |
| `contrastTargets` | contrastTarget, except WCAG border min(3, contrastTarget) | fill, fillHover, fillActive, border, text, textOnSubtle, strong (each uses the selected model's range) |

The chroma bound of 0.4 is this API's input limit, not a universal limit on OKLCH. The theme names identify output slots; a supplied background is always used as supplied, even if its brightness differs from its theme name. Background parsing does not accept shorthand, alpha, named colors, or other CSS expressions.

Profile ranges specify starting preferences. Gamut fitting may reduce chroma below its minimum. Contrast adjustment may move lightness outside its range. Only missing fields inherit defaults; supplied invalid fields never silently fall back.

A strict role lookup raises `UNMET_CONSTRAINT` if a required relationship for that role misses its target. Full resolution returns the relationship measurements and fallback metadata.

Invalid text yields error code `INVALID_TEXT`. Invalid options, including an invalid namespace, yield `INVALID_OPTIONS`. Error messages and exception classes are language-specific; error codes are stable. Resource exhaustion and unavailable cryptographic runtimes are execution errors, not color fallbacks.

Go's typed interface uses nil optional pointers to represent omission and a nil `*Options` for all defaults; the function's string parameter excludes non-string text at compile time. `ParseOptions` accepts the JSON contract above and rejects explicit null, unknown fields, malformed Unicode, and invalid ranges. It avoids Go's standard JSON decoder's permissive replacement of malformed Unicode. Go results use exported field names with JSON tags matching this specification.

### Result

```text
ColorSet = {
  version: "text-to-color-v1",
  hueFraction: number,
  hue: number,
  light: ThemeColors,
  dark: ThemeColors
}

ThemeColors = {
  background: Color, subtle: Color, muted: Color, fillHover: Color, fillActive: Color, border: Color, strong: Color,
  fill: Color,
  onFill: Color,
  text: Color,
  contrast: {
    target: number,
    fillHover: ContrastResult, fillActive: ContrastResult, border: ContrastResult, strong: ContrastResult, textOnSubtle: ContrastResult,
    fill: ContrastResult,
    text: ContrastResult
  }
}

Color = {
  hex: "#rrggbb",
  rgb: { r: integer, g: integer, b: integer },
  hsl: { h: number, s: number, l: number },
  oklch: { l: number, c: number, h: number },
  p3?: { r: number, g: number, b: number },
  css?: string,
  srgbClipped?: boolean
}

ContrastResult = {
  ratio: number,
  model?: "apca",
  value?: number,
  meetsTarget: boolean,
  lightnessAdjusted: boolean,
  chromaCapped: boolean,
  chromaReduced: boolean,
  fallback: null | "unattainable-contrast" | "palette-constraint"
}
```

The result excludes input text, namespace, and digest. `hue` is the sampled OKLCH identity hue before conversion, with no decimal rounding. All colors are opaque. The default rendition uses sRGB. In Display-P3 mode, `p3` gives encoded Display-P3 channels in [0, 1] rounded to six decimals, and `css` serializes them as `color(display-p3 r g b)`. Hex, RGB and HSL describe the sRGB fallback. OKLCH describes the canonical rendition. RGB channels are integers in 0–255. HSL hue uses degrees and saturation/lightness use percentages. OKLCH lightness uses 0–1, chroma is a number, and hue uses degrees.

Fill, hover and active measure onFill against the respective surface. Border, text and strong measure against the theme background. textOnSubtle measures text against subtle. Each relationship reports a luminance ratio in the selected gamut. The Display-P3 ratio uses P3 luminance coefficients. WCAG mode compares the unrounded ratio to the relationship target. APCA mode also returns signed Lc in `value`, positive for dark text on a lighter surface. It compares absolute Lc to the target. `chromaReduced` compares the final retained pre-quantization chroma with the requested chroma; it does not compare rounded output OKLCH values. `lightnessAdjusted` compares the selected pre-quantization lightness with the original sampled lightness.

## 2. Text to sampling fractions

1. Validate text and copy validated option values before any asynchronous boundary.
2. Apply the configured identity transformations to namespace and text independently, then encode each result as UTF-8. Measure the namespace byte length after transformation.
3. Assemble the following bytes in exactly this order:

```text
UTF8("text-to-color-v1")
one zero byte
seed as uint32 big-endian
namespace UTF-8 byte length as four unsigned big-endian bytes
namespace UTF-8 bytes
text UTF-8 bytes
```

The length describes bytes, not characters. The input occupies the remainder, so no delimiter or second length is necessary. Namespace changes cannot ambiguously shift the boundary into the text, even when either contains zero bytes. Do not include a JSON representation, BOM, terminator after the input, options, or locale data in this payload.

4. Compute SHA-256 as defined by [FIPS 180-4](https://csrc.nist.gov/pubs/fips/180-4/upd1/final).
5. Interpret digest bytes `[0,4)`, `[4,8)`, and `[8,12)` as unsigned big-endian 32-bit integers. Do not parse a platform-native signed hash.
6. Divide each integer by exactly `4294967296`, producing `uH`, `uL`, and `uC` in `[0,1)`.

### Hue and tone sampling

The pinned bias rows correspond to light fill, light text, dark fill and dark text.

```text
anchors = [10, 48.3199, 78.2602, 111.4561, 134.6058, 154.0668, 181.1972, 220.7925, 257.1497, 299.695, 322.6721, 340.0645, 370];
biases = [
  [0.0124, 0.0098, 0.0073, 0.0003, -0.0077, -0.016, -0.0121, -0.0091, -0.0038, 0.0021, 0.008, 0.0174],
  [0.0185, 0.016, 0.0053, 0.0002, -0.0048, -0.01, -0.0076, -0.0057, -0.0028, 0.0128, 0.0215, 0.0206],
  [0.0173, 0.015, 0.005, 0.0002, -0.0045, -0.0094, -0.0071, -0.0053, -0.0026, 0.0098, 0.0177, 0.0193],
  [0.0124, 0.0098, 0.0073, 0.0003, -0.0077, -0.016, -0.0121, -0.0091, -0.0038, 0.0021, 0.008, 0.0174],
];

x = 12*uH
k = floor(x)
h = (anchors[k] + (anchors[k+1]-anchors[k])*(x-k)) modulo 360
j = floor(h/30)
bias = row[j] + (row[(j+1) modulo 12]-row[j])*(h/30-j)
l = clamp((lMin + (lMax-lMin)*uL) + bias, 0, 1)
scale = sMin + (sMax-sMin)*uC
```

For each clamped tone lightness and hue, find the gamut boundary by 20 bisections on [0,0.4] using the linear sRGB inclusion test. Use the passing lower bound. At lightness 0 or 1 use zero. Multiply by scale and cap the product at chromaCap. Set chromaCapped when the product exceeds the cap. Fit this requested chroma for each contrast candidate.

Let d be -1 for light and +1 for dark. Round the background's six-decimal OKLCH lightness to the nearest multiple of 1/4096, half up, giving Lb. Use the fill profile for subtle (Lb+0.04d), muted (Lb+0.10d), fill (Lf), fillHover (Lf+0.025d), fillActive (Lf+0.05d), and border (Lb+0.39d). Use the text profile for text (Lt) and strong (Lt+0.10d). Clamp all starting lightnesses. Subtle and muted have no contrast constraint. Fill selects onFill. Hover and active use that fixed foreground. Measure border and strong against background. Measure text against both background and subtle. Score text by the minimum of its background ratio and its subtle ratio multiplied by (text target / textOnSubtle target). Report each measured ratio individually.

## 3. Numerical conversion and gamut fitting

Use binary64 arithmetic, rounding to nearest with ties to even for intermediate operations. Use the explicit half-up rules below only for published decimal fields and RGB quantization. Do not use fused multiply-add, reassociate matrix products, collapse matrices, or switch the reference white. Use `pi = 3.141592653589793`, with angle computed as `(h * pi) / 180`.

The conversion equations are pinned to [CSS Color 4, 1 September 2026](https://www.w3.org/TR/2026/CRD-css-color-4-20260901/#color-conversion-code). Appendix A fixes the matrix values. Treat this source as a dated mathematical reference; browser gamut-mapping behavior is not part of this algorithm.

For matrix multiplication, evaluate each row as `(m0*v0 + m1*v1) + m2*v2`. To cube a channel, evaluate `(x*x)*x`.

```text
OKLCH -> OKLab: [l, c*cos(angle), c*sin(angle)]
OKLab -> nonlinear LMS: M1 * OKLab
nonlinear LMS -> LMS: cube each channel
LMS -> XYZ: M2 * LMS
XYZ -> linear sRGB: M3 * XYZ
```

An RGB triple is inside the gamut if every linear channel lies in `[-1e-12, 1 + 1e-12]`. To fit a candidate:

```text
if l == 0: return RGB [0, 0, 0], retainedChroma 0
if l == 1: return RGB [255, 255, 255], retainedChroma 0

retainedChroma = c
if convert(l, c, h) is outside the gamut:
    low = 0
    high = c
    repeat exactly 24 times:
        mid = (low + high) / 2
        if convert(l, mid, h) is inside: low = mid
        otherwise: high = mid
    retainedChroma = low

linear = convert(l, retainedChroma, h)
clamp each linear channel to [0,1] to remove boundary residue
encode each channel using the sRGB transfer function
quantize each encoded channel using floor(channel * 255 + 0.5)
```

This is fixed-hue, fixed-lightness chroma reduction, not CSS Local MINDE gamut mapping. A reference implementation may skip evaluating a candidate known not to win the later lightness search, but it must produce the same selected color and metadata.

Transfer functions, for nonnegative in-gamut channels:

```text
encode(x) = 12.92*x                           if x <= 0.0031308
            1.055*x^(1/2.4) - 0.055          otherwise

decode(x) = x/12.92                          if x <= 0.04045
            ((x + 0.055)/1.055)^2.4          otherwise
```

Quantized eight-bit RGB is the authoritative color. All contrast calculations and output formats use it, rather than the originally requested OKLCH values.

### Display-P3 conversion

Display-P3 uses the same transfer functions as sRGB. For P3 gamut fitting, replace the XYZ-to-linear-sRGB transform with the XYZ-to-linear-P3 matrix below. For P3 output to XYZ, decode the encoded channels before using the inverse matrix.

```text
XYZ D65 to linear Display-P3
[ 446124/178915, -333277/357830, -72051/178915 ]
[ -14852/17905,     63121/35810,     423/17905 ]
[  11844/330415,  -50337/660830, 316169/330415 ]

Linear Display-P3 to XYZ D65
[ 608311/1250200, 189793/714400,  198249/1000160 ]
[   35783/156275, 247089/357200,  198249/2500400 ]
[              0,  32229/714400, 5220557/5000800 ]
```

To produce the sRGB fallback, transform the decoded P3 rendition through XYZ D65 into linear sRGB. Set `srgbClipped` if any channel is below -1e-12 or above 1 + 1e-12. Clamp each channel to [0, 1], encode and round to the nearest byte (half up). Evaluate P3 contrast before fallback clipping.

## 4. Contrast and lightness adjustment

For an eight-bit RGB triple, divide each channel by 255, apply `decode`, and calculate relative luminance as `(0.2126*r + 0.7152*g) + 0.0722*b`. For luminances A and B:

```text
ratio = (max(A, B) + 0.05) / (min(A, B) + 0.05)
```

This is the [WCAG contrast calculation](https://www.w3.org/WAI/WCAG22/Techniques/general/G18.html). The default 4.5 target is appropriate for normal text in the declared foreground/background pair. It does not certify a complete interface or promise distinctions between generated colors.

### Signed APCA contrast

Use the APCA-W3 0.1.9 constants below. For each foreground and background, normalize encoded channels to the range 0–1. Raise each channel to the power 2.4, multiply by its corresponding weight, and sum in RGB order, grouping the first two products together.

| Rendition | Red | Green | Blue |
| --- | ---: | ---: | ---: |
| sRGB | 0.2126729 | 0.7151522 | 0.0721750 |
| Display-P3 | 0.2289829594805780 | 0.6917492625852380 | 0.0792677779341829 |

For each resulting luminance `Y < 0.022`, replace it with `Y + (0.022 - Y)^1.414`. Let `F` and `B` be these adjusted foreground and background luminances. Compute signed Lc at full precision.

```text
if abs(B - F) < 0.0005: return 0
if B > F: raw = 1.14 * (B^0.56 - F^0.57)
else:     raw = 1.14 * (B^0.65 - F^0.62)
if abs(raw) < 0.1: return 0
if B > F: return 100 * (raw - 0.027)
return 100 * (raw + 0.027)
```

### Lightness search

For a fill, select the black or white foreground with greater contrast. An exact tie selects black. Measure the fill against that foreground. For text, score both the background and subtle relationships as described in the tonal scale.

```text
initial = fit(originalLightness, requestedChroma, identityHue)
if measured ratio >= target: return initial

if both black and white fail the tone's relationship score:
    select the endpoint with the higher score, choosing black on a tie
    return it with meetsTarget=false and fallback="unattainable-contrast"

for endpoint in [0, 4096]:
    pass = endpoint
    fail = ceil(originalLightness*4096) for black, floor(originalLightness*4096) for white
    skip this side if its endpoint fails
    while abs(pass-fail) > 1:
        mid = floor((pass+fail)/2)
        evaluate fit(mid/4096, requestedChroma, identityHue)
        move pass to mid on success, else move fail to mid
    retain evaluated passing candidate
choose the retained candidate closest to originalLightness, ties lower
recheck the score of its retained RGB bytes
if the recheck fails:
    move one grid point at a time toward that candidate's original endpoint
    fit and score each point, stopping at the first passing candidate
    stop at the endpoint or after 64 steps and report an invariant failure if none passes
```

When `excludeHues` is configured, check each generated chromatic candidate after quantization in the selected gamut. Reject the candidate if its reported OKLCH hue falls within an excluded arc, including the start and excluding the end. An arc crossing zero covers both sides of the wrap. Equal RGB channels represent a neutral and have no hue constraint. Supplied backgrounds, approved fills and foreground candidates retain their supplied colors.

Recompute the black/white foreground for every fill candidate. Chroma fitting runs at the new lightness; do not reuse an earlier reduced chroma. No further chroma or hue search is performed.

The full sampled initial lightness is checked before searching the 1/4096 grid. This rule defines a deterministic nearby adjustment; it does not claim a continuous mathematical optimum. Compare distances and contrast at computational precision without epsilon or display rounding. An exact threshold passes.

The initially sampled hue remains in the top-level result even when fitting/quantization slightly changes the returned color hue or a black/white fallback removes visible hue entirely.

## 5. Output formats

Hex is exactly six lowercase hexadecimal digits prefixed by `#`. RGB is the same three integer channels. No alpha fields are returned.

For HSL, normalize authoritative RGB to `[0,1]`. Let `max`, `min`, `d = max-min`, and `light = (max+min)/2`. If `d == 0`, hue and saturation are zero. Otherwise:

```text
saturation = (max-light) / min(light, 1-light)

if max == red:   hue = (green-blue)/d + (6 if green < blue else 0)
else if max == green: hue = (blue-red)/d + 2
else:           hue = (red-green)/d + 4
hue = hue * 60
```

Evaluate the red branch first, then green, then blue when maximum values tie. Output saturation and lightness multiplied by 100.

For OKLCH, decode the normalized authoritative RGB and use Appendix A:

```text
XYZ = M4 * linearRGB
LMS = M5 * XYZ
OKLab = M6 * cbrt(LMS)          // real sign-preserving cube root, channel by channel
OKLCH.l = OKLab[0]
OKLCH.c = sqrt(a*a + b*b)
OKLCH.h = atan2(b,a) * 180 / pi, normalized into [0,360)
```

When the authoritative RGB channels are all equal, explicitly output OKLCH chroma and hue as zero. HSL grayscale saturation/hue are also zero. Do not output NaN, negative zero, or undefined hues.

Round each HSL and OKLCH field to six decimal places using `floor(value*1000000 + 0.5)/1000000`. Normalize rounded hue modulo 360, so a rounded 360 becomes zero. Trailing zeroes in decimal serialization are optional. Retain numeric types. Top-level sampled hue and contrast ratios are not rounded to six places.

The four formats describe the same final eight-bit RGB color, within the defined decimal precision. The HSL hue angle is not the same coordinate system as the OKLCH hue angle; do not copy one into the other. Derived OKLCH values can differ from the sampling ranges because they describe the gamut-fitted, RGB-quantized color.

## 6. Conformance and versioning

`conformance/vectors.json` records version, tolerance, valid examples, and invalid examples. Each valid vector contains exact input/options, encoded bytes, digest, fractions, and the complete expected result. Encoding fields and digest use lowercase hexadecimal without `#`. An invalid vector contains an expected error code. These diagnostics are fixture data, not fields exposed by the application function.

Ports must match payload bytes, digest, final Hex/RGB, flags, and fallback strings exactly. Compare HSL/OKLCH numeric fields within `0.000001`; the supplied runners allow `1.000001e-6` solely for floating-point representation of that tolerance. The reference cross-language runner compares unrounded hue and contrast within `1e-12`. All published HSL/OKLCH representations must round-trip to the same eight-bit RGB values.

Native transcendental functions can differ in their final bits. Passing these finite checks verifies the tested inputs, not every possible string or numerical boundary. Any final RGB discrepancy in a new port must be investigated against the pinned operation order and vectors; do not silently change the v1 mapping or loosen byte comparisons.

No clock, random generator, process-native hash, locale, storage, network, theme detection, or caller input logging may influence the operation. Implementations may memoize by exact text and complete options/version without changing behavior. Unbounded caches are not part of the libraries.

Changes to encoding, hash, sampling, defaults, conversion, precision, fitting, or selection that alter the mapping require a new algorithm identifier. New versions must not silently replace v1 for persisted assignments.

## 7. Collection placement

Normalize labels and deduplicate their UTF-8 identities. Reserve caller-pinned placements and fixed brand colors first. Process remaining identities in ascending lexicographic order of their SHA-256 digest bytes. Let `n` count the union of requested and pinned identities. For a nonempty collection, the required hue-fraction spacing within each ring is `clamp(1/n, 1/24, 1/12)`. Fractions wrap modulo one.

For collections of up to eight identities with an occupied placement, choose the initial proposal by farthest-point sampling. Try 24 ring-zero fractions in order, `(natural + step/24) mod 1` for steps 0 through 23. For each fraction, measure the smallest circular hue-fraction distance to any occupied placement, including supplied or reserved pins on other rings. Keep the candidate with the largest minimum distance, retaining the earlier step at a tie. Mark it moved when it differs from the natural fraction. With no occupied placement, use the natural fraction. The subsequent rendered-color check and bounded repair apply to this proposal as usual. For larger collections use the alternating-offset proposal below.

A pinned placement has a finite `hueFraction` in [0, 1), an integer `ring` from 0 through 9,007,199,254,740,991 inclusive, and a boolean `moved`. The upper bound is the largest safe integer in JavaScript and applies to both direct assignment and registry replay.

Starting at ring zero, try the natural hash fraction, then offsets of −1, +1, −2, +2 and so on in units of one quarter of the spacing. Try 385 positions per ring. Take the first position whose circular distance from every occupied fraction on that ring is at least the spacing.

Render the tentative placement. For each occupied identity, compute the Euclidean OKLab distance between the two rendered light fills and between the two rendered dark fills, using their sRGB bytes. The placement score is the minimum of all those distances, or positive infinity for an empty registry. Keep the tentative placement if its score is at least 0.04.

Otherwise, for integer steps 1 through 119, try the tentative fraction plus `(step mod 24)/24` on the tentative ring plus `floor(step/24)`. Skip positions that violate the ring spacing. Keep a candidate only when its score strictly improves the best score so far. Stop at the first score of at least 0.04 or after exhausting the candidates. A replacement has `moved = true`. Preserve pinned and fixed placements throughout. This bounded search can return a smaller separation, particularly when supplied colors coincide.

### Rendering a placement

Replace the first digest fraction with the stored hue fraction before the hue warp. Keep the lightness and chroma fractions from the identity digest. Set `r = ring mod 5`. Add the corresponding offset from `[0, 0.08, -0.08, 0.16, -0.16]` to each bias-adjusted profile lightness before clamping to [0,1]. For r = 3 or 4 multiply each sampled chroma scale by 0.6. Larger ring indices reserve distinct placement space and cycle through the same five renditions.

### Vision profiles and markers

For an explicit nonempty list drawn from `normal`, `protan`, `deutan`, and `tritan`, score the minimum Euclidean OKLab distance over all prior placements, both theme fills, and every requested profile. Use the quantized sRGB fallback fills. For simulated profiles, decode sRGB, multiply by the full-severity Machado matrix for the requested profile, clamp each linear channel, encode, and round to bytes before conversion to OKLab. The three matrices are pinned in the diagnostics reference implementation.

Start with the feasible default placement. Evaluate up to 23 additional positions, numbered 1 through 23. Add `step/24` to the starting fraction modulo one and `step mod 5` to its ring. Skip candidates that violate within-ring spacing. Keep only strict score improvements. With no occupied colors, retain the first placement. Pinned and fixed colors reserve space before this search. A marker uses the final SHA-256 digest byte modulo eight to index circle, square, triangle, diamond, star, cross, pentagon, hexagon in that order.

## 8. Resolver colors and constraints

Presets supply initial values. Explicit profile fields and targets override them. The default chroma scales for labels and controls are [0.6,0.8], chart [0.8,1], subdued [0.2,0.4], and mono [0,0]. Controls raises the default WCAG target to 7.

Split wrapped hue intervals at zero and subtract half-open exclusion arcs from the allowed arcs. Map the warped hue to distance `h / 360 * totalAllowedWidth` along the remaining intervals in ascending order. Select the first interval wider than the remaining distance, add its start, and reduce modulo 360, including when addition rounds to exactly 360. Otherwise subtract the interval width and continue. A full circle preserves the hue. An empty domain is invalid.

A normalized override takes precedence over a palette. For a fixed palette, rank each entry by two keys in descending order. First prefer entries whose selected foreground meets the fill target in both themes. Then compare SHA-256 of the 32 identity digest bytes followed by the exact UTF-8 palette ID, lexicographically by unsigned digest byte. Use the winning theme fills. Preserve the supplied sRGB color and derive the other roles from it. If the selected foreground misses the target on a supplied fill, preserve the fill and report `palette-constraint`.

Select foreground candidates in declaration order. For `best`, maximize absolute contrast in the configured gamut and contrast model, retaining the earliest tie. For `first-passing`, return the first candidate meeting the target, otherwise use the best candidate.

For `anchors`, order entries by UTF-8 ID. Given fraction f and m entries, select entry floor(f*m). Convert its supplied color for each theme to the rounded sRGB OKLCH output coordinates. Add `((f*m mod 1) - 0.5) * 30` degrees to its hue, wrap to [0,360), then apply the configured hue domain. Cap each theme profile's chroma at the smaller of its configured cap and 1.25 times that anchor's chroma. Render generated roles at this hue. An override still supplies an exact fill.

## 9. Saved configurations and registries

Current exports use `texthue-config-v2` and `texthue-registry-v2`. Their four envelope fields match the v1 fields below. The fingerprint describes resolved behavior independently of the envelope version. Importers compile the supplied options and verify the digest before accepting the configuration. A registry from an equivalent resolver can be imported directly.

For v2, encode the object `{algorithm, behavior}` with the binary encoding below and domain prefix `texthue-behavior-v1` followed by a zero byte. The behavior object contains the expanded seed, normalize, contrastTarget, contrastTargets, profiles, backgrounds, foregroundPolicy and foregrounds. Include gamut only for Display-P3, contrastModel only for APCA, palette when populated, and paletteMode for anchors. Use normalized namespace and normalized override keys. Store the ordered allowed nonempty hue intervals as hueSegments and the union of half-open excluded intervals as excludeHues, split at zero and merged in ascending order including adjacent intervals. Presets contribute their resolved profiles and targets. Future optional features contribute a descriptor field only when they change baseline behavior. The config-v2 and registry-v2 conformance files fix the encoding and replay results.

Readers also accept legacy snapshots. The v1 configuration envelope contains exactly `schema` (`texthue-config-v1`), `algorithm` (`text-to-color-v1`), expanded replayable `options`, and a lowercase hexadecimal SHA-256 `fingerprint`. Hash the envelope with the fingerprint field omitted. A v1 registry contains exactly `schema` (`texthue-registry-v1`), `algorithm`, the associated configuration fingerprint, and `assignments` mapping identity strings to placement records from section 7. Reject incompatible schema, algorithm, fingerprint, or invalid placement fields before reuse. Persist placements for absent labels to reserve their positions.

Fingerprint encoding starts with UTF-8 `texthue-config-v1` followed by one zero byte. Recursively encode finite numbers as tag byte 1 followed by big-endian IEEE 754 binary64, canonicalizing negative zero to positive zero. Strings use tag 2, a uint32 big-endian UTF-8 byte count, then the bytes. Arrays use tag 3, a uint32 element count, then their elements in order. Objects use tag 4, a uint32 member count, then each key encoded as a string followed by its encoded value, in lexicographic UTF-8 key order. Reject unsupported values and lengths outside uint32.

## Appendix A: conversion matrices

Evaluate rational entries as binary64 divisions. Decimal constants below and the operation order in section 3 are fixed for v1.

```text
M1 (OKLab -> nonlinear LMS)
[ 1,  0.3963377773761749,  0.2158037573099136 ]
[ 1, -0.1055613458156586, -0.0638541728258133 ]
[ 1, -0.0894841775298119, -1.2914855480194092 ]

M2 (LMS -> XYZ D65)
[  1.2268798758459243, -0.5578149944602171,  0.2813910456659647 ]
[ -0.0405757452148008,  1.1122868032803170, -0.0717110580655164 ]
[ -0.0763729366746601, -0.4214933324022432,  1.5869240198367816 ]

M3 (XYZ -> linear sRGB)
[   12831/3959,    -329/214, -1974/3959 ]
[ -851781/878810, 1648619/878810, 36519/878810 ]
[     705/12673,   -2585/12673,   705/667 ]

M4 (linear sRGB -> XYZ)
[ 506752/1228815,  87881/245763,   12673/70218 ]
[  87098/409605,  175762/245763,   12673/175545 ]
[   7918/409605,   87881/737289, 1001167/1053270 ]

M5 (XYZ -> LMS)
[ 0.8190224379967030, 0.3619062600528904, -0.1288737815209879 ]
[ 0.0329836539323885, 0.9292868615863434,  0.0361446663506424 ]
[ 0.0481771893596242, 0.2642395317527308,  0.6335478284694309 ]

M6 (cube-root LMS -> OKLab)
[ 0.2104542683093140,  0.7936177747023054, -0.0040720430116193 ]
[ 1.9779985324311684, -2.4285922420485799,  0.4505937096174110 ]
[ 0.0259040424655478,  0.7827717124575296, -0.8086757549230774 ]
```

## Sources and attribution

- [CSS Color 4, dated 1 September 2026](https://www.w3.org/TR/2026/CRD-css-color-4-20260901/) supplies the color models, conversion equations, matrices, and sRGB transfer functions. The project uses its own fixed chroma-reduction and contrast-selection policy.
- [WCAG G18](https://www.w3.org/WAI/WCAG22/Techniques/general/G18.html) defines the relative-luminance contrast calculation and normal-text target.
- [FIPS 180-4](https://csrc.nist.gov/pubs/fips/180-4/upd1/final) defines SHA-256.
- [Third-party notices](THIRD_PARTY_NOTICES.md) credit the adapted conversion material.
