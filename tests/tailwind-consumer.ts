import {labelColors} from '@texthue/tailwind';
import type {Config} from 'tailwindcss';

const labels = ['research', 'design'] as const;
export default {
  content: ['./src/**/*.html'],
  theme: {extend: {colors: labelColors(labels, {preset: 'chart'}, 'dark')}},
} satisfies Config;

// @ts-expect-error Only the two renderer themes are supported.
labelColors(labels, {}, 'print');
// @ts-expect-error Use a numeric seed.
labelColors(labels, {seed: '42'});
