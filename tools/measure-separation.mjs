import {analyzePalette} from '../packages/npm/dist/diagnostics.js';
import {createResolver} from '../packages/npm/dist/index.js';

const resolver = createResolver();
let seed = 4217;
const cases = [];
const totals = Object.fromEntries(['light','dark'].map(theme =>
  [theme,{pairs:0,belowMinimum:0,minimum:Infinity}]));
for (let i = 0; i < 300; i++) {
  const labels = Array.from({length:10}, () => {
    seed = (Math.imul(seed,1664525) + 1013904223) >>> 0;
    return String(seed);
  });
  const {colors,assignments,report} = resolver.assign(labels);
  if (process.argv.includes('--cases')) {
    const fills = labels.map(label => [colors[label].light.fill.hex,colors[label].dark.fill.hex]);
    cases.push({labels,assignments,fills,report});
  }
  for (const [theme, result] of Object.entries(totals)) {
    const fills = Object.values(colors).map(set => set[theme].fill.hex);
    const {pairs,stats} = analyzePalette(fills);
    result.pairs += pairs.length;
    result.belowMinimum += pairs.filter(pair => pair.distance < 0.04).length;
    result.minimum = Math.min(result.minimum,stats.min);
  }
}
console.log(JSON.stringify(cases.length ? cases : totals));
if (Object.values(totals).some(result => result.belowMinimum > 0)) process.exitCode = 1;
