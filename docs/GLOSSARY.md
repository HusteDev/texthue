# Palette inspector glossary

## Independent label (Hash)

The resolver calculates a color from one label and the configured settings. A new teammate can join without changing anyone else’s badge. Two different names can still produce similar colors. [Compare two labels](COLORS.md#assigning-a-collection).

## Collection assignment (Assigned)

The resolver chooses placements for a group of labels together. This helps distinguish neighboring chart series or issue tags. Adding a series can move an earlier color. [See the before-and-after swatches](COLORS.md#assigning-a-collection).

## Registry

A saved map from label identities to their assigned placements. Save it alongside the resolver configuration. When you add a new series, reload both so the old series keep their colors. [Restore a registry](GUIDE.md#restore-a-registry-and-add-a-label).

## Theme and role

A theme describes the light or dark surface where a label appears. A role tells the application where to paint a color. Use `fill` for the badge background and `onFill` for its lettering. Use `text` for lettering directly on the theme background. [See the role swatches](COLORS.md).

## Preset and brand palette

A preset selects defaults for a use case such as charts or controls. A brand palette supplies named colors the resolver can choose from. With only two brand colors, three distinct labels can share a fill. [Configure a brand palette](CONFIGURATION.md#brand-palettes-and-overrides).

## Vision profile

Normal shows the original colors. Protan, deutan, and tritan simulate changes in red-, green-, and blue-sensitive cone responses, respectively. Compare neighboring swatches within each simulation to spot labels that need text or shapes as another cue. [Compare the four previews](GUIDE.md#find-labels-that-need-another-visual-cue).

## Distance and contrast

OKLab distance measures how far apart two colors are in a perceptual color space. The inspector uses it to flag similar fills. Contrast measures a foreground against a particular background. Check a badge’s lettering against its fill even when the badge stands out clearly from its neighbors. [Read the contrast results](COLORS.md).
