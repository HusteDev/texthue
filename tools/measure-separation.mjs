import assert from 'node:assert/strict';
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
  assert.equal(report.withinRingCapacity,true,`collection ${i}: ten labels exceed reported capacity`);
  if (process.argv.includes('--cases')) {
    const fills = labels.map(label => [colors[label].light.fill.hex,colors[label].dark.fill.hex]);
    cases.push({labels,assignments,fills,report});
  }
  for (const [theme, result] of Object.entries(totals)) {
    const fills = labels.map(label => colors[label][theme].fill.hex);
    const {pairs,stats,duplicates} = analyzePalette(fills);
    assert.equal(pairs.length,45,`collection ${i}, ${theme}: missing unordered pairs`);
    if (theme === 'light') {
      assert.equal(report.distinctFills,duplicates.length === 0);
      assert.equal(report.minDistance,stats.min);
      const nearest = pairs.filter(pair => pair.distance === stats.min)
        .map(pair => [labels[pair.first],labels[pair.second]].sort());
      assert.deepEqual(report.closestPairs.map(pair => [...pair].sort()).sort(),nearest.sort());
    }
    result.pairs += pairs.length;
    result.belowMinimum += pairs.filter(pair => pair.distance < 0.04).length;
    result.minimum = Math.min(result.minimum,stats.min);
  }
}
console.log(JSON.stringify(cases.length ? cases : totals));
// Each of the 300 sets must contribute all 45 unordered pairs in both themes.
if (Object.values(totals).some(result => result.pairs !== 13500 || result.belowMinimum > 0)) process.exitCode = 1;
