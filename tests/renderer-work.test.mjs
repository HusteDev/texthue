import assert from 'node:assert/strict';
import test from 'node:test';
import {createResolver} from '../packages/npm/dist/index.js';
import {contrastWork,rendererWork} from '../tools/renderer-work.mjs';

test('individual tones stay within the conversion and contrast-repair budgets', async () => {
  for (const [label,target,adjusted] of [['item:0',4.5,false],['item:8',7,true],['item:13',7,true]]) {
    const resolver = createResolver({contrastTarget:target});
    const full = resolver.resolve(label).dark;
    assert.equal(full.contrast.fill.lightnessAdjusted,adjusted);
    assert.equal(full.contrast.fill.meetsTarget,true);
    const counts = await rendererWork(() => {
      assert.equal(resolver.hex(label,{theme:'dark',role:'fill'}),full.fill.hex);
    },['oklchToLinear']);
    assert.equal(counts.cusps,1);
    if (adjusted) {
      assert.ok(counts.fits > 1 && counts.fits <= 26, `${counts.fits} fits for a repaired tone`);
    } else {
      assert.equal(counts.fits,1);
      assert.equal(counts.oklchToLinear,21);
    }
  }
});

test('P3 projections run only the requested format conversions', async () => {
  const resolver = createResolver({gamut:'display-p3'});
  const counts = await rendererWork(() => {
    for (const formats of [['hex','rgb'], ['css','p3'], ['hsl'], ['oklch']]) {
      resolver.project('sample', {themes:['light'], roles:['fill'], formats});
    }
  }, ['hslFormat','oklchFormat','p3Fallback']);
  assert.equal(counts.hslFormat, 1);
  assert.equal(counts.oklchFormat, 1);
  assert.equal(counts.p3Fallback, 2);
});

test('single-label assignment renders the selected palette once', async () => {
  const resolver = createResolver();
  const single = await rendererWork(() => resolver.resolve('item:0'));
  const assigned = await rendererWork(() => resolver.assign(['item:0']));
  assert.ok(single.fits > 0);
  assert.equal(assigned.fits, single.fits);
});

test('renderer stays within measured work budgets across 100 two-theme identities', async () => {
  const limits = {default:1600, aaa:5732, maximum:12725, gray:2868, impossible:11452};
  const counts = await contrastWork();
  for (const [name, maxFits] of Object.entries(limits)) {
    const {fits,cusps,hashes} = counts[name];
    assert.ok(fits > 0 && fits <= maxFits, `${name}: ${fits} gamut fits exceed budget or missing`);
    assert.ok(cusps > 0 && cusps <= 1600, `${name}: ${cusps} cusp evaluations exceed budget or missing`);
    assert.equal(hashes,100, `${name}: expected one identity hash per resolve`);
  }
});

test('batch hashes each normalized identity once and isolates mutable results', async () => {
  const resolver = createResolver({normalize:{unicode:'NFC',case:'lower',whitespace:'trim'}});
  const labels = [' \u00c9 ', 'other', 'e\u0301', '\u00e9'];
  let palettes;
  const counts = await rendererWork(() => { palettes = resolver.batch(labels); });
  assert.equal(counts.hashes,2);
  assert.deepEqual(palettes, labels.map(resolver.resolve));
  palettes[0].light.fill.hex = '#000000';
  assert.equal(palettes[2].light.fill.hex,resolver.resolve('\u00e9').light.fill.hex);
});
