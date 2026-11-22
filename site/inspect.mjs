import {analyzePalette, simulateVision} from '../packages/npm/dist/diagnostics.js';
import {createResolver, cssVariables, importConfig} from '../packages/npm/dist/index.js';

export function inspect({labels, options, theme, vision, registry, optimizeVision = false, markers = false, minimumDistance = 0}) {
  const resolver = options && Object.hasOwn(options, 'schema') ? importConfig(options) : createResolver(options);
  if (!Number.isFinite(minimumDistance) || minimumDistance < 0) throw new RangeError('Minimum distance must be nonnegative');
  const identities = new Map();
  for (const label of new Set(labels)) {
    const identity = resolver.identity(label);
    const spellings = identities.get(identity) ?? [];
    spellings.push(label);
    identities.set(identity,spellings);
  }
  const pinned = registry ? resolver.importRegistry(registry) : {};
  const profiles = vision === 'normal' ? ['normal'] : ['normal',vision];
  const assignment = {markers, ...(optimizeVision && {vision:profiles})};
  const fresh = resolver.assign(labels,assignment);
  const persistent = registry ? resolver.assign(labels, {...assignment,pinned}) : fresh;
  const rows = Object.keys(fresh.colors).map(label => {
    const hash = resolver.resolve(label);
    const assigned = fresh.colors[label];
    const saved = persistent.colors[label];
    const swatches = [hash, assigned, saved].map(set => {
      const color = set[theme].fill.hex;
      return vision === 'normal' ? color : simulateVision(color, vision);
    });
    const projection = resolver.project(label, {themes:[theme], roles:['fill'], formats:['hex','trace']},
      false, persistent.assignments[label]);
    return {label, ...(markers && {marker:persistent.markers[label]}), swatches, registryFillTrace:projection[theme].fill, contrast: saved[theme].contrast, fill: saved[theme].fill,
      variables: cssVariables(saved, {theme, slug:label})};
  });
  const diagnostics = analyzePalette(rows.map(row => row.fill.hex), vision);
  const names = (first,second) => [rows[first].label,rows[second].label];
  const findings = {
    aliases:Array.from(identities, ([identity,spellings]) => ({identity,spellings})).filter(group => group.spellings.length > 1),
    closest:diagnostics.pairs.filter(pair => pair.distance === diagnostics.stats.min)
      .map(({first,second,distance}) => ({labels:names(first,second),distance})),
    duplicates:diagnostics.duplicates.map(([first,second]) => names(first,second)),
    exhaustedSearches:(persistent.report.searches ?? []).filter(search =>
      search.positionsConsidered === 24 && search.bestDistance !== null && search.bestDistance < minimumDistance),
    belowMinimum:diagnostics.pairs.filter(pair => pair.distance < minimumDistance)
      .map(({first,second,distance}) => ({labels:names(first,second),distance})),
  };
  return {rows, diagnostics, findings, config:resolver.exportConfig(), registry:resolver.exportRegistry(persistent.assignments)};
}
