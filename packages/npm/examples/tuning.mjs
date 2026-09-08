// Exercise every option, fixed ranges, grayscale, and an unattainable contrast target.
import { resolveTextColors } from 'texthue';

// Every supported option, with independent ranges for each theme and role.
const colors = await resolveTextColors('project:atlas', {
  namespace: 'workspace:demo',
  backgrounds: { light: '#f5f0e8', dark: '#20242b' },
  contrastTarget: 7,
  profiles: {
    light: {
      fill: { lightness: [0.74, 0.84], chroma: [0.08, 0.14] },
      accent: { lightness: [0.40, 0.52], chroma: [0.10, 0.16] },
    },
    dark: {
      fill: { lightness: [0.38, 0.48], chroma: [0.08, 0.14] },
      accent: { lightness: [0.74, 0.86], chroma: [0.10, 0.16] },
    },
  },
});
console.log('Customized colors:', JSON.stringify(colors, null, 2));

const grayscale = await resolveTextColors('plain', {
  profiles: { light: { fill: { lightness: [0.75, 0.75], chroma: [0, 0] } } },
});
console.log('Fixed preferred lightness, zero chroma:', grayscale.light.fill);

// Readability can override the preferred range. A high target may be impossible.
const impossible = await resolveTextColors('project:atlas', {
  backgrounds: { light: '#777777' }, contrastTarget: 7,
});
if (!impossible.light.contrast.accent.meetsTarget) {
  console.log('Use the returned fallback or change the background/target:',
    impossible.light.accent.hex, impossible.light.contrast.accent);
}
