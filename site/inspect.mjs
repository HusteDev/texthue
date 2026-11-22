import {contrast, p3Contrast} from '../packages/npm/dist/color-math.js';
import {analyzePalette, simulateVision} from '../packages/npm/dist/diagnostics.js';
import {compareAssignments, createResolver, cssVariables, importConfig} from '../packages/npm/dist/index.js';

function surfaceContrast({fill, background}) {
  const bytes = ({r,g,b}) => [r,g,b];
  const result = {srgbRatio:contrast(bytes(fill.rgb), bytes(background.rgb))};
  if (fill.p3 && background.p3) {
    // p3Contrast takes encoded channels on a 0–255 scale, including fractions.
    const scaledChannels = color => bytes(color.p3).map(v => v * 255);
    result.displayP3LuminanceRatio = p3Contrast(scaledChannels(fill), scaledChannels(background));
  }
  return result;
}

export function inspect({labels, options, theme, vision, registry, baseline, optimizeVision = false, markers = false, minimumDistance = 0}) {
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
    const fills = [hash, assigned, saved].map(set => set[theme].fill);
    const swatches = fills.map(fill => {
      const color = fill.hex;
      return vision === 'normal' ? color : simulateVision(color, vision);
    });
    const nativeSwatches = vision === 'normal' && saved[theme].fill.p3 ? fills.map(fill => fill.css) : undefined;
    const projection = resolver.project(label, {themes:[theme], roles:['fill'], formats:['hex','trace']},
      false, persistent.assignments[label]);
    return {label, ...(markers && {marker:persistent.markers[label]}), swatches, ...(nativeSwatches && {nativeSwatches}), registryFillTrace:projection[theme].fill, contrast: saved[theme].contrast, fill: saved[theme].fill,
      fillOnBackground:surfaceContrast(saved[theme]), variables: cssVariables(saved, {theme, slug:label}),
      ...(saved[theme].fill.p3 && {p3Variables:cssVariables(saved,{theme,slug:label,format:'p3'})})};
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
  const savedRegistry = resolver.exportRegistry(persistent.assignments);
  const migration = baseline && compareAssignments(
    {resolver:importConfig(baseline.config),registry:baseline.registry},
    {resolver,registry:savedRegistry},labels);
  return {rows, diagnostics, findings, config:resolver.exportConfig(), registry:savedRegistry, ...(migration && {migration})};
}
