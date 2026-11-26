# Resolver configuration

New to resolvers? [Configure your first resolver](FIRST-RESOLVER.md) walks through construction, two lookups, and the expected badge colors in JavaScript, Python, and Go.

## Replay a configuration

JavaScript uses `resolver.exportConfig()` and `importConfig(value)`. Python uses `resolver.export_config()` and `import_config(value)`. Both export a JSON-compatible object. Go uses `resolver.ExportConfig()` and `texthue.ImportConfig(data)` with JSON bytes and an error return.

The v2 snapshot records the expanded options for editing and a SHA-256 [fingerprint](GLOSSARY.md#fingerprint) of the behavior they select. For example, the chart preset and four explicit chart chroma scales share a fingerprint. Changing the seed changes the fingerprint. The importer recalculates it to detect accidental changes. Anyone who can edit the file can also recalculate the digest.

To save placements, pass the assignment map to JavaScript’s `resolver.exportRegistry(assignments)`, Python’s `resolver.export_registry(assignments)`, or Go’s `resolver.ExportRegistry(assignments)`. Store the returned [registry](GLOSSARY.md#registry) alongside the configuration. On restart, restore the resolver, import the registry, and pass the returned [pins](GLOSSARY.md#pinned-placements) to the next assignment. Equivalent resolvers can share a v2 registry. Previously pinned labels keep their placements even when absent from the next batch. All three ports also accept v1 snapshots with their original configuration.

## Contrast models

Select [APCA](GLOSSARY.md#contrast-models) with `contrastModel: 'apca'`, Python's `contrast_model="apca"`, or Go's `WithContrastModel("apca")`. The default target in this mode is 60 Lc. Targets from 0 through 106 apply to the magnitude of signed Lc. Each APCA relationship reports its signed `value` and whether it meets its target. Positive Lc indicates darker foreground text. The separate `ratio` field records the luminance [contrast](GLOSSARY.md#distance-and-contrast) ratio in the selected [gamut](GLOSSARY.md#gamut-and-display-p3). With sRGB this is the WCAG 2 ratio. A text color can pass on the [theme](GLOSSARY.md#theme-and-role) background and fail on the subtle surface, so check both relationships.

## Display-P3 and CSS

Select [Display-P3](GLOSSARY.md#gamut-and-display-p3) with JavaScript’s `createResolver({gamut: 'display-p3'})`, Python’s `Resolver(gamut="display-p3")`, or Go’s `NewResolver(WithGamut("display-p3"))`. Use the returned `css` string for that rendition and `hex` for the sRGB fallback. A true `srgbClipped` flag means at least one fallback channel reached the sRGB boundary through clipping. [Contrast](GLOSSARY.md#distance-and-contrast) is measured on the Display-P3 rendition using its luminance coefficients. A fallback used in an sRGB interface needs a separate contrast check. Supplied sRGB brand colors and backgrounds are converted to P3 before measuring their relationships.

The CSS helper accepts `p3` in JavaScript, Python, and Go. For a native P3 rendition it returns its native CSS string. For an sRGB rendition it converts the color to Display-P3 coordinates and emits a CSS string with up to six fractional digits per channel. For example, sRGB red serializes as `color(display-p3 0.917488 0.200287 0.138561)`.

For a full [theme](GLOSSARY.md#theme-and-role) of P3 custom properties, use `cssVariables(colors, {theme: 'light', slug: 'badge', format: 'p3'})` in JavaScript, `css_variables(colors, theme="light", slug="badge", format="p3")` in Python, or `CSSVariablesFormat(colors, "light", "badge", "texthue", "p3")` in Go. The hex defaults use the same property names, so a stylesheet can declare fallbacks first and override them inside `@supports (color: color(display-p3 1 0 0))`.

## Transparent surfaces

For a translucent surface over a known opaque backdrop, use `compositeOver(source, alpha, backdrop)` in JavaScript, `composite_over(source, alpha, backdrop)` in Python, or `CompositeOver` in Go. Both inputs are TextHue colors. Alpha ranges from zero to one. The helper blends in linear sRGB and rounds once to opaque sRGB bytes. Half-opacity white over black produces `#bcbcbc`. Use the result as a [theme](GLOSSARY.md#theme-and-role) background to check [contrast](GLOSSARY.md#distance-and-contrast) against that composite. Go accepts two resulting colors via `WithColorBackgrounds`.

## Compare a migration

Preview a migration before saving the new [registry](GLOSSARY.md#registry). In JavaScript, use `compareAssignments({resolver: old, registry}, {resolver: next}, labels)`. Python exposes `compare_assignments` with dictionaries for the two sides. Go accepts two `MigrationSide` values and the label slice. Each side applies its own [normalization](GLOSSARY.md#identity-and-normalization) and optional [pins](GLOSSARY.md#pinned-placements). The report lists changed placements, per-[role](GLOSSARY.md#theme-and-role) rendition changes with Euclidean [OKLab distance](GLOSSARY.md#distance-and-contrast), contrast ratio and pass/fail changes, and exact fill collisions in both themes. Collision groups contain distinct normalized identities sharing a fallback hex. Color changes include the old and new hex values and, when present, the native CSS values in `beforeP3` and `afterP3`. A change of rendition can preserve the same hex. Contrast changes include signed `beforeLc` or `afterLc` values for sides using [APCA](GLOSSARY.md#contrast-models), including zero when the pair has no measurable APCA contrast. The preview leaves caller-owned registries untouched.

## Brand palettes and overrides

Try the same labels with different numbers of brand colors: [Coastal duo (2 colors)](https://hustedev.github.io/texthue/site/?brand=duo) · [Print studio (4 colors)](https://hustedev.github.io/texthue/site/?brand=studio) · [Market stalls (8 colors)](https://hustedev.github.io/texthue/site/?brand=market).

Use `overrides` to pin a label to a hex fill for both [themes](GLOSSARY.md#theme-and-role), or supply distinct light and dark fills. A palette entry has a stable `id` and at least one theme color. A single supplied theme color applies to both. The [resolver](GLOSSARY.md#resolver) prefers palette entries meeting the fill target in both themes, then ranks them by the SHA-256 digest of the identity digest followed by the UTF-8 entry ID. Reordering entries preserves assignments.

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

The default foreground policy chooses the highest [contrast](GLOSSARY.md#distance-and-contrast), with list order breaking ties. First-passing chooses the first candidate meeting the target and otherwise uses the highest contrast. A fixed fill that misses its target keeps its supplied bytes and reports `palette-constraint`.

Hex helpers return the selected fallback by default. To require a passing result, use `resolver.hex(id, {theme: 'light', role: 'text', strict: true})` in JavaScript, `resolver.hex(id, theme="light", role="text", strict=True)` in Python, or `resolver.HexStrict(id, "light", "text")` in Go. Each reports `UNMET_CONSTRAINT` if the selected role misses its target. Text must pass against both background and subtle. Fill and on-fill share the fill pair. Hover, active, border, and strong each use their own pair. Background, subtle, and muted have no independent target when requested as surfaces.


### Fixed brand palette and brand anchors

Use **Fixed brand palette** for approved badge fills. Each label selects a named entry. With the Print studio example, `research` and `design` both select leaf (`#577445`) in the light theme, even with other entries available.

Use **Brand anchors** when the brand colors should guide a larger family of fills. TextHue uses the label hash to select an anchor and a nearby hue (within 15 degrees before any configured hue restrictions). Each theme uses its own anchor color. The hash and role profile set the lightness and chroma, with chroma capped relative to the anchor. Related labels can still look similar. Use the Assigned column to compare collection-aware placements. An explicit label override still uses its exact fill.

Compare the same three labels: [Print studio with fixed fills](https://hustedev.github.io/texthue/site/?brand=studio&mode=fixed) · [Print studio with brand anchors](https://hustedev.github.io/texthue/site/?brand=studio&mode=anchors).

The inspector and the JavaScript/TypeScript implementation on main support `paletteMode: 'anchors'`. Omitting the option uses fixed fills. Other language ports currently support their existing palette behavior.

```js
const resolver = createResolver({
  paletteMode: 'anchors',
  palette: [{ id: 'ocean', light: '#176b83', dark: '#73c8dc' }],
});
const fill = resolver.resolve('research').light.fill.hex;
```

## Algorithm and options

The [versioned specification](../SPECIFICATION.md) defines the hash payload, gamut fitting and contrast repair. The [generated options reference](OPTIONS.md) gives accepted keys, ranges and defaults. Identity preserves exact Unicode by default. When configured, the resolver applies Unicode form, lowercase and whitespace handling before hashing. Runtime Unicode versions can affect normalized labels.
