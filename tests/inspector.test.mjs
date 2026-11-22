import assert from 'node:assert/strict';
import test from 'node:test';
import {inspect} from '../site/inspect.mjs';

test('inspector compares placements and preserves a registry across label changes', () => {
  const input = {labels:['design','research'], options:{}, theme:'light', vision:'normal'};
  const first = inspect(input);
  const next = inspect({...input, labels:['research','new'], theme:'dark', vision:'deutan', registry:first.registry});
  assert.ok(Object.hasOwn(first.registry.assignments,'research'));
  assert.deepEqual(next.registry.assignments.research,first.registry.assignments.research);
  assert.deepEqual(next.registry.assignments.design,first.registry.assignments.design);
  assert.equal(next.rows.length,2);
  assert.equal(next.diagnostics.pairs.length,1);
  for (const row of next.rows) {
    assert.equal(row.swatches.length,3);
    for (const hex of row.swatches) assert.match(hex,/^#[0-9a-f]{6}$/);
    assert.ok(Object.hasOwn(row.contrast,'textOnSubtle'));
  }
  assert.throws(() => inspect({...input, registry:{...first.registry,fingerprint:'invalid'}}));
});

test('inspector replays exported configuration and registry JSON and rejects altered configuration', () => {
  const input = {labels:['pear','apple'], options:{namespace:'orchard'}, theme:'dark', vision:'tritan'};
  const original = inspect(input);
  const options = JSON.parse(JSON.stringify(original.config));
  const registry = JSON.parse(JSON.stringify(original.registry));
  assert.deepEqual(inspect({...input, options, registry}), original);
  options.options.namespace = 'different';
  assert.throws(() => inspect({...input, options}), /fingerprint/i);
});

test('inspector traces the placed registry fill for moved labels and supplied colors', () => {
  const labels = Array.from({length:30}, (_, i) => String(i));
  const input = {labels,options:{overrides:{0:'#abcdef'}},theme:'dark',vision:'normal'};
  const {rows,registry} = inspect(input);
  assert.ok(rows.some(row => registry.assignments[row.label].moved && row.swatches[0] !== row.swatches[2]));
  for (const row of rows) assert.equal(row.registryFillTrace.hex,row.swatches[2]);
  assert.deepEqual(rows.find(row => row.label === '0').registryFillTrace.trace,{source:'supplied',hex:'#abcdef'});
  assert.equal(rows.find(row => row.label === '1').registryFillTrace.trace.source,'generated');
});

test('inspector can preview a simulation independently of optimizing new placements', () => {
  const input = {labels:['item:33','item:633'],options:{},theme:'dark',vision:'deutan'};
  const plain = inspect(input);
  const normal = inspect({...input,vision:'normal'});
  assert.deepEqual(plain.registry,normal.registry);
  const optimized = inspect({...input,optimizeVision:true});
  assert.notDeepEqual(optimized.registry,plain.registry);
  assert.ok(optimized.diagnostics.stats.min > plain.diagnostics.stats.min);
  const replay = inspect({...input,registry:optimized.registry});
  assert.deepEqual(replay.registry,optimized.registry);
  assert.deepEqual(replay.rows.map(row => row.swatches[2]),optimized.rows.map(row => row.swatches[2]));
});
