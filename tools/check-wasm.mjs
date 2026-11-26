import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {assign, initSync, resolve, roleHex} from '../packages/wasm/index.js';

initSync({module: await readFile(new URL('../packages/wasm/dist/texthue_bg.wasm', import.meta.url))});
const {vectors} = JSON.parse(await readFile(new URL('../conformance/vectors.json', import.meta.url), 'utf8'));
let checks = 0;
for (const {text, options, expected} of vectors) {
  if (Object.keys(options).some(key => !['namespace', 'seed'].includes(key))) continue;
  for (const theme of ['light', 'dark']) {
    for (const [role, color] of Object.entries(expected[theme])) {
      if (role === 'contrast') continue;
      assert.equal(roleHex(text, role, {...options, theme}), color.hex);
      checks++;
    }
  }
}
assert.equal(checks, 400);
assert.throws(() => roleHex('x', 'invalid'));
assert.throws(() => roleHex('\ud800', 'fill'), TypeError);
assert.throws(() => roleHex('x', 'fill', {seed: -1}), RangeError);
console.log(`Passed ${checks} WebAssembly role comparisons`);

const options = {gamut:'display-p3', contrastModel:'apca', overrides:{badge:'#1177cc'}};
const palette = resolve('badge', options);
assert.equal(palette.light.fill.hex, '#1177cc');
assert.equal(palette.light.contrast.fill.model, 'apca');
assert.match(palette.dark.fill.css, /^color\(display-p3 /);
const original = assign(['a','b','c'], options);
const extended = assign(['a','d'], options, original.assignments);
assert.deepEqual(extended.colors.a,original.colors.a);
assert.deepEqual(extended.assignments.b,original.assignments.b);
assert.throws(() => resolve('badge', {unsupported:true}), {code:'INVALID_OPTIONS'});
