// Compile-time checks on the public declarations. Valid usage must type-check
// and each `@ts-expect-error` line must fail to compile. Nothing here runs.
import { type ColorSet, resolveTextColors, type TextColorOptions } from 'texthue';

const options: TextColorOptions = { profiles: { dark: { fill: { chroma: [0, 0] as const } } } };
const pending: Promise<ColorSet> = resolveTextColors('valid', options);
void pending;
// @ts-expect-error Input must be text.
resolveTextColors(42);
// @ts-expect-error Unknown option names must be caught.
resolveTextColors('x', { seed: 123 });
// @ts-expect-error A range needs exactly two endpoints.
resolveTextColors('x', { profiles: { light: { fill: { lightness: [0.5] } } } });
// @ts-expect-error Output uses .rgb.r, not .rgb.red.
const wrong = (await resolveTextColors('x')).light.fill.rgb.red;
void wrong;
