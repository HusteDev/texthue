// Resolve one string and print every role in every output format for both themes.
import { resolveTextColors } from 'texthue';

const colors = resolveTextColors('research');
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
