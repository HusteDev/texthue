import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {assignTextColors} from '../packages/npm/dist/index.js';

const cases = [3,6,12,30].map(n => ({texts:Array.from({length:n},(_,i)=>String(i))}));
cases.push({texts:['__proto__','constructor','B','b','B'],options:{normalize:{case:'lower'}}});
cases.push({texts:['free','fixed','fixed-2'],options:{overrides:{fixed:'#123456','fixed-2':{light:'#777777',dark:'#333333'}}}});
// Historical pairs from the library review. Keep each isolated to expose placement changes.
cases.push({texts:['item:33','item:633']}, {texts:['item:79','item:81']});
const pinned = assignTextColors(['one','two','three']).assignments;
cases.push({texts:['four','five','two','one'],pinned});
cases.push({texts:['pinned','free'],pinned:{
  pinned:{hueFraction:0.5,ring:Number.MAX_SAFE_INTEGER,moved:true}
}});
// Pins exercise exact warp knots that cannot all be represented by digest words.
const knots = Array.from({length:12}, (_, index) => [`knot-${index}`, index / 12]);
knots.push(['before-wrap', 1 - 2 ** -32]);
cases.push({
  texts: knots.map(([label]) => label),
  pinned: Object.fromEntries(knots.map(([label,hueFraction]) =>
    [label,{hueFraction,ring:0,moved:false}])),
});
const vectors = cases.map(item => {
  const {assignments,colors,report} = assignTextColors(item.texts,item.options,item.pinned);
  return {...item,assignments,report,lightFills:Object.fromEntries(
    Object.entries(colors).map(([text,set]) => [text,set.light.fill.hex]))};
});
const file = new URL('../conformance/assign-vectors.json',import.meta.url);
const json = JSON.stringify(vectors,null,2)+'\n';
if(process.argv[2]==='--write') await writeFile(file,json);
else if (process.argv[2] === '--check') {
  const frozen = JSON.parse(await readFile(file,'utf8'));
  assert.equal(vectors.length, frozen.length);
  for (const [index, vector] of vectors.entries()) {
    const expected = frozen[index].report.minDistance;
    if (typeof expected === 'number') {
      const actual = vector.report.minDistance;
      assert.ok(typeof actual === 'number' && Math.abs(actual - expected) <= 1e-12,
        `Case ${index}: minimum distance ${actual} differs from ${expected}`);
      vector.report.minDistance = expected;
    }
  }
  assert.deepEqual(JSON.parse(JSON.stringify(vectors)), frozen);
} else throw Error('Expected --check or --write');
