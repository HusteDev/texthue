export { default as initialize, initSync } from './dist/texthue.js';
export function roleHex(text: string, role: 'background' | 'subtle' | 'muted' | 'fill' | 'onFill' | 'fillHover' | 'fillActive' | 'border' | 'text' | 'strong', options?: {namespace?: string; seed?: number; theme?: 'light' | 'dark'}): string;

import type { ColorSet, TextColorOptions } from './dist/types.js';

type Options = Omit<TextColorOptions, 'paletteMode' | 'backgrounds'> & {backgrounds?: {light?: string; dark?: string}};
export interface Placement { hueFraction: number; ring: number; moved: boolean }
export function resolve(text: string, options?: Options): ColorSet;
export function assign(labels: readonly string[], options?: Options, pinned?: Record<string, Placement>): {
  assignments: Record<string, Placement>;
  colors: Record<string, ColorSet>;
  report: {minDistance: number | null; closestPairs: [string, string][]; withinRingCapacity: boolean; distinctFills: boolean};
};
