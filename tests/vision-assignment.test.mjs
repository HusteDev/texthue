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

test('bounded vision search separates the two review collections in both themes', () => {
  const resolver = createResolver();
  const collections = [
    ['Alice','Bob','Carol','Dave','Eve','Frank','Grace','Heidi','Ivan','Judy','Mallory','Oscar'],
    ['bug','documentation','duplicate','enhancement','good first issue','help wanted','invalid','question','wontfix'],
  ];
  for (const labels of collections) {
    for (const profile of ['protan','deutan','tritan']) {
      const vision = ['normal',profile];
      const {colors,report} = resolver.assign(labels,{vision});
      assert.equal(report.searches.length,labels.length);
      for (const search of report.searches) {
        assert.ok(search.colorsEvaluated <= search.positionsConsidered && search.positionsConsidered <= 24);
      }
      for (const theme of ['light','dark']) {
        const fills = labels.map(label => colors[label][theme].fill.hex);
        for (const view of vision) {
          assert.ok(analyzePalette(fills,view).stats.min >= 0.04,`${labels[0]} ${theme} ${view}`);
        }
      }
    }
  }
});
