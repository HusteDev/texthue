import { chooseColor, contrast, apcaContrast, p3Contrast, p3ApcaContrast, XYZ_TO_P3 } from '../packages/npm/dist/color-math.js';

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
        console.log([gamut,model,l,c,h,background.join(','),target,choice.rgb.join(','),
          choice.fitted.lightness,choice.fitted.chroma,choice.metadata.ratio,choice.metadata.fallback ?? '-'].join('\t'));
      }
    }
  }
}
