import assert from 'node:assert/strict';
import { compareAssignments, createResolver, cssVariables, importConfig } from 'texthue';

const options = {
  gamut: 'display-p3', contrastModel: 'apca',
  paletteMode: 'anchors', palette: [{id: 'ocean', light: '#117799', dark: '#55ccff'}],
  overrides: {urgent: '#992211'},
};
const resolver = createResolver(options);
const initial = resolver.assign(['research', 'urgent'], {markers: true});
assert.equal(initial.colors.urgent.light.fill.hex, '#992211');
assert.equal(initial.colors.research.light.contrast.fill.model, 'apca');

const config = resolver.exportConfig();
const registry = resolver.exportRegistry(initial.assignments);
const restored = importConfig(JSON.parse(JSON.stringify(config)));
const pinned = restored.importRegistry(JSON.parse(JSON.stringify(registry)));
const extended = restored.assign(['research', 'urgent', 'design'], {pinned});
assert.deepEqual(extended.assignments.research, initial.assignments.research);
const variables = cssVariables(extended.colors.design, {theme: 'light', slug: 'design', format: 'p3'});
assert.ok(Object.values(variables).every(value => value.startsWith('color(display-p3 ')));

const comparison = compareAssignments({resolver, registry}, {resolver: restored, registry}, ['urgent', 'research']);
assert.deepEqual(comparison.colors, []);
console.log(extended.colors.design.light.fill.css);
