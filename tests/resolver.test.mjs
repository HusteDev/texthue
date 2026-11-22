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

test('strict hex enforces only the selected role requirements', () => {
  const resolver = createResolver({
    overrides: {sample: '#777777'}, foregrounds: ['#777777'],
    backgrounds: {light: '#ffffff'}, contrastTargets: {text: 1, textOnSubtle: 21}
  });
  const full = resolver.resolve('sample').light;
  assert.equal(full.contrast.fill.meetsTarget, false);
  assert.equal(full.contrast.text.meetsTarget, true);
  assert.equal(full.contrast.textOnSubtle.meetsTarget, false);
  for (const role of ['fill', 'onFill', 'text']) {
    assert.equal(resolver.hex('sample', {theme:'light',role}), full[role].hex);
    assert.throws(() => resolver.hex('sample', {theme:'light',role,strict:true}), {code:'UNMET_CONSTRAINT'});
  }
  assert.equal(resolver.hex('sample', {theme:'light',role:'border',strict:true}), full.border.hex);
  assert.throws(() => resolver.hex('sample', {theme:'light',role:'text',strict:1}), {code:'INVALID_OPTIONS'});
});

test('configuration round trips validate portable fingerprints', async () => {
  const {readFile} = await import('node:fs/promises');
  const {importConfig, exportConfig} = await import('../packages/npm/dist/index.js');
  const saved = JSON.parse(await readFile(new URL('../conformance/config-v1.json',import.meta.url),'utf8'));
  const restored = importConfig(saved);
  assert.deepEqual(exportConfig(restored),saved);
  assert.deepEqual(restored.resolve('🐈'),createResolver(saved.options).resolve('🐈'));
  saved.options.seed--;
  assert.throws(() => importConfig(saved),{code:'INVALID_OPTIONS'});
  const a = {id:'a', light:'#abcdef'}, b = {id:'b',dark:'#ffffff'};
  assert.equal(createResolver({palette:[a,b]}).exportConfig().fingerprint,
    createResolver({palette:[b,a]}).exportConfig().fingerprint);
  assert.throws(() => importConfig({...saved,schema:'unknown'}),{code:'INVALID_OPTIONS'});
});

test('registry replay preserves absent labels and rejects incompatible configurations', async () => {
  const {readFile} = await import('node:fs/promises');
  const saved = JSON.parse(await readFile(new URL('../conformance/registry-v1.json',import.meta.url),'utf8'));
  const r = createResolver({seed:123});
  const pins = r.importRegistry(saved);
  const next = r.assign(['new','old'],{pinned:pins});
  assert.deepEqual(next.colors.old,r.assign(Object.keys(saved.assignments)).colors.old);
  for (const [key,p] of Object.entries(saved.assignments)) assert.deepEqual(next.assignments[key],p);
  assert.deepEqual(JSON.parse(JSON.stringify(r.exportRegistry(pins))),saved);
  assert.throws(()=>createResolver().importRegistry(saved),{code:'INVALID_OPTIONS'});
  delete saved.assignments.old.moved;
  assert.throws(()=>r.importRegistry(saved),{code:'INVALID_OPTIONS'});
});
