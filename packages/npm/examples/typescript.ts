// Use the public types: `satisfies` for options, typed results, and narrowing errors.
import { type Color, type ColorSet, resolveTextColors, TextColorError, type TextColorOptions } from 'texthue';

const options = {
  namespace: 'labels',
  backgrounds: { light: '#ffffff', dark: '#121212' },
  contrastTarget: 4.5,
  profiles: { light: { fill: { lightness: [0.72, 0.82], chromaScale: [0.10, 0.16] } } },
} satisfies TextColorOptions;

/** Formats a color as a CSS `oklch()` value. */
function css(color: Color): string {
  return `oklch(${color.oklch.l} ${color.oklch.c} ${color.oklch.h})`;
}

try {
  const colors: ColorSet = resolveTextColors('research', options);
  console.log(css(colors.light.fill), colors.light.onFill.hex);
} catch (error: unknown) {
  if (error instanceof TextColorError) console.error(error.code, error.message);
  else throw error;
}
