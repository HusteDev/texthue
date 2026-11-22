import assert from 'node:assert/strict';
import test from 'node:test';
import {createResolver} from '../packages/npm/dist/index.js';
import {contrastWork,rendererWork} from '../tools/renderer-work.mjs';

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
