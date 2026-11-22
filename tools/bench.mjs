import {performance} from 'node:perf_hooks';
import {createResolver} from '../packages/npm/dist/index.js';
import {contrastWork} from './renderer-work.mjs';

for (const [scenario,target,light,options] of [
  ['default',4.5,'#ffffff'], ['aaa',7,'#ffffff'], ['maximum',21,'#ffffff'],
  ['gray',4.5,'#777777'], ['impossible',21,'#777777'],
  ['apca',75,'#ffffff',{contrastModel:'apca'}],
  ['p3',4.5,'#ffffff',{gamut:'display-p3'}],
]) {
  const resolver = createResolver({contrastTarget:target, backgrounds:{light}, ...options});
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
const labels = Array.from({length:40}, (_, i) => `item:${i}`);
const resolver = createResolver();
const samples = [];
for (let i = -5; i < 20; i++) {
  const start = performance.now();
  resolver.assign(labels);
  if (i >= 0) samples.push((performance.now()-start)*1000);
}
samples.sort((a,b) => a-b);
console.log(JSON.stringify({scenario:'assign40',medianUs:(samples[9]+samples[10])/2,p95Us:samples[18]}));
