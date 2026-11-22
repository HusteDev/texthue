import assert from 'node:assert/strict';
import test from 'node:test';
import { analyzePalette, simulateVision } from 'texthue/diagnostics';

test('palette reports pair indices, nearest ties, exact duplicates and distribution', () => {
  const {pairs, nearest, duplicates, stats} = analyzePalette(['#FFFFFF', '#ffffff', '#000000']);
  assert.equal(pairs.length, 3);
  assert.deepEqual(duplicates, [[0, 1]]);
  assert.deepEqual(nearest.map(n => n.indices), [[1], [0], [0, 1]]);
  assert.equal(stats.min, 0);
  assert.ok(Math.abs(stats.max - 1) < 1e-7);
  assert.equal(stats.mean, 2 * stats.max / 3);
  for (const palette of [[], ['#123456']]) {
    assert.deepEqual(analyzePalette(palette).stats, {count: 0, min: null, max: null, mean: null});
  }
  assert.throws(() => analyzePalette([], 'unknown'));
  assert.throws(() => analyzePalette(['#abc']));
});

test('simulation changes perceptual distances while keeping original byte duplicates distinct', () => {
  const colors = ['#ff0000', '#00ff00', '#ff0000'];
  for (const vision of ['deutan', 'protan', 'tritan']) {
    const actual = analyzePalette(colors, vision, 0.5);
    const preview = analyzePalette(colors.map(hex => simulateVision(hex, vision, 0.5)));
    assert.deepEqual(actual.pairs, preview.pairs);
    assert.deepEqual(actual.duplicates, [[0, 2]]);
  }
});
