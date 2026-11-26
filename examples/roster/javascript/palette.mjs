import {createResolver, importConfig} from 'texthue';

/** @param {string[]} labels @param {string} previous JSON saved by an earlier run, or an empty string. */
export function updateRoster(labels, previous) {
  const saved = previous ? JSON.parse(previous) : undefined;
  const resolver = saved ? importConfig(saved.config) : createResolver({namespace: 'assignees'});
  const pinned = saved ? resolver.importRegistry(saved.registry) : {};
  const board = resolver.assign(labels, {pinned});

  for (const label of labels) {
    const badge = resolver.resolve(label).light;
    console.log(label, badge.fill.hex, badge.onFill.hex, board.colors[label].light.fill.hex);
  }
  return JSON.stringify({
    config: resolver.exportConfig(),
    registry: resolver.exportRegistry(board.assignments),
  });
}
