import assert from 'node:assert/strict';
import test from 'node:test';
import { assignTextColors, createResolver } from 'texthue';

test('shape markers follow normalized identity across reordering and registry extension', () => {
  const labels = ['É', 'E\u0301', '__proto__', 'pear'];
  const options = {normalize: {unicode: 'NFC'}};
  const resolver = createResolver(options);
  const plain = resolver.assign(labels);
  const {markers, ...marked} = resolver.assign(labels, {markers: true});
  assert.deepEqual(marked, plain);
  assert.equal(Object.keys(markers).length, 3);
  assert.ok(Object.hasOwn(markers, '__proto__'));
  const extended = assignTextColors(['pear', 'new', 'É'], options, plain.assignments, {markers: true});
  assert.equal(extended.markers.É, markers.É);
  assert.equal(extended.markers.pear, markers.pear);
  assert.equal(Object.hasOwn(extended.markers, '__proto__'), false);
  assert.deepEqual(resolver.assign([...labels].reverse(), {markers: true}).markers, markers);
  for (const options of [{markers: 1}, {vision: ['unknown']}, {pinned: {pear: {}}}, {pinned: null}]) {
    assert.throws(() => resolver.assign(labels, options), {name: 'TextColorError', code: 'INVALID_OPTIONS'});
  }
  assert.equal(plain.colorsByInput[labels[1]], plain.colors[labels[0]]);
  assert.equal(Object.getPrototypeOf(plain.colorsByInput), null);
  assert.deepEqual(Object.getOwnPropertyDescriptor(plain.colorsByInput, '__proto__'), {
    value: Object.getOwnPropertyDescriptor(plain.colors, '__proto__').value,
    enumerable: true, configurable: true, writable: true,
  });
  const sample = Array.from({length: 128}, (_, i) => String(i));
  assert.equal(new Set(Object.values(resolver.assign(sample, {markers: true}).markers)).size, 8);
});

test('assignment reports the distance between the rendered sRGB swatches', async () => {
  const {analyzePalette} = await import('texthue/diagnostics');
  for (const gamut of ['srgb', 'display-p3']) {
    const {colors,report} = createResolver({gamut}).assign(['research','design']);
    const palette = Object.values(colors).map(color => color.light.fill.hex);
    assert.equal(report.minDistance, analyzePalette(palette).stats.min);
  }
});
