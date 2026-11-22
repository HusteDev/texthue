import assert from 'node:assert/strict';
import test from 'node:test';
import {inspect} from '../site/inspect.mjs';

test('registry fill visibility is measured separately from text contrast and vision previews', () => {
  const input = {labels:['badge'],options:{overrides:{badge:'#ffffff'},backgrounds:{light:'#ffffff',dark:'#000000'}},vision:'deutan'};
  const light = inspect({...input,theme:'light'}).rows[0];
  assert.equal(light.fillOnBackground.srgbRatio,1);
  assert.equal(light.contrast.fill.ratio,21);
  const dark = inspect({...input,theme:'dark',options:{...input.options,gamut:'display-p3'}}).rows[0];
  assert.equal(dark.fillOnBackground.srgbRatio,21);
  assert.ok(Math.abs(dark.fillOnBackground.displayP3LuminanceRatio - 21) < 1e-10);
});

test('supplied P3 fills retain fractional channels when measuring visibility', () => {
  const options = {gamut:'display-p3', overrides:{badge:'#ff0000'}, backgrounds:{light:'#000000'}};
  const {rows:[row]} = inspect({labels:['badge'],options,theme:'light',vision:'normal'});
  // Converting sRGB red to Display-P3 preserves its XYZ Y coordinate.
  const expected = (87098 / 409605 + 0.05) / 0.05;
  // The inspector reads the six-decimal channels emitted for CSS.
  assert.ok(Math.abs(row.fillOnBackground.displayP3LuminanceRatio - expected) < 0.00001);
});

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

test('inspector distinguishes normalized aliases, duplicate fills and pairs below a chosen distance', () => {
  const input = {labels:['A','a','A','b','c'],options:{normalize:{case:'lower'},
    overrides:{a:'#112233',b:'#112233',c:'#112234'}},theme:'light',vision:'normal'};
  const {findings} = inspect({...input,minimumDistance:0.1});
  assert.deepEqual(findings.aliases,[{identity:'a',spellings:['A','a']}]);
  assert.deepEqual(findings.duplicates.map(pair => pair.sort()),[['a','b']]);
  assert.deepEqual(findings.closest.map(pair => pair.distance),[0]);
  assert.equal(findings.belowMinimum.length,3);
  assert.deepEqual(inspect(input).findings.belowMinimum,[]);
  assert.deepEqual(inspect({...input,labels:['A','a']}).findings.closest,[]);
  assert.throws(() => inspect({...input,minimumDistance:-1}),RangeError);
});

test('bounded search reports work separately from fixed or pinned collisions', () => {
  const input = {labels:['a','b'],options:{},theme:'light',vision:'deutan',optimizeVision:true,minimumDistance:2};
  const searched = inspect(input);
  const [failure] = searched.findings.exhaustedSearches;
  assert.equal(searched.findings.exhaustedSearches.length,1);
  assert.equal(failure.positionsConsidered,24);
  assert.ok(failure.colorsEvaluated > 0 && failure.colorsEvaluated <= 24);
  assert.ok(failure.bestDistance < input.minimumDistance);
  const replay = inspect({...input,registry:searched.registry});
  assert.equal(replay.findings.belowMinimum.length,1);
  assert.deepEqual(replay.findings.exhaustedSearches,[]);
  const fixed = inspect({...input,options:{overrides:{a:'#444444',b:'#444444'}}});
  assert.equal(fixed.findings.duplicates.length,1);
  assert.deepEqual(fixed.findings.exhaustedSearches,[]);
});
