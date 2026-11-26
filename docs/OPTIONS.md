# Resolver options

<!-- Generated from SPECIFICATION.md by tools/sync-shared.py. -->

An omitted option uses its default. Paths identify nested fields in the JSON options object. See the [package capability table](PACKAGES.md) for the options available in each port.

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
