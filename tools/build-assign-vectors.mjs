import {readFile,writeFile} from 'node:fs/promises';
import {assignTextColors} from '../packages/npm/dist/index.js';

const cases = [3,6,12,30].map(n => ({texts:Array.from({length:n},(_,i)=>String(i))}));
cases.push({texts:['__proto__','constructor','B','b','B'],options:{normalize:{case:'lower'}}});
const pinned = assignTextColors(['one','two','three']).assignments;
cases.push({texts:['four','five','two','one'],pinned});
const vectors = cases.map(item => {
  const {assignments,colors,report} = assignTextColors(item.texts,item.options,item.pinned);
  return {...item,assignments,report,lightFills:Object.fromEntries(
    Object.entries(colors).map(([text,set]) => [text,set.light.fill.hex]))};
});
const file = new URL('../conformance/assign-vectors.json',import.meta.url);
const json = JSON.stringify(vectors,null,2)+'\n';
if(process.argv[2]==='--write') await writeFile(file,json);
else if(process.argv[2]!=='--check' || (await readFile(file,'utf8')).replaceAll('\r\n','\n')!==json) throw Error('Assignment fixtures differ');
