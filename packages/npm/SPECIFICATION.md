# TextHue algorithm: text-to-color-v1

Algorithm identifier: `text-to-color-v1`.

This specification maps exact text to deterministic sRGB colors for any application domain. It defines light-theme and dark-theme fill/foreground pairs and accents. It does not allocate unique colors or inspect the meaning of the input.

## 1. Interface

Language-neutral operation:

```text
resolveTextColors(text, options = {}) -> ColorSet
```

The TypeScript/npm library uses this name and returns a Promise to both JavaScript and TypeScript consumers. Python uses `resolve_text_colors` and returns directly. Go uses `Resolve(text string, options *Options) (ColorSet, error)`. Language-specific naming and synchronous/asynchronous execution do not alter the mapping. Each library's README documents native types, examples, and installation.

Package versions are independent of the `text-to-color-v1` identifier. The identifier is part of the hashed payload, so it is fixed for as long as this mapping is in use.

### Input text

`text` and `options.namespace` are sequences of Unicode scalar values. Empty strings, embedded U+0000, whitespace, combining marks, noncharacters, and supplementary characters are accepted. Encode as UTF-8 without a BOM; an actual U+FEFF character supplied by the caller is preserved. Do not normalize Unicode, fold case, trim, interpret tokens, or coerce non-string values.

Reject malformed text, including unpaired UTF-16 surrogates. A valid UTF-16 surrogate pair represents one supplementary scalar and must encode accordingly. A Python string containing surrogate code points is malformed.

### Options

Options are JSON-style records with these keys. Omission selects a default; explicit null is invalid. Unknown keys are invalid at every level. Numbers must be finite binary64 values, not strings or booleans. Ranges are two-element numeric arrays; an override replaces the complete array. Inputs are not modified.

| Key | Default | Allowed values |
|---|---|---|
| `namespace` | `""` | Exact text; UTF-8 byte length at most `2^32 - 1` |
| `backgrounds.light` | `"#ffffff"` | Opaque six-digit Hex, case-insensitive |
| `backgrounds.dark` | `"#121212"` | Opaque six-digit Hex, case-insensitive |
| `contrastTarget` | `4.5` | Inclusive range 1–21 |
| `profiles.light.fill.lightness` | `[0.72, 0.82]` | `0 <= min <= max <= 1` |
| `profiles.dark.fill.lightness` | `[0.40, 0.50]` | `0 <= min <= max <= 1` |
| `profiles.light.accent.lightness` | `[0.45, 0.55]` | `0 <= min <= max <= 1` |
| `profiles.dark.accent.lightness` | `[0.72, 0.82]` | `0 <= min <= max <= 1` |
| Each profile's `chroma` | `[0.10, 0.16]` | `0 <= min <= max <= 0.4` |

The chroma bound of 0.4 is this API's input limit, not a universal limit on OKLCH. The theme names identify output slots; a supplied background is always used as supplied, even if its brightness differs from its theme name. Background parsing does not accept shorthand, alpha, named colors, or other CSS expressions.

Profile ranges specify starting preferences. Gamut fitting may reduce chroma below its minimum. Contrast adjustment may move lightness outside its range. Only missing fields inherit defaults; supplied invalid fields never silently fall back.

Invalid text yields error code `INVALID_TEXT`. Invalid options, including an invalid namespace, yield `INVALID_OPTIONS`. Error messages and exception classes are language-specific; error codes are stable. Resource exhaustion and unavailable cryptographic runtimes are execution errors, not color fallbacks.

Go's typed interface uses nil optional pointers to represent omission and a nil `*Options` for all defaults; the function's string parameter excludes non-string text at compile time. `ParseOptions` accepts the JSON contract above and rejects explicit null, unknown fields, malformed Unicode, and invalid ranges. It avoids Go's standard JSON decoder's permissive replacement of malformed Unicode. Go results use exported field names with JSON tags matching this specification.

### Result

```text
ColorSet = {
  version: "text-to-color-v1",
  hue: number,
  light: ThemeColors,
  dark: ThemeColors
}

ThemeColors = {
  background: Color,
  fill: Color,
  onFill: Color,
  accent: Color,
  contrast: {
    target: number,
    fill: ContrastResult,
    accent: ContrastResult
  }
}

Color = {
  hex: "#rrggbb",
  rgb: { r: integer, g: integer, b: integer },
  hsl: { h: number, s: number, l: number },
  oklch: { l: number, c: number, h: number }
}

ContrastResult = {
  ratio: number,
  meetsTarget: boolean,
  lightnessAdjusted: boolean,
  chromaReduced: boolean,
  fallback: null | "unattainable-contrast"
}
```

The result excludes input text, namespace, and digest. `hue` is the sampled OKLCH identity hue before conversion, with no decimal rounding. All colors are opaque sRGB. RGB channels are integers in 0–255. HSL hue uses degrees and saturation/lightness use percentages. OKLCH lightness uses 0–1, chroma is a number, and hue uses degrees.

