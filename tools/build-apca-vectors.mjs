// Regenerate with the published reference package outside consumer dependencies:
// npm install --prefix .cache/apca-oracle --no-save --ignore-scripts apca-w3@0.1.9
import {readFile,writeFile} from 'node:fs/promises';
import {APCAcontrast,sRGBtoY} from '../.cache/apca-oracle/node_modules/apca-w3/src/apca-w3.js';

const manifest = new URL('../.cache/apca-oracle/node_modules/apca-w3/package.json',import.meta.url);
if (JSON.parse(await readFile(manifest,'utf8')).version !== '0.1.9') throw new Error('Expected apca-w3@0.1.9');

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
else if (process.argv[2]!=='--check' || (await readFile(path,'utf8')).replaceAll('\r\n','\n')!==expected) throw new Error('APCA corpus mismatch or missing --check/--write');
