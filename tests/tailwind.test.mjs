import assert from 'node:assert/strict';
import test from 'node:test';
import {labelColors, namedLabelColors} from '@texthue/tailwind';
import {createResolver, cssVariables} from 'texthue';

test('Tailwind tokens reproduce assigned colors across themes and normalized aliases', () => {
  const labels = ['research','Design','design','__proto__','A B','A-B'];
  const options = {normalize:{case:'lower'}};
  const {colors} = createResolver(options).assign(labels);
  for (const theme of ['light','dark']) {
    const tokens = labelColors(labels,options,theme);
    const expected = Object.entries(colors).flatMap(([slug, set]) =>
      Object.entries(cssVariables(set,{slug,theme})).map(([key,value]) => [key.slice(2),value]));
    assert.deepEqual({...tokens},Object.fromEntries(expected));
    assert.deepEqual(tokens,labelColors([...labels].reverse(),options,theme));
  }
});

test('named tokens support both themes and normalized input aliases', () => {
  const options = {normalize: {whitespace: 'trim'}};
  const labels = {issue: ' Bug ', docs: 'Documentation'};
  const {colorsByInput} = createResolver(options).assign(Object.values(labels));
  const tokens = namedLabelColors(labels, options);
  for (const theme of ['light','dark']) {
    assert.equal(tokens[`texthue-issue-${theme}-fill`], colorsByInput[' Bug '][theme].fill.hex);
    assert.equal(tokens[`texthue-docs-${theme}-on-fill`], colorsByInput.Documentation[theme].onFill.hex);
  }
  assert.throws(() => namedLabelColors({'bad alias': 'label'}), {code:'INVALID_OPTIONS'});
});
