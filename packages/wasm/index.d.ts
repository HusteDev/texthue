export { default as initialize, initSync } from './dist/texthue.js';
export function roleHex(text: string, role: 'background' | 'subtle' | 'muted' | 'fill' | 'onFill' | 'fillHover' | 'fillActive' | 'border' | 'text' | 'strong', options?: {namespace?: string; seed?: number; theme?: 'light' | 'dark'}): string;
