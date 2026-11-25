import assert from 'node:assert/strict';
import test from 'node:test';
import {cusp} from '../packages/npm/dist/color-math.js';
import {createResolver} from '../packages/npm/dist/index.js';
import {anchors} from '../packages/npm/dist/tables.js';

test('uncapped rendered tones retain at least 55 percent of available sRGB chroma', () => {
  const resolver = createResolver();
  const roles = ['subtle','muted','fill','fillHover','fillActive','border','text','strong'];
  for (let i = 0; i < 4000; i++) {
    const palette = resolver.resolve(`item:${i}`);
    for (const theme of ['light','dark']) {
      for (const role of roles) {
        const tones = palette[theme];
        if (tones.contrast[role]?.chromaCapped) continue;
        const {l,c,h} = tones[role].oklch;
        assert.ok(c >= 0.55 * cusp(l,h), `item:${i} ${theme}.${role}`);
      }
    }
  }
});

test('pinned warp knots reproduce each anchor and wrap continuously at one', () => {
  const resolver = createResolver();
  const at = hueFraction => resolver.assign(['sample'], {
    pinned: {sample: {hueFraction, ring: 0, moved: false}},
  }).colors.sample.hue;
  for (let index = 0; index < 12; index++) {
    assert.ok(Math.abs(at(index / 12) - anchors[index]) < 1e-12);
  }
  const before = at(1 - 2 ** -32);
  assert.ok(before < anchors[0] && anchors[0] - before < 1e-6);
});

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

test('default contrast repairs stay below five percent for each tone in each theme', () => {
  const resolver = createResolver();
  const tones = ['fill','fillHover','fillActive','border','text','strong'];
  const counts = new Map();
  const size = 4000;
  for (let i = 0; i < size; i++) {
    const palette = resolver.resolve(`item:${i}`);
    for (const theme of ['light','dark']) {
      for (const tone of tones) {
        const report = palette[theme].contrast[tone];
        assert.equal(typeof report.lightnessAdjusted, 'boolean');
        assert.ok(report.meetsTarget, `item:${i} ${theme}.${tone}`);
        const key = `${theme}.${tone}`;
        counts.set(key, (counts.get(key) ?? 0) + Number(report.lightnessAdjusted));
      }
      assert.ok(palette[theme].contrast.textOnSubtle.meetsTarget);
    }
  }
  for (const [key, count] of counts) {
    assert.ok(count / size < 0.05, `${key}: ${count} repairs in ${size} labels`);
  }
});
