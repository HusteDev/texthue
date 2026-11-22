import assert from 'node:assert/strict';
import test from 'node:test';
import { createResolver, resolveTextColors } from '../packages/npm/dist/index.js';

test('compiled settings and returned colors have independent lifetimes', () => {
  const options = { backgrounds: { light: '#abcdef' } };
  const resolver = createResolver(options);
  const expected = resolveTextColors('example', options);
  options.backgrounds.light = '#000000';
  const [one,two] = resolver.batch(['example','example']);
  one.light.background.rgb.r = 0;
  assert.deepEqual(two,expected);
  assert.deepEqual(resolver.resolve('example'),expected);
  assert.equal(resolver.hex('example',{theme:'light',role:'fill'}),expected.light.fill.hex);
});

test('registry extension preserves all pinned assignments including absent labels', () => {
  const resolver = createResolver({ normalize:{ whitespace:'collapse' } });
  const first = resolver.assign(['a','b','c']);
  const next = resolver.assign([' a ', 'd'],{pinned:first.assignments});
  for (const key of ['a','b','c']) assert.deepEqual(next.assignments[key],first.assignments[key]);
  assert.deepEqual(next.colors.a,first.colors.a);
  assert.deepEqual(resolver.assign(['a','b','c']),resolver.assign(['c','b','a','c']));
});
