// npm ci installs the locked development oracle.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {APCAcontrast,sRGBtoY} from 'apca-w3';

let state = 571;
function byte() {
  state = (Math.imul(state,1664525)+1013904223)>>>0;
  return state>>>24;
}
const gray = v=>[v,v,v];
const pairs = [[0,255],[255,0],[20,21],[200,200],[245,255],[32,70],[70,32]].map(([a,b])=>[gray(a),gray(b)]);
for (let i=0;i<1000;i++) pairs.push([Array.from({length:3},byte),Array.from({length:3},byte)]);
const rows = pairs.map(([fg,bg])=>JSON.stringify([...fg,...bg,APCAcontrast(sRGBtoY(fg),sRGBtoY(bg))]));
const expected = `[\n${rows.join(',\n')}\n]\n`;
const path = new URL('../conformance/apca-srgb-v1.json',import.meta.url);
if (process.argv[2]==='--write') await writeFile(path,expected);
else if (process.argv[2] === '--check') {
  const frozen = JSON.parse(await readFile(path,'utf8'));
  const generated = JSON.parse(expected);
  assert.equal(generated.length, frozen.length);
  for (const [i, row] of generated.entries()) {
    assert.deepEqual(row.slice(0,6), frozen[i].slice(0,6));
    assert.equal(frozen[i].length, 7);
    assert.ok(typeof frozen[i][6] === 'number' && Math.abs(row[6] - frozen[i][6]) <= 1e-12,
      `APCA row ${i}: ${row[6]} differs from ${frozen[i][6]}`);
  }
} else throw new Error('Expected --check or --write');
