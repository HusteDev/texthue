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
test('brand assignments preserve approved bytes and honor foreground order', () => {
  const expected = '#777777';
  const options = {overrides:{fixed:expected},foregrounds:['#888888'],contrastTarget:21};
  const resolver = createResolver(options);
  const {fixed} = resolver.assign(['free','fixed']).colors;
  assert.equal(fixed.source,'override');
  for (const theme of [fixed.light,fixed.dark]) {
    assert.equal(theme.fill.hex,expected);
    assert.equal(theme.onFill.hex,'#888888');
    assert.equal(theme.contrast.fill.meetsTarget,false);
    assert.equal(theme.contrast.fill.fallback,'palette-constraint');
    assert.equal(theme.strong.oklch.c,0);
  }
  const palette = [{id:'poor',light:'#888888'},{id:'passing',light:'#ffffff'}];
  const pick = entries => createResolver({palette:entries,foregrounds:['#777777'],contrastTarget:4}).resolve('brand');
  assert.equal(pick(palette).light.fill.hex,'#ffffff');
  assert.deepEqual(pick(palette),pick(palette.slice().reverse()));
  const fg = policy => createResolver({overrides:{fixed:'#ffffff'},foregrounds:['#555555','#000000'],
    foregroundPolicy:policy}).resolve('fixed').light.onFill.hex;
  assert.equal(fg('first-passing'),'#555555');
  assert.equal(fg('best'),'#000000');
});

test('selective output matches each full-result role and format', () => {
  for (const settings of [{}, {overrides: {sample: '#567abc'}}]) {
    const full = resolveTextColors('sample', settings);
    for (const theme of ['light', 'dark']) {
      for (const role of Object.keys(full[theme]).filter(key => key !== 'contrast')) {
        for (const format of ['hex', 'rgb', 'hsl', 'oklch']) {
          const only = {themes: [theme], roles: [role], formats: [format]};
          assert.deepEqual(resolveTextColors('sample', {...settings, only}), {
            [theme]: {[role]: {[format]: full[theme][role][format]}}
          });
        }
      }
    }
  }
});
