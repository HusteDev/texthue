import assert from 'node:assert/strict';
import {labelColors} from '@texthue/tailwind';
import postcss from 'postcss';
import tailwindcss from 'tailwindcss';
import {createResolver, cssVariables} from 'texthue';

const labels = ['research', 'design'];
const options = {overrides: {research: {light:'#123456', dark:'#abcdef'}}};
const assigned = createResolver(options).assign(labels).colors;
for (const theme of ['light', 'dark']) {
  const colors = labelColors(labels, options, theme);
  const expected = Object.entries(assigned).flatMap(([slug, palette]) =>
    Object.entries(cssVariables(palette, {slug, theme})).map(([variable, value]) => [variable.slice(2), value]));
  assert.deepEqual({...colors}, Object.fromEntries(expected));
  const classes = expected.map(([token]) => `bg-${token}`);
  const config = {
    content: [{raw: `<div class="${classes.join(' ')}"></div>`, extension: 'html'}],
    theme: {extend: {colors}},
    corePlugins: {backgroundOpacity: false},
  };
  const result = await postcss([tailwindcss(config)]).process('@tailwind utilities;', {from: undefined});
  for (const [token, hex] of expected) {
    const values = [];
    result.root.walkRules(`.bg-${token}`, rule => {
      rule.walkDecls('background-color', declaration => values.push(declaration.value));
    });
    assert.deepEqual(values, [hex]);
  }
}
