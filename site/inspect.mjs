import {createResolver, cssVariables, importConfig} from '../packages/npm/dist/index.js';
import {analyzePalette, simulateVision} from '../packages/npm/dist/diagnostics.js';

export function inspect({labels, options, theme, vision, registry}) {
  const resolver = options && Object.hasOwn(options, 'schema') ? importConfig(options) : createResolver(options);
  const pinned = registry ? resolver.importRegistry(registry) : {};
  const fresh = resolver.assign(labels);
  const persistent = registry ? resolver.assign(labels, {pinned}) : fresh;
  const rows = Object.keys(fresh.colors).map(label => {
    const hash = resolver.resolve(label);
    const assigned = fresh.colors[label];
    const saved = persistent.colors[label];
    const swatches = [hash, assigned, saved].map(set => {
      const color = set[theme].fill.hex;
      return vision === 'normal' ? color : simulateVision(color, vision);
    });
    return {label, swatches, contrast: saved[theme].contrast, fill: saved[theme].fill,
      variables: cssVariables(saved, {theme, slug:label})};
  });
  const diagnostics = analyzePalette(rows.map(row => row.fill.hex), vision);
  return {rows, diagnostics, config:resolver.exportConfig(), registry:resolver.exportRegistry(persistent.assignments)};
}
