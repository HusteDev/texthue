# Glossary

## Independent label (Hash)

The resolver calculates a color from one label and the configured settings. A new teammate can join without changing anyone else’s badge. Two different names can still produce similar colors. [Compare two labels](COLORS.md#assigning-a-collection).

## Collection assignment (Assigned)

The resolver chooses placements for a group of labels together. This helps distinguish neighboring chart series or issue tags. Adding a series can move an earlier color. [See the before-and-after swatches](COLORS.md#assigning-a-collection).

## Registry

A saved map from label identities to their assigned placements. Save it alongside the resolver configuration. When you add a new series, reload both so the old series keep their colors. [Restore a registry](GUIDE.md#restore-a-registry-and-add-a-label).

## Theme and role

A theme describes the light or dark surface where a label appears. A role tells the application where to paint a color. Use `fill` for the badge background and `onFill` for its lettering. Use `text` for lettering directly on the theme background. [See the role swatches](COLORS.md).

## Preset and brand palette

Try a role preset: [Labels](https://hustedev.github.io/texthue/site/?preset=labels) · [Controls](https://hustedev.github.io/texthue/site/?preset=controls) · [Chart](https://hustedev.github.io/texthue/site/?preset=chart) · [Subdued](https://hustedev.github.io/texthue/site/?preset=subdued) · [Mono](https://hustedev.github.io/texthue/site/?preset=mono).

Try a fixed brand palette: [Coastal duo (2 colors)](https://hustedev.github.io/texthue/site/?brand=duo) · [Print studio (4 colors)](https://hustedev.github.io/texthue/site/?brand=studio) · [Market stalls (8 colors)](https://hustedev.github.io/texthue/site/?brand=market). Switch **Brand mode** between [Fixed brand palette](https://hustedev.github.io/texthue/site/?brand=studio&mode=fixed) for exact fills and [Brand anchors](https://hustedev.github.io/texthue/site/?brand=studio&mode=anchors) for hash-generated variations. [Compare the two modes](CONFIGURATION.md#fixed-brand-palette-and-brand-anchors).

A preset selects defaults for a use case such as charts or controls. A brand palette supplies named colors the resolver can choose from. With only two brand colors, three distinct labels can share a fill. [Configure a brand palette](CONFIGURATION.md#brand-palettes-and-overrides).

## Vision profile

Open the six-label comparison in the inspector: [Normal](https://hustedev.github.io/texthue/site/?vision=normal) · [Protan](https://hustedev.github.io/texthue/site/?vision=protan) · [Deutan](https://hustedev.github.io/texthue/site/?vision=deutan) · [Tritan](https://hustedev.github.io/texthue/site/?vision=tritan).

Normal shows the original colors. Protan, deutan, and tritan simulate changes in red-, green-, and blue-sensitive cone responses, respectively. Compare neighboring swatches within each simulation to spot labels that need text or shapes as another cue. [Compare the four previews](GUIDE.md#find-labels-that-need-another-visual-cue).

## Distance and contrast

OKLab distance measures how far apart two colors are in a perceptual color space. The inspector uses it to flag similar fills. Contrast measures a foreground against a particular background. Check a badge’s lettering against its fill even when the badge stands out clearly from its neighbors. [Read the contrast results](COLORS.md).

## Resolver

An object that applies the same color settings to each label or collection you give it. [Configure your first resolver](FIRST-RESOLVER.md) shows what to pass in and how to use the result.

## Identity and normalization

Identity is the text used to look up a color. Normalization can make different spellings count as one identity. A namespace separates groups of identities. A seed changes the mapping for the group.

## Fingerprint

A digest of the effective resolver settings. Current registries use it to recognize equivalent behavior across JavaScript, Python and Go. Legacy v1 snapshots use a digest of their expanded configuration.

## Pinned placements

Assignments supplied from an earlier run. The resolver keeps those placements while finding space for new labels.

## Gamut and Display-P3

A gamut is the range of colors a color space can represent. Display-P3 can represent colors outside sRGB. For a P3 result, use its CSS rendition on a capable display and its hex value for the sRGB fallback.

## Contrast models

WCAG 2 expresses relative luminance contrast as a ratio. APCA reports a signed lightness contrast value (Lc). Its sign indicates which member of the pair is lighter. Use the target belonging to the selected model.

## Color formats

Hex and RGB describe sRGB channels. HSL expresses hue, saturation, and lightness. OKLCH expresses perceptual lightness, chroma, and hue.
