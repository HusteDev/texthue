import assert from 'node:assert/strict';
import {labelColors} from '@texthue/tailwind';
import postcss from 'postcss';
import tailwindcss from 'tailwindcss';

for (const theme of ['light', 'dark']) {
  const colors = labelColors(['research', 'design'], {}, theme);
  const fills = Object.entries(colors).filter(([key]) => key.endsWith('-fill') && !key.endsWith('-on-fill'));
  assert.equal(fills.length, 2);
  const classes = fills.map(([token]) => `bg-${token}`);
  const config = {
    content: [{raw: `<div class="${classes.join(' ')}"></div>`, extension: 'html'}],
    theme: {extend: {colors}},
    corePlugins: {backgroundOpacity: false},
  };
  const result = await postcss([tailwindcss(config)]).process('@tailwind utilities;', {from: undefined});
  for (const [token, hex] of fills) {
    const values = [];
    result.root.walkRules(`.bg-${token}`, rule => {
      rule.walkDecls('background-color', declaration => values.push(declaration.value));
    });
    assert.deepEqual(values, [hex]);
  }
}
