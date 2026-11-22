import assert from 'node:assert/strict';
import test from 'node:test';
import { simulateVision } from 'texthue/diagnostics';

test('Machado linear sRGB projections at both supported severities', () => {
  for (const [model, severity, expected] of [["protan", 0.5, "#6499e0"], ["protan", 1.0, "#7a9be1"], ["deutan", 0.5, "#5691de"], ["deutan", 1.0, "#608bdd"], ["tritan", 0.5, "#009fcf"], ["tritan", 1.0, "#00abb2"]]) {
    assert.equal(simulateVision('#249ade', model, severity), expected);
    for (const neutral of ['#000000','#777777','#ffffff']) assert.equal(simulateVision(neutral, model, severity), neutral);
  }
  assert.throws(() => simulateVision('#fff', 'protan'));
  assert.throws(() => simulateVision('#ffffff', 'constructor'));
  assert.throws(() => simulateVision('#ffffff', 'deutan', 0.7));
});
