import assert from 'node:assert/strict';
import test from 'node:test';
import {labelColors} from '@texthue/tailwind';
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
