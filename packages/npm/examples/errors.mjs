// Show the stable error codes returned for invalid text and options.
import { resolveTextColors, TextColorError } from 'texthue';

for (const [text, options] of [
  [123, {}],
  ['\ud800', {}],
  ['research', { contrastTarget: 22 }],
  ['research', { backgrounds: { light: '#fff' } }],
  ['research', { profiles: { light: { fill: { chromaScale: [0.2, 0.1] } } } }],
]) {
  try {
    await resolveTextColors(text, options);
    throw new Error('This intentionally invalid example should have failed');
  } catch (error) {
    if (!(error instanceof TextColorError)) throw error;
    console.log(error.code, error.message);
  }
}
