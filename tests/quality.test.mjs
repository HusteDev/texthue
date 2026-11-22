import assert from 'node:assert/strict';
import test from 'node:test';
import {createResolver} from '../packages/npm/dist/index.js';
import {anchors} from '../packages/npm/dist/tables.js';

test('default hash assignments distribute 4,000 labels across the twelve hue warp segments', () => {
  const resolver = createResolver();
  const counts = Array(anchors.length - 1).fill(0);
  const size = 4000;
  for (let i = 0; i < size; i++) {
    const {hue} = resolver.resolve(`item:${i}`);
    const angle = hue < anchors[0] ? hue + 360 : hue;
    const segment = anchors.findIndex(boundary => boundary > angle) - 1;
    assert.ok(segment >= 0 && segment < counts.length, `Unmapped hue ${hue}`);
    counts[segment]++;
  }
  const expected = size / counts.length;
  for (const [segment, count] of counts.entries()) {
    assert.ok(Math.abs(count - expected) <= expected * 0.2, `Segment ${segment}: ${count} labels`);
  }
});
