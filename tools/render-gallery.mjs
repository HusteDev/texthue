import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { simulateVision } from '../packages/npm/dist/diagnostics.js';
import { assignTextColors, resolveTextColors } from '../packages/npm/dist/index.js';

const labels = ['Design', 'Research', 'Platform', 'Support', 'Finance', 'Operations'];
const hashed = labels.map(label => resolveTextColors(label));
const assigned = assignTextColors(labels).colors;
const collisionPair = ['item:33', 'item:633'];
const separated = assignTextColors(collisionPair).colors;
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
function figure(title, height, content) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 ${height}" role="img" aria-labelledby="title" font-family="system-ui, sans-serif">
<title id="title">${title}</title>
${content}
</svg>
`;
}

function badge(user, x, y) {
  const {fill, onFill} = resolveTextColors(user).light;
  return `<rect x="${x}" y="${y}" width="85" height="26" rx="6" fill="${fill.hex}"/>
<text x="${x + 9}" y="${y + 18}" fill="${onFill.hex}" font-size="14">${user}</text>`;
}

function panel(x, title, subtitle, body) {
  return `<g transform="translate(${x} 8)"><rect width="284" height="226" rx="10" fill="#fff" stroke="#bac6cd"/>
<text x="16" y="32" font-size="20" font-weight="650">${title}</text>
<text x="16" y="57" font-size="14" fill="#465661">${subtitle}</text><path d="M0 73h284" stroke="#cdd6da"/>${body}</g>`;
}

const hero = figure('The same usernames in team chat, a task board, and an on-call calendar', 244, [
  panel(6,'Team chat','# release', badge('@mira',16,84) + '<text x="16" y="132">Build is ready for review.</text>' +
    badge('@nico',16,149) + '<text x="16" y="198">I’ll check the release notes.</text>'),
  panel(308,'Task board','In progress', ['Review build','Publish notes'].map((task,i) =>
    `<rect x="12" y="${84+i*66}" width="260" height="55" rx="5" fill="#f0f4f6"/><text x="23" y="${118+i*66}">${task}</text>` +
    badge(['@nico','@mira'][i],178,99+i*66)).join('')),
  panel(610,'On-call calendar','November · primary rotation', ['Mon 23','Tue 24'].map((day,i) =>
    `<text x="18" y="${118+i*62}">${day}</text><path d="M16 ${138+i*62}h250" stroke="#d9e1e6"/>` +
    badge(['@mira','@nico'][i],146,99+i*62)).join('')),
].join(''));

function pairRow(title, colors, y) {
  return row(title, collisionPair.map(label => {
    const hex = colors[label].light.fill.hex;
    return [`${label} · ${hex}`, hex];
  }), y);
}
const independent = Object.fromEntries(collisionPair.map(label => [label, resolveTextColors(label)]));
const files = {
  '../docs/assets/gallery.svg': hero,
  '../packages/npm/assets/gallery.svg': hero,
  '../docs/assets/assignment.svg': figure('Resolving two labels separately and assigning them together',188,
    pairRow('Resolved independently',independent,0) + pairRow('Assigned together',separated,94)),
  '../docs/assets/roles.svg': figure('Light theme roles for Design',94,
    row('Design · light theme',scale.map(role => [role, hashed[0].light[role].hex]),0)),
  '../docs/assets/vision.svg': figure('One collection under four vision profiles',376,
    ['normal','protan','deutan','tritan'].map((vision,i) => row(vision,
      labels.map(label => [label,vision === 'normal' ? assigned[label].light.fill.hex : simulateVision(assigned[label].light.fill.hex,vision)]),94*i)).join('')),
};
for (const [path, svg] of Object.entries(files)) {
  const file = new URL(path, import.meta.url);
  if (process.argv.includes('--check')) {
    if ((await readFile(file, 'utf8')).replaceAll('\r\n', '\n') !== svg) throw Error(`Stale visual: ${file.pathname}`);
  } else {
    await mkdir(new URL('.',file), {recursive:true});
    await writeFile(file, svg);
  }
}
