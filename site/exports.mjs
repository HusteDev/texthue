const shapes = {circle:'●', square:'■', triangle:'▲', diamond:'◆', star:'★', cross:'✚', pentagon:'⬟', hexagon:'⬢'};

export function markerGlyph(marker) {
  if (!Object.hasOwn(shapes,marker)) throw new Error('Unknown marker');
  return shapes[marker];
}

export function registryCss(rows) {
  const declarations = rows.flatMap(row => Object.entries(row.variables)
    .map(([name, value]) => `  ${name}: ${value};`));
  return [':root {', ...declarations, '}', ''].join('\n');
}

function xmlText(value) {
  return value.replace(/[^\t\n\r\u0020-\ud7ff\ue000-\ufffd\u{10000}-\u{10ffff}]/gu, '�')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

export function swatchSheet(rows, theme, vision) {
  const labelWidth = 180 + rows.reduce((extra, row) =>
    Math.max(extra, Array.from(row.label).length * 14 + (row.marker ? 24 : 0) - 150), 0);
  const width = labelWidth + 360;
  const height = 80 + rows.length * 32;
  const lines = [`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    '<rect width="100%" height="100%" fill="white"/>', '<g font-family="sans-serif" font-size="14">',
    `<text x="12" y="24">TextHue · ${xmlText(theme)} · ${xmlText(vision)}</text>`];
  ['Label','Hash','Assigned','Registry'].forEach((title, i) => {
    lines.push(`<text x="${i ? labelWidth + (i-1)*120 : 12}" y="55">${title}</text>`);
  });
  rows.forEach(({label, swatches, marker}, i) => {
    const y = 86 + i * 32;
    if (marker) lines.push(`<text x="12" y="${y}"><title>${xmlText(marker)}</title>${markerGlyph(marker)}</text>`);
    lines.push(`<text x="${marker ? 36 : 12}" y="${y}">${xmlText(label)}</text>`);
    swatches.forEach((hex, column) => {
      if (!/^#[0-9a-f]{6}$/i.test(hex)) throw new Error('Invalid swatch');
      const x = labelWidth + column * 120;
      lines.push(`<rect x="${x}" y="${y-14}" width="18" height="18" fill="${hex}"/><text x="${x+24}" y="${y}">${hex}</text>`);
    });
  });
  return [...lines, '</g></svg>'].join('\n');
}
