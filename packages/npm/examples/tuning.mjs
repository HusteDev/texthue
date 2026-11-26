// Set role profiles and inspect a contrast fallback.
import assert from 'node:assert/strict';
import { resolveTextColors } from 'texthue';

// Each theme can use independent fill and text profiles.
const colors = resolveTextColors('project:atlas', {
  namespace: 'workspace:demo',
  backgrounds: { light: '#f5f0e8', dark: '#20242b' },
  contrastTarget: 7,
  profiles: {
    light: {
      fill: { lightness: [0.74, 0.84], chromaScale: [0.08, 0.14] },
      text: { lightness: [0.40, 0.52], chromaScale: [0.10, 0.16] },
    },
    dark: {
      fill: { lightness: [0.38, 0.48], chromaScale: [0.08, 0.14] },
      text: { lightness: [0.74, 0.86], chromaScale: [0.10, 0.16] },
    },
  },
});
console.log('Customized colors:', JSON.stringify(colors, null, 2));

const grayscale = resolveTextColors('plain', {
  profiles: { light: { fill: { lightness: [0.75, 0.75], chromaScale: [0, 0] } } },
});
assert.equal(grayscale.light.fill.rgb.r, grayscale.light.fill.rgb.g);
assert.equal(grayscale.light.fill.rgb.g, grayscale.light.fill.rgb.b);
console.log('Fixed preferred lightness, zero chroma:', grayscale.light.fill);

// Readability can override the preferred range. A high target may be impossible.
const impossible = resolveTextColors('project:atlas', {
  backgrounds: { light: '#777777' }, contrastTarget: 7,
});
assert.equal(impossible.light.contrast.text.fallback, 'unattainable-contrast');
if (!impossible.light.contrast.text.meetsTarget) {
  console.log('Use the returned fallback or change the background/target:',
    impossible.light.text.hex, impossible.light.contrast.text);
}
