import assert from 'node:assert/strict';
import test from 'node:test';
import {converter} from 'culori';
import {cusp, p3Formats, toOklab, XYZ_TO_P3} from '../packages/npm/dist/color-math.js';

test('Culori corroborates 1,000 conversions and OKLCH gamut boundaries in each gamut', () => {
  const lab = converter('oklab');
  const linear = converter('lrgb');
  const displayP3 = converter('p3');
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
    const native = p3Formats(bytes).oklch;
    const reference = lab({mode:'p3',r,g,b});
    const angle = native.h * Math.PI / 180;
    // Public OKLCH is rounded to six decimals. Compare Cartesian components
    // so hue wraparound and near-neutral colors use the same tolerance.
    for (const [component,value] of [['l',native.l],['a',native.c*Math.cos(angle)],['b',native.c*Math.sin(angle)]]) {
      assert.ok(Math.abs(value-reference[component]) < 1e-6,`Display-P3 ${bytes}, ${component}`);
    }
    const l = 0.01 + 0.98 * sample(), h = 360 * sample();
    const edge = cusp(l,h);
    const wideEdge = cusp(l,h,XYZ_TO_P3);
    assert.ok(wideEdge >= 0 && wideEdge <= 0.4);
    // Bracket the boundary independently; two micro-units exceed the 20-step search resolution.
    for (const [offset,inside] of [[-0.000002,true],[0.000002,false]]) {
      const rgb = linear({mode:'oklch',l,c:edge + offset,h});
      assert.equal([rgb.r,rgb.g,rgb.b].every(v => v >= -1e-12 && v <= 1 + 1e-12), inside,
        `Sample ${i}: L=${l}, H=${h}, C=${edge + offset}`);
      if (wideEdge + offset <= 0.4) {
        const wide = displayP3({mode:'oklch',l,c:wideEdge + offset,h});
        assert.equal([wide.r,wide.g,wide.b].every(v => v >= 0 && v <= 1),inside,
          `Display-P3 sample ${i}: L=${l}, H=${h}, C=${wideEdge + offset}`);
      }
    }
  }
});
