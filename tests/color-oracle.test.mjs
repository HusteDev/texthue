import assert from 'node:assert/strict';
import test from 'node:test';
import {converter} from 'culori';
import {cusp, toOklab} from '../packages/npm/dist/color-math.js';

test('Culori corroborates 1,000 sRGB conversions and OKLCH gamut boundaries', () => {
  const lab = converter('oklab');
  const linear = converter('lrgb');
  let seed = 4217;
  function sample() {
    seed = (Math.imul(seed,1664525) + 1013904223) >>> 0;
    return seed / 2**32;
  }
  for (let i = 0; i < 1000; i++) {
    const bytes = Array.from({length:3}, () => Math.floor(256 * sample()));
    const [r,g,b] = bytes.map(v => v / 255);
    const expected = lab({mode:'rgb',r,g,b});
    const actual = toOklab(bytes);
    for (const [j,key] of ['l','a','b'].entries()) {
      assert.ok(Math.abs(actual[j] - expected[key]) < 1e-7, `RGB ${bytes}, ${key}`);
    }
    const l = 0.01 + 0.98 * sample(), h = 360 * sample();
    const edge = cusp(l,h);
    // Bracket the boundary independently; two micro-units exceed the 20-step search resolution.
    for (const [offset,inside] of [[-0.000002,true],[0.000002,false]]) {
      const rgb = linear({mode:'oklch',l,c:edge + offset,h});
      assert.equal([rgb.r,rgb.g,rgb.b].every(v => v >= -1e-12 && v <= 1 + 1e-12), inside,
        `Sample ${i}: L=${l}, H=${h}, C=${edge + offset}`);
    }
  }
});
