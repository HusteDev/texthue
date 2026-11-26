import { srgbToP3 } from './color-math.js';
import { fail } from './errors.js';
import { sha256 } from './sha256.js';
import type { Color, ColorSet } from './types.js';

export function toCss(
  color: Color,
  format: 'hex' | 'rgb' | 'hsl' | 'oklch' | 'p3' = 'hex',
): string {
  if (
    !color ||
    typeof color !== 'object' ||
    typeof color.hex !== 'string' ||
    !color.rgb ||
    !color.hsl ||
    !color.oklch
  )
    fail('INVALID_OPTIONS', 'Expected a rendered color');
  const { rgb, hsl, oklch } = color;
  switch (format) {
    case 'hex':
      return color.hex;
    case 'rgb':
      return `rgb(${rgb.r} ${rgb.g} ${rgb.b})`;
    case 'p3':
      return color.css ?? `color(display-p3 ${srgbToP3([rgb.r, rgb.g, rgb.b]).join(' ')})`;
    case 'hsl':
      return `hsl(${hsl.h} ${hsl.s}% ${hsl.l}%)`;
    case 'oklch':
      return `oklch(${oklch.l} ${oklch.c} ${oklch.h})`;
    default:
      fail('INVALID_OPTIONS', 'Unknown CSS format');
  }
}

export function cssVariables(
  colors: ColorSet,
  options: {
    prefix?: string;
    theme: 'light' | 'dark';
    slug: string;
    format?: Parameters<typeof toCss>[1];
  },
): Record<string, string> {
  if (!options || typeof options !== 'object') fail('INVALID_OPTIONS', 'Invalid CSS options');
  const { prefix = 'texthue', theme, slug, format = 'hex' } = options;
  if ((theme !== 'light' && theme !== 'dark') || typeof slug !== 'string')
    fail('INVALID_OPTIONS', 'Expected a theme and a string slug');
  if (typeof prefix !== 'string' || !/^[a-z][a-z0-9-]*$/.test(prefix))
    fail('INVALID_OPTIONS', 'Invalid CSS variable prefix');
  if (!colors?.[theme] || typeof colors[theme] !== 'object')
    fail('INVALID_OPTIONS', 'Expected a rendered theme');
  const suffix = sha256(new TextEncoder().encode(slug))
    .getUint32(0)
    .toString(16)
    .padStart(8, '0')
    .slice(0, 6);
  const stem =
    slug
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'label';
  const variables: Record<string, string> = {};
  for (const [role, value] of Object.entries(colors[theme])) {
    if (value && typeof value === 'object' && 'hex' in value) {
      const label = role.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
      variables[`--${prefix}-${stem}-${suffix}-${label}`] = toCss(value, format);
    }
  }
  return variables;
}
