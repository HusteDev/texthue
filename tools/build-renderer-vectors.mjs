import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createResolver } from '../packages/npm/dist/index.js';

const cases = [45, 60, 75, 90].map(contrastTarget => ({
  text: 'repair', role: 'text', options: { contrastModel: 'apca', contrastTarget },
  trace: contrastTarget === 75,
}));
cases.push(
  { text: 'fixed', role: 'fill', options: { contrastModel: 'apca', contrastTarget: 106,
    overrides: { fixed: '#777777' }, foregrounds: ['#777777'] } },
  { text: '0', role: 'fill', options: { gamut: 'display-p3', preset: 'chart' }, trace: true },
);

const vectors = cases.map(({ text, role, options, trace }) => {
  const resolver = createResolver(options);
  const full = resolver.resolve(text);
  const formats = ['hex', 'rgb'];
  if (options.gamut) formats.push('p3', 'css', 'srgbClipped');
  if (trace) formats.push('trace');
  const colors = resolver.project(text, { roles: [role], formats });
  const themes = Object.fromEntries(['light', 'dark'].map(theme =>
    [theme, { color: colors[theme][role], contrast: full[theme].contrast[role] }]));
  return { text, options, role, themes };
});
const path = new URL('../conformance/renderer-v1.json', import.meta.url);
const json = JSON.stringify({ algorithm: 'text-to-color-v1', vectors }, null, 2) + '\n';
if (process.argv[2] === '--write') await writeFile(path, json);
else if (process.argv[2] === '--check') {
  const expected = JSON.parse(await readFile(path, 'utf8'));
  const actual = JSON.parse(json);
  for (const [i, vector] of actual.vectors.entries()) {
    for (const theme of ['light', 'dark']) {
      const report = vector.themes[theme].contrast;
      const frozen = expected.vectors[i].themes[theme].contrast;
      for (const key of ['ratio', 'value']) {
        if (typeof frozen[key] !== 'number') continue;
        assert.ok(Math.abs(report[key] - frozen[key]) <= 1e-12, [i, theme, key].join('.'));
        report[key] = frozen[key];
      }
    }
  }
  assert.deepEqual(actual, expected);
} else throw new Error('Expected --check or --write');
