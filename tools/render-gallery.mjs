import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { assignTextColors, resolveTextColors } from '../packages/npm/dist/index.js';

const labels = ['Design', 'Research', 'Platform', 'Support', 'Finance', 'Operations'];
const hashed = labels.map(label => resolveTextColors(label));
const assigned = assignTextColors(labels).colors;
const scale = ['background', 'subtle', 'muted', 'fill', 'fillHover', 'fillActive', 'border', 'text', 'strong'];

function row(title, swatches, y, dark = false) {
  const width = 864 / swatches.length;
  const ink = dark ? '#fafafa' : '#171717';
  const shapes = swatches.map(([label, color], i) => {
    const x = 18 + i * width;
    return `<rect x="${x}" y="${y + 33}" width="${width - 5}" height="29" rx="3" fill="${color}"/>
<text x="${x}" y="${y + 81}" fill="${ink}" font-size="13">${label}</text>`;
  });
  return `<rect y="${y}" width="900" height="94" fill="${dark ? '#121212' : '#ffffff'}"/>
<text x="18" y="${y + 23}" fill="${ink}" font-size="16" font-weight="600">${title}</text>
${shapes.join('\n')}`;
}
const rows = [
  row('Independent labels · light', labels.map((s, i) => [s, hashed[i].light.fill.hex]), 0),
  row('Independent labels · dark', labels.map((s, i) => [s, hashed[i].dark.fill.hex]), 94, true),
  row('Collection assignment · light', labels.map(s => [s, assigned[s].light.fill.hex]), 188),
  row('Design · light theme roles', scale.map(role => [role, hashed[0].light[role].hex]), 282),
];
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 376" role="img" aria-labelledby="title" font-family="system-ui, sans-serif">
<title id="title">TextHue label colors in both themes, collection assignment, and tonal roles</title>
${rows.join('\n')}
</svg>
`;
for (const folder of ['../docs/assets/', '../packages/npm/assets/']) {
  const dir = new URL(folder, import.meta.url);
  const file = new URL('gallery.svg', dir);
  if (process.argv.includes('--check')) {
    if ((await readFile(file, 'utf8')).replaceAll('\r\n', '\n') !== svg) throw Error(`Stale gallery: ${file.pathname}`);
  } else {
    await mkdir(dir, {recursive: true});
    await writeFile(file, svg);
  }
}