`onFill` is either black or white. `contrast.fill` measures fill against onFill. `contrast.accent` measures accent against background. The ratio is retained at computational precision; `meetsTarget` uses that ratio without display rounding. A fallback only represents an unattainable accent contrast target. `chromaReduced` compares the final retained pre-quantization chroma with the requested chroma; it does not compare rounded output OKLCH values. `lightnessAdjusted` compares the selected pre-quantization lightness with the original sampled lightness.

## 2. Text to sampling fractions

1. Validate text and copy validated option values before any asynchronous boundary.
2. Encode namespace and text independently as UTF-8.
3. Assemble the following bytes in exactly this order:

```text
UTF8("text-to-color-v1")
one zero byte
namespace UTF-8 byte length as four unsigned big-endian bytes
namespace UTF-8 bytes
text UTF-8 bytes
```

The length describes bytes, not characters. The input occupies the remainder, so no delimiter or second length is necessary. Namespace changes cannot ambiguously shift the boundary into the text, even when either contains zero bytes. Do not include a JSON representation, BOM, terminator after the input, options, or locale data in this payload.

4. Compute SHA-256 as defined by [FIPS 180-4](https://csrc.nist.gov/pubs/fips/180-4/upd1/final).
5. Interpret digest bytes `[0,4)`, `[4,8)`, and `[8,12)` as unsigned big-endian 32-bit integers. Do not parse a platform-native signed hash.
6. Divide each integer by exactly `4294967296`, producing `uH`, `uL`, and `uC` in `[0,1)`.

For each fill/accent profile:

```text
h = uH * 360
l = lMin + (lMax - lMin) * uL
c = cMin + (cMax - cMin) * uC
```

All four profiles reuse these same fractions. Palette or background changes never alter the sampled identity hue. Namespace or text changes can alter it. The upper bound of a nonzero-width range is excluded by interpolation; zero-width ranges produce the single endpoint.

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

## 4. Contrast and lightness adjustment

For an eight-bit RGB triple, divide each channel by 255, apply `decode`, and calculate relative luminance as `(0.2126*r + 0.7152*g) + 0.0722*b`. For luminances A and B:

```text
ratio = (max(A, B) + 0.05) / (min(A, B) + 0.05)
```

This is the [WCAG contrast calculation](https://www.w3.org/WAI/WCAG22/Techniques/general/G18.html). The default 4.5 target is appropriate for normal text in the declared foreground/background pair. It does not certify a complete interface or promise distinctions between generated colors.

For a fill, select the black or white foreground with greater contrast. An exact tie selects black. Measure the fill against that foreground. For an accent, measure it against its declared theme background.

```text
initial = fit(originalLightness, requestedChroma, identityHue)
if measured ratio >= target: return initial

for an accent only:
    if neither black nor white reaches the target against the background:
        select whichever has greater contrast; ties select black
        return it with meetsTarget=false and fallback="unattainable-contrast"

candidates = fit(k/1000, requestedChroma, identityHue), for integer k=0..1000
retain candidates whose final RGB contrast is >= target
choose minimum abs(candidateLightness - originalLightness)
break an exact distance tie by choosing the lower lightness
```

Recompute the black/white foreground for every fill candidate. Chroma fitting runs at the new lightness; do not reuse an earlier reduced chroma. Endpoints guarantee a passing candidate for every valid fill target. For an accent, the precheck establishes whether any sRGB color can meet its target; black and white give the extremal luminances. No further chroma or hue search is performed.

The full sampled initial lightness is checked before searching the 0.001 grid. This rule defines a deterministic nearby adjustment; it does not claim a continuous mathematical optimum. Compare distances and contrast at computational precision without epsilon or display rounding. An exact threshold passes.

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

`conformance/vectors.json` records version, tolerance, valid examples, and invalid examples. Each valid vector contains exact input/options, encoded bytes, digest, fractions, requested OKLCH values, and the complete expected result. Encoding fields and digest use lowercase hexadecimal without `#`. An invalid vector contains an expected error code. These diagnostics are fixture data, not fields exposed by the application function.

Ports must match payload bytes, digest, final Hex/RGB, flags, and fallback strings exactly. Compare HSL/OKLCH numeric fields within `0.000001`; the supplied runners allow `1.000001e-6` solely for floating-point representation of that tolerance. The reference cross-language runner compares unrounded hue and contrast within `1e-12`. All published HSL/OKLCH representations must round-trip to the same eight-bit RGB values.

Native transcendental functions can differ in their final bits. Passing these finite checks verifies the tested inputs, not every possible string or numerical boundary. Any final RGB discrepancy in a new port must be investigated against the pinned operation order and vectors; do not silently change the v1 mapping or loosen byte comparisons.

No clock, random generator, process-native hash, locale, storage, network, theme detection, or caller input logging may influence the operation. Implementations may memoize by exact text and complete options/version without changing behavior. Unbounded caches are not part of the libraries.

Changes to encoding, hash, sampling, defaults, conversion, precision, fitting, or selection that alter the mapping require a new algorithm identifier. New versions must not silently replace v1 for persisted assignments.

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
