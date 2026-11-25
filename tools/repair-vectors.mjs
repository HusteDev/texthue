import { readFile } from 'node:fs/promises';
import { apcaContrast, chooseColor, contrast, p3ApcaContrast, p3Contrast, XYZ_TO_P3 } from '../packages/npm/dist/color-math.js';

const rows = [];
for (const [gamut, model, metric] of [
  ['SRGB', 'WCAG2', contrast], ['DISPLAY_P3', 'WCAG2', p3Contrast],
  ['SRGB', 'APCA', apcaContrast], ['DISPLAY_P3', 'APCA', p3ApcaContrast],
]) {
  const targets = model === 'WCAG2' ? [1, 4.5, 7, 21] : [0, 45, 75, 106];
  for (const target of targets) {
    for (const background of [[0,0,0], [255,255,255], [119,119,119], [15,143,210]]) {
      for (const [l,c,h] of [[0.48,0.03,270], [0.72,0.3,49], [0.21,0.14,145]]) {
        const measure = rgb => Math.abs(metric(rgb, background));
        const choice = chooseColor(l,c,h,background,target,undefined,target,undefined,measure,
          gamut === 'DISPLAY_P3' ? XYZ_TO_P3 : undefined);
        rows.push([gamut,model,l,c,h,background.join(','),target,choice.rgb.join(','),
          choice.fitted.lightness,choice.fitted.chroma,choice.metadata.ratio,choice.metadata.fallback ?? '-'].join('\t'));
      }
    }
  }
}

const output = rows.join('\n') + '\n';
if (process.argv[2] === '--check') {
  const frozen = await readFile(new URL('../conformance/tone-repair-v1.tsv', import.meta.url), 'utf8');
  const expected = frozen.trimEnd().split(/\r?\n/);
  if (expected.length !== rows.length) throw new Error('Tone repair row count differs');
  for (const [index, row] of rows.entries()) {
    const fields = expected[index].split('\t');
    const actual = row.split('\t');
    const matches = actual.every((value, column) =>
      // Match the cross-language conformance tolerance for chroma and contrast.
      column === 9 || column === 10
        ? Math.abs(Number(value) - Number(fields[column])) <= 1e-12
        : value === fields[column]
    );
    if (fields.length !== actual.length || !matches) throw new Error('Tone repair differs at row ' + (index + 1));
  }
} else {
  process.stdout.write(output);
}
