# Using the palette inspector

1. Open the [live palette inspector](https://hustedev.github.io/texthue/site/?preview=2), enter one label per line, and select **Generate Palette**.
2. Read across one row. [**Hash**](GLOSSARY.md#independent-label-hash) shows the color for that label alone. [**Assigned**](GLOSSARY.md#collection-assignment-assigned) takes the other labels into account. [**Registry**](GLOSSARY.md#registry) uses saved placements when you supply them. Expand **Full color set** under any swatch to see the values your code receives.
3. Open **Advanced settings**. Try [Coastal duo](https://hustedev.github.io/texthue/site/?brand=duo) with three labels. Two available brand colors force some labels to share a fill. Switch to [Market stalls](https://hustedev.github.io/texthue/site/?brand=market) to give the [resolver](GLOSSARY.md#resolver) eight choices. Each example regenerates the table immediately. Switch **Brand mode** between [Fixed brand palette](https://hustedev.github.io/texthue/site/?brand=studio&mode=fixed) for exact fills and [Brand anchors](https://hustedev.github.io/texthue/site/?brand=studio&mode=anchors) for hash-generated variations. [Compare the two modes](CONFIGURATION.md#fixed-brand-palette-and-brand-anchors).
4. Select a [vision profile](GLOSSARY.md#vision-profile) and generate again. Look for swatches that become difficult to distinguish. Expand **Closest pairs** to find the nearest pairs in that preview. If users need to identify a series reliably, keep its text label or add a shape.

Expand **Fill contrast against the page** to compare the badge surface with the theme background. The **Full color set** under each swatch includes the contrast of the text on the badge.

Open a preset to compare its defaults: [Labels](https://hustedev.github.io/texthue/site/?preset=labels) · [Controls](https://hustedev.github.io/texthue/site/?preset=controls) · [Chart](https://hustedev.github.io/texthue/site/?preset=chart) · [Subdued](https://hustedev.github.io/texthue/site/?preset=subdued) · [Mono](https://hustedev.github.io/texthue/site/?preset=mono).

Compare the same six labels across vision profiles: [Normal](https://hustedev.github.io/texthue/site/?vision=normal) · [Protan](https://hustedev.github.io/texthue/site/?vision=protan) · [Deutan](https://hustedev.github.io/texthue/site/?vision=deutan) · [Tritan](https://hustedev.github.io/texthue/site/?vision=tritan).

Select the question mark beside a field or column for its definition. See [Glossary](GLOSSARY.md) for the terms used across the handbook.

## Copy link to this palette

**After editing labels or settings, select Generate Palette and wait for the results to update.** Then select **Copy link to this palette** above the results. The button shares the last successfully generated palette. Anyone who opens the link sees that palette generated automatically.

For example, open [Coastal duo](https://hustedev.github.io/texthue/site/?brand=duo), add `Support` on a new line, and switch the theme to **dark**. Select **Generate Palette**. Once the table shows the Support row with the dark-theme swatches, copy the link. Copying before generating would share the earlier labels and theme.

The link contains the inputs used for that run:

- The labels in their original order and the resolver options, including any applied [preset or brand colors](GLOSSARY.md#preset-and-brand-palette).
- The light or dark theme, selected [vision profile](GLOSSARY.md#vision-profile), and whether new placements were optimized for that profile.
- The minimum [OKLab distance](GLOSSARY.md#distance-and-contrast) and whether identity shapes were enabled.
- Any supplied [registry](GLOSSARY.md#registry) and any comparison baseline used for that run.

These inputs travel in the URL itself. Anyone with the link can read the included labels and configuration. To share later edits, generate again and copy a new link.
