import {performance} from 'node:perf_hooks';
import {createResolver} from '../packages/npm/dist/index.js';
import {contrastWork} from './renderer-work.mjs';

for (const [scenario,target,light] of [
  ['default',4.5,'#ffffff'], ['aaa',7,'#ffffff'], ['maximum',21,'#ffffff'],
  ['gray',4.5,'#777777'], ['impossible',21,'#777777'],
]) {
  const resolver = createResolver({contrastTarget:target, backgrounds:{light}});
  const samples = [];
  for (let i = -20; i < 100; i++) {
    const start = performance.now();
    resolver.resolve(`item:${i}`);
    if (i >= 0) samples.push((performance.now()-start)*1000);
  }
  samples.sort((a,b) => a-b);
  console.log(JSON.stringify({scenario,medianUs:(samples[49]+samples[50])/2,p95Us:samples[94]}));
}
console.log(JSON.stringify({workPer100Labels:await contrastWork()}));
