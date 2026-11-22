import {performance} from 'node:perf_hooks';
import {inspect} from '../site/inspect.mjs';

const iterations = 20;
for (const size of [12, 100, 250]) {
  const labels = Array.from({length:size}, (_, i) => 'item:' + i);
  const input = {labels, options:{}, theme:'dark', vision:'deutan'};
  const {registry} = inspect({...input, labels:labels.slice(0, size / 2)});
  for (const saved of [undefined, registry]) {
    const scenario = {...input, registry:saved};
    inspect(scenario);
    const times = [];
    for (let i = 0; i < iterations; i++) {
      const start = performance.now();
      inspect(scenario);
      times.push(performance.now() - start);
    }
    times.sort((a,b) => a-b);
    console.log(JSON.stringify({size, registry:Boolean(saved), iterations,
      medianMs:Math.round((times[9]+times[10])/2), p95Ms:Math.round(times[18])}));
  }
}
