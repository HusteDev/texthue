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

test('migration compares both normalization policies without counting aliases as collisions', async () => {
  const {compareAssignments} = await import('../packages/npm/dist/index.js');
  const old = createResolver();
  const next = createResolver({normalize:{case:'lower'}});
  const registry = next.exportRegistry(next.assign(['a']).assignments);
  const snapshot = JSON.stringify(registry);
  const result = compareAssignments({resolver:old},{resolver:next,registry},['a','A','A']);
  assert.ok(result.moved.includes('A'));
  assert.deepEqual(result.collisions.after,[]);
  assert.equal(JSON.stringify(registry),snapshot);
  const same = compareAssignments({resolver:next,registry},{resolver:next,registry},['a','A']);
  assert.deepEqual(same,{moved:[],colors:[],contrast:[],collisions:{before:[],after:[]}});
});

test('linear-light compositing produces a reusable opaque background', async () => {
  const {compositeOver} = await import('../packages/npm/dist/index.js');
  const {readFile} = await import('node:fs/promises');
  const cases = JSON.parse(await readFile(new URL('../conformance/composite-v1.json',import.meta.url),'utf8'));
  for (const {source,alpha,backdrop,expected} of cases) {
    const colors = resolveTextColors('blend',{backgrounds:{light:source,dark:backdrop}});
    const result = compositeOver(colors.light.background,alpha,colors.dark.background);
    assert.equal(result.hex,expected);
    assert.deepEqual(resolveTextColors('blend',{backgrounds:{light:result}}).light.background,result);
    for (const invalid of [NaN, Infinity, -0.1, 1.1]) {
      assert.throws(()=>compositeOver(result,invalid,result),{code:'INVALID_OPTIONS'});
    }
  }
});

test('signed APCA matches pinned reference on opaque sRGB pairs', async () => {
  const {measureApca} = await import('../packages/npm/dist/index.js');
  const {readFile} = await import('node:fs/promises');
  const rows = JSON.parse(await readFile(new URL('../conformance/apca-srgb-v1.json',import.meta.url),'utf8'));
  for (const [r,g,b,br,bg,bb,expected] of rows) {
    assert.ok(Math.abs(measureApca({rgb:{r,g,b}},{rgb:{r:br,g:bg,b:bb}})-expected)<1e-10);
  }
});

test('APCA resolver measures final pairs with the text first and verifies strict text targets', async () => {
  const {measureApca,importConfig} = await import('../packages/npm/dist/index.js');
  for (const target of [0,45,60,75,90,106]) {
    const r = createResolver({contrastModel:'apca',contrastTarget:target});
    const result = r.resolve('APCA');
    assert.deepEqual(importConfig(r.exportConfig()).resolve('APCA'),result);
    for (const name of ['light','dark']) {
      const t = result[name];
      for (const [pair,text,bg] of [
        ['fill',t.onFill,t.fill],['fillHover',t.onFill,t.fillHover],['fillActive',t.onFill,t.fillActive],
        ['border',t.border,t.background],['text',t.text,t.background],['textOnSubtle',t.text,t.subtle],
        ['strong',t.strong,t.background]
      ]) {
        const measured = measureApca(text,bg);
        assert.equal(t.contrast[pair].model,'apca');
        assert.equal(t.contrast[pair].value,measured);
        assert.equal(t.contrast[pair].meetsTarget,Math.abs(measured)>=target);
        assert.ok(t.contrast[pair].ratio >= 1 && t.contrast[pair].ratio <= 21);
      }
      if (t.contrast.text.meetsTarget && t.contrast.textOnSubtle.meetsTarget)
        assert.equal(r.hex('APCA',{theme:name,role:'text',strict:true}),t.text.hex);
      else assert.throws(()=>r.hex('APCA',{theme:name,role:'text',strict:true}),{code:'UNMET_CONSTRAINT'});
    }
  }
  const impossible = createResolver({contrastModel:'apca',contrastTarget:106,overrides:{fixed:'#777777'},foregrounds:['#777777']});
  assert.equal(impossible.resolve('fixed').light.contrast.fill.fallback,'palette-constraint');
  assert.throws(()=>impossible.hex('fixed',{theme:'light',role:'fill',strict:true}),{code:'UNMET_CONSTRAINT'});
  for (const targets of [{text:0,textOnSubtle:75},{text:75,textOnSubtle:0}]) {
    const light = createResolver({contrastModel:'apca',contrastTargets:targets}).resolve('APCA').light;
    assert.equal(light.contrast.text.meetsTarget,true);
    assert.equal(light.contrast.textOnSubtle.meetsTarget,true);
  }
  assert.throws(()=>createResolver({contrastModel:'apca',contrastTarget:107}),{code:'INVALID_OPTIONS'});
});

test('APCA approved palette and foreground preference use Lc thresholds', () => {
  const resolver = createResolver({
    contrastModel:'apca',contrastTarget:60,foregroundPolicy:'first-passing',
    foregrounds:['#777777','#000000'],
    palette:[{id:'gray',light:'#888888'},{id:'white',light:'#ffffff'}]
  });
  const theme = resolver.resolve('approved').light;
  assert.equal(theme.fill.hex,'#ffffff');
  assert.equal(theme.onFill.hex,'#777777');
  assert.ok(theme.contrast.fill.value>=60);
  assert.equal(theme.contrast.fill.meetsTarget,true);
});

test('Display-P3 fits and clipped sRGB fallbacks match Color.js', async () => {
  const {fitColor,XYZ_TO_P3,p3Fallback,cusp} = await import('../packages/npm/dist/color-math.js');
  const {readFile} = await import('node:fs/promises');
  const rows=JSON.parse(await readFile(new URL('../conformance/p3-fit-v1.json',import.meta.url),'utf8'));
  for(const row of rows) {
    const fit=fitColor(row.l,row.c,row.h,XYZ_TO_P3);
    assert.deepEqual(fit.rgb,row.rgb);
    assert.deepEqual(p3Fallback(fit.rgb),{rgb:row.fallback,srgbClipped:row.clipped});
  }
  const {toCss} = await import('../packages/npm/dist/index.js');
  const red = resolveTextColors('red',{backgrounds:{light:'#ff0000'}}).light.background;
  assert.equal(toCss(red,'p3'),'color(display-p3 0.917488 0.200287 0.138561)');
  assert.ok(cusp(.7,145,XYZ_TO_P3)>cusp(.7,145));
});
