import assert from 'node:assert/strict';
import test from 'node:test';
import {createResolver} from 'texthue';
import {analyzePalette} from 'texthue/diagnostics';

test('vision assignment improves worst rendered separation and preserves registry and override placements', () => {
  const resolver = createResolver({overrides:{blue:'#335599'}});
  const labels = ['item:33','item:633'];
  const vision = ['normal','deutan'];
  function worst(result) {
    return Math.min(...vision.flatMap(profile => ['light','dark'].map(theme =>
      analyzePalette(labels.map(label => result.colors[label][theme].fill.hex),profile).stats.min)));
  }
  const initial = resolver.assign(labels,{vision});
  assert.ok(worst(initial) > worst(resolver.assign(labels)));
  assert.deepEqual(initial,resolver.assign([...labels].reverse(),{vision}));
  const extended = resolver.assign(['blue','new'],{vision,pinned:initial.assignments});
  for (const label of labels) assert.deepEqual(extended.assignments[label],initial.assignments[label]);
  assert.equal(extended.colors.blue.light.fill.hex,'#335599');
  for (const invalid of [[], null, 'deutan', ['other']]) assert.throws(() => resolver.assign([],{vision:invalid}));
});
