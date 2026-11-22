import { srgbToP3 } from './color-math.js';
import { sha256 } from './sha256.js';
import type { Color, ColorSet } from './types.js';

export function toCss(color: Color, format: 'hex'|'rgb'|'hsl'|'oklch'|'p3' = 'hex'): string {
  const {rgb,hsl,oklch} = color;
  switch(format) {
    case 'hex': return color.hex;
    case 'rgb': return `rgb(${rgb.r} ${rgb.g} ${rgb.b})`;
    case 'p3': return color.css ?? `color(display-p3 ${srgbToP3([rgb.r,rgb.g,rgb.b]).join(' ')})`;
    case 'hsl': return `hsl(${hsl.h} ${hsl.s}% ${hsl.l}%)`;
    case 'oklch': return `oklch(${oklch.l} ${oklch.c} ${oklch.h})`;
    default: throw new TypeError('Unknown CSS format');
  }
}

export function cssVariables(colors:ColorSet, {prefix='texthue',theme,slug,format='hex'}:{
  prefix?:string;theme:'light'|'dark';slug:string;format?:Parameters<typeof toCss>[1]
}):Record<string,string> {
  if (!/^[a-z][a-z0-9-]*$/.test(prefix)) throw new TypeError('Invalid CSS variable prefix');
  const suffix = sha256(new TextEncoder().encode(slug)).getUint32(0).toString(16).padStart(8,'0').slice(0,6);
  const stem = slug.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'') || 'label';
  const variables:Record<string,string> = {};
  for (const [role,value] of Object.entries(colors[theme])) {
    if ('hex' in value) {
      const label = role.replace(/[A-Z]/g,c=>`-${c.toLowerCase()}`);
      variables[`--${prefix}-${stem}-${suffix}-${label}`] = toCss(value,format);
    }
  }
  return variables;
}
