// Render a badge in each theme and check its documented fill.
import assert from 'node:assert/strict';
import { createResolver } from 'texthue';

const colors = createResolver().resolve('research');
assert.equal(colors.light.fill.hex, '#59b8d8');
assert.equal(colors.dark.fill.hex, '#255464');
console.log('Algorithm:', colors.version);
for (const themeName of ['light', 'dark']) {
  const theme = colors[themeName];
  const { rgb, hsl, oklch } = theme.fill;
  console.log(themeName, {
    hex: theme.fill.hex,
    rgb: `rgb(${rgb.r} ${rgb.g} ${rgb.b})`,
    hsl: `hsl(${hsl.h} ${hsl.s}% ${hsl.l}%)`,
    oklch: `oklch(${oklch.l} ${oklch.c} ${oklch.h})`,
    onFill: theme.onFill.hex,
    text: theme.text.hex,
    background: theme.background.hex,
  });
}
