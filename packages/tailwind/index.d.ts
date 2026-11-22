import type {TextColorOptions} from 'texthue';

export function labelColors(
  labels: readonly string[],
  options?: TextColorOptions,
  theme?: 'light' | 'dark',
): Record<string, string>;
