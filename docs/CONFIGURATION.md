# Resolver configuration

## Replay a configuration

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

## Contrast models

Select APCA with `contrastModel: 'apca'`, Python's `contrast_model="apca"`, or
Go's `WithContrastModel("apca")`. The default target in this mode is 60 Lc.
Targets from 0 through 106 apply to the magnitude of signed Lc. Each APCA
relationship reports its signed `value` and whether it meets its target.
Positive Lc indicates darker foreground text. The separate `ratio` field
records the luminance contrast ratio in the selected gamut. With sRGB this is the WCAG 2 ratio. A text color can pass on the
theme background and fail on the subtle surface, so check both relationships.

## Display-P3 and CSS

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

For a full theme of P3 custom properties, use `cssVariables(colors, {theme: 'light', slug: 'badge', format: 'p3'})` in JavaScript, `css_variables(colors, theme="light", slug="badge", format="p3")` in Python, or `CSSVariablesFormat(colors, "light", "badge", "texthue", "p3")` in Go. The hex defaults use the same property names, so a stylesheet can declare fallbacks first and override them inside `@supports (color: color(display-p3 1 0 0))`.

## Transparent surfaces

For a translucent surface over a known opaque backdrop, use
`compositeOver(source, alpha, backdrop)` in JavaScript,
`composite_over(source, alpha, backdrop)` in Python, or `CompositeOver` in Go.
Both inputs are TextHue colors. Alpha ranges from zero to one. The helper blends
in linear sRGB and rounds once to opaque sRGB bytes. Half-opacity white over
black produces `#bcbcbc`. Use the result as a theme background to check contrast
against that composite. Go accepts two resulting colors via `WithColorBackgrounds`.

## Compare a migration

Preview a migration before saving the new registry. In JavaScript, use
`compareAssignments({resolver: old, registry}, {resolver: next}, labels)`.
Python exposes `compare_assignments` with dictionaries for the two sides. Go
accepts two `MigrationSide` values and the label slice. Each side applies its
own normalization and optional pins. The report lists changed placements,
per-role rendition changes with Euclidean OKLab distance, contrast ratio
and pass/fail changes, and exact fill collisions in both themes. Collision
groups contain distinct normalized identities sharing a fallback hex. Color changes
include the old and new hex values and, when present, the native CSS values in
`beforeP3` and `afterP3`. A change of rendition can preserve the same hex.
Contrast changes include signed `beforeLc` or `afterLc` values for sides using APCA,
including zero when the pair has no measurable APCA contrast.
The preview leaves caller-owned
registries untouched.

## Brand palettes and overrides

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

The [full specification](../SPECIFICATION.md) defines exact matrices, ordering, rounding, error handling, and portability rules. Each package includes a copy of it. The algorithm identifier is **`text-to-color-v1`**. It is part of the hashed payload and is independent of package versions: any change to the color mapping is released under a new identifier, so existing assignments never change silently.

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
