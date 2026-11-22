# Choosing and preserving label colors

| Workflow | Inputs | What happens when another label appears? | API |
| --- | --- | --- | --- |
| Independent identity | One label and stable options | Existing output stays fixed | `resolveTextColors(label, options)` |
| Brand palette | Stable palette IDs and theme fills | With the same palette, each label keeps its selected entry. Several labels can select one entry. | `createResolver({palette}).resolve(label)` |
| Collection assignment | The complete set of visible labels | Recomputing with a changed set can move earlier labels. Reordering the same set preserves placements. | `assignTextColors(labels, options)` |
| Persistent registry | New labels, saved placements, and matching configuration | Pinned placements stay fixed across additions. Old placements continue to occupy space. | `resolver.assign(labels, {pinned})` |

## Render a badge

Use the fill and its paired foreground from the same theme. For standalone text on the configured page background, use the text role.

```js
import { resolveTextColors } from 'texthue';

const {fill, onFill} = resolveTextColors('research').light;
console.log(fill.hex, onFill.hex);
```

## Find labels that need another visual cue

Inspect final rendered fills for the theme and vision profile used by your audience. The palette analysis returns indices in input order. Use that same order to recover the label names. Shape markers can repeat. Keep a visible text label when identity matters.

```js
import { createResolver } from 'texthue';
import { analyzePalette } from 'texthue/diagnostics';

const resolver = createResolver({namespace:'issues'});
const {colors, markers} = resolver.assign(['bug','feature','question'], {markers:true});
const labels = Object.keys(colors);
const {nearest} = analyzePalette(labels.map(label => colors[label].dark.fill.hex), 'deutan');
console.log(labels[0], markers[labels[0]], nearest[0].indices.map(i => labels[i]));
```

## Restore a registry and add a label

Store the exported configuration alongside the registry. An import checks their fingerprints. Persist the registry returned after each successful update.

```js
import { createResolver, importConfig } from 'texthue';

const resolver = createResolver({namespace:'issues'});
const first = resolver.assign(['bug','feature']);
const snapshot = JSON.stringify({
  config:resolver.exportConfig(),
  registry:resolver.exportRegistry(first.assignments),
});
const saved = JSON.parse(snapshot);
const restored = importConfig(saved.config);
const pinned = restored.importRegistry(saved.registry);
const next = restored.assign(['question'], {pinned});
console.log(next.colors.question.light.fill.hex, Object.keys(next.assignments).length);
```

For component rendering, see the [React adapter](../packages/react/README.md). For build-time color utilities and runtime CSS variables, see the [Tailwind adapter](../packages/tailwind/README.md).
