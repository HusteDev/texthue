// Generates or verifies conformance/vectors.json from the compiled npm package.
//
// Each valid case records its exact input and options, the encoded payload
// bytes and SHA-256 digest computed independently here, the sampled
// fractions and requested OKLCH values, and the complete expected result.
// Invalid cases record the expected error code.
//
//   --check   Recompute and compare against the committed file (used by CI).
//   --write   Overwrite the committed file. Only valid for a new algorithm
//             version; v1 expectations are frozen.
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolveTextColors, VERSION } from '../packages/npm/dist/index.js';

const cases = [
  { id: 'relationship-targets', text: 'label', options: {contrastTargets: {fill:7,text:3,textOnSubtle:7,fillHover:6,fillActive:5,border:4,strong:9}} },
  { id: 'empty', text: '' },
  { id: 'seeded', text: 'research', options: { seed: 4294967295 } },
  { id: 'ascii', text: 'research' },
  { id: 'case', text: 'Research' },
  { id: 'leading-space', text: ' research' },
  { id: 'trailing-space', text: 'research ' },
  { id: 'nul', text: 'a\0b' },
  { id: 'line-break', text: 'a\nb' },
  { id: 'composed', text: '\u00e9' },
  { id: 'decomposed', text: 'e\u0301' },
  { id: 'emoji', text: '\ud83c\udf08\ud83d\udc69\u200d\ud83d\udcbb' },
  { id: 'chinese', text: '\u7814\u7a76' },
  { id: 'arabic', text: '\u0628\u062d\u062b' },
  { id: 'scalar-boundary', text: '\u0000\ud7ff\ue000\u{10ffff}' },
  { id: 'namespace', text: 'research', options: { namespace: 'labels' } },
  { id: 'unicode-namespace', text: 'research', options: { namespace: '\u00e9\ud83c\udf08' } },
  { id: 'framing-a', text: 'c', options: { namespace: 'ab' } },
  { id: 'framing-b', text: 'bc', options: { namespace: 'a' } },
  { id: 'framing-nul-a', text: 'c', options: { namespace: 'a\0b' } },
  { id: 'framing-nul-b', text: 'b\0c', options: { namespace: 'a' } },
  { id: 'custom-backgrounds', text: 'project:atlas', options: { backgrounds: { light: '#e8dfd0', dark: '#253047' } } },
  { id: 'uppercase-background', text: 'project:atlas', options: { backgrounds: { light: '#FFFFFF' } } },
  { id: 'adjusted-text', text: 'category:books', options: { profiles: { light: { text: { lightness: [0.9, 0.9] } } } } },
  { id: 'adjusted-fill', text: 'category:books', options: { contrastTarget: 7, profiles: { light: { fill: { lightness: [0.6, 0.6], chromaScale: [0, 0] } } } } },
  { id: 'unattainable', text: 'status:pending', options: { contrastTarget: 7, backgrounds: { light: '#777777', dark: '#777777' } } },
  { id: 'maximum-contrast', text: 'build:42', options: { contrastTarget: 21 } },
  { id: 'minimum-contrast', text: 'build:42', options: { contrastTarget: 1 } },
  { id: 'capped', text: 'tag:design', options: { profiles: { light: { fill: { chromaScale: [1, 1], chromaCap: 0.01 } } } } },
  { id: 'zero-width-ranges', text: 'tag:design', options: { profiles: { dark: { fill: { lightness: [0.375, 0.375], chromaScale: [0.125, 0.125] } } } } },
  { id: 'grayscale', text: 'tag:plain', options: { profiles: { light: { fill: { chromaScale: [0, 0] }, text: { chromaScale: [0, 0] } }, dark: { fill: { chromaScale: [0, 0] }, text: { chromaScale: [0, 0] } } } } },
  { id: 'black-white-endpoints', text: 'endpoints', options: { profiles: { light: { fill: { lightness: [0, 0] } }, dark: { fill: { lightness: [1, 1] } } } } },
];

const invalid = [
  { id: 'null-text', text: null, code: 'INVALID_TEXT' },
  { id: 'numeric-text', text: 123, code: 'INVALID_TEXT' },
  { id: 'object-text', text: {}, code: 'INVALID_TEXT' },
  { id: 'high-surrogate', text: '\ud800', code: 'INVALID_TEXT' },
  { id: 'low-surrogate', text: '\udfff', code: 'INVALID_TEXT' },
  { id: 'null-options', text: 'x', options: null, code: 'INVALID_OPTIONS' },
  { id: 'array-options', text: 'x', options: [], code: 'INVALID_OPTIONS' },
  { id: 'unknown-option', text: 'x', options: { unknown: 42 }, code: 'INVALID_OPTIONS' },
  { id: 'null-namespace', text: 'x', options: { namespace: null }, code: 'INVALID_OPTIONS' },
  { id: 'invalid-namespace', text: 'x', options: { namespace: '\ud800' }, code: 'INVALID_OPTIONS' },
  { id: 'null-backgrounds', text: 'x', options: { backgrounds: null }, code: 'INVALID_OPTIONS' },
  { id: 'short-background', text: 'x', options: { backgrounds: { light: '#fff' } }, code: 'INVALID_OPTIONS' },
  { id: 'alpha-background', text: 'x', options: { backgrounds: { light: '#ffffffff' } }, code: 'INVALID_OPTIONS' },
  { id: 'named-background', text: 'x', options: { backgrounds: { light: 'white' } }, code: 'INVALID_OPTIONS' },
  { id: 'bad-hex', text: 'x', options: { backgrounds: { dark: '#zzzzzz' } }, code: 'INVALID_OPTIONS' },
  { id: 'boolean-target', text: 'x', options: { contrastTarget: true }, code: 'INVALID_OPTIONS' },
  { id: 'low-target', text: 'x', options: { contrastTarget: 0.99 }, code: 'INVALID_OPTIONS' },
  { id: 'high-target', text: 'x', options: { contrastTarget: 21.01 }, code: 'INVALID_OPTIONS' },
  { id: 'null-profiles', text: 'x', options: { profiles: null }, code: 'INVALID_OPTIONS' },
  { id: 'unknown-theme', text: 'x', options: { profiles: { dim: {} } }, code: 'INVALID_OPTIONS' },
  { id: 'unknown-role', text: 'x', options: { profiles: { light: { border: {} } } }, code: 'INVALID_OPTIONS' },
  { id: 'unknown-range', text: 'x', options: { profiles: { light: { fill: { saturation: [0, 1] } } } }, code: 'INVALID_OPTIONS' },
  { id: 'reversed-range', text: 'x', options: { profiles: { light: { fill: { lightness: [0.8, 0.2] } } } }, code: 'INVALID_OPTIONS' },
  { id: 'negative-range', text: 'x', options: { profiles: { light: { fill: { chromaScale: [-0.1, 0.2] } } } }, code: 'INVALID_OPTIONS' },
  { id: 'excessive-chroma', text: 'x', options: { profiles: { dark: { text: { chromaScale: [0, 1.001] } } } }, code: 'INVALID_OPTIONS' },
  { id: 'excessive-lightness', text: 'x', options: { profiles: { dark: { text: { lightness: [0, 1.1] } } } }, code: 'INVALID_OPTIONS' },
  { id: 'short-range', text: 'x', options: { profiles: { light: { fill: { lightness: [0.5] } } } }, code: 'INVALID_OPTIONS' },
  { id: 'boolean-range', text: 'x', options: { profiles: { light: { fill: { lightness: [false, true] } } } }, code: 'INVALID_OPTIONS' },
];

const vectors = [];
for (const item of cases) {
  const options = item.options ?? {};
  const namespace = Buffer.from(options.namespace ?? '', 'utf8');
  const text = Buffer.from(item.text, 'utf8');
  const length = Buffer.alloc(8);
  length.writeUInt32BE(options.seed ?? 0);
  length.writeUInt32BE(namespace.length, 4);
  const payload = Buffer.concat([Buffer.from(`${VERSION}\0`), length, namespace, text]);
  const hash = createHash('sha256').update(payload).digest();
  const fractions = [0, 4, 8].map(index => hash.readUInt32BE(index) / 4294967296);
  vectors.push({ ...item, options, encoding: { namespaceUtf8Hex: namespace.toString('hex'),
    textUtf8Hex: text.toString('hex'), payloadHex: payload.toString('hex'), sha256: hash.toString('hex') },
  fractions, expected: resolveTextColors(item.text, options) });
}
const document = { version: VERSION, numericTolerance: 0.000001, vectors, invalid };
const content = `${JSON.stringify(document, null, 2)}\n`;
const destination = new URL('../conformance/vectors.json', import.meta.url);
if (process.argv.length === 3 && process.argv[2] === '--write') {
  await writeFile(destination, content);
  process.stdout.write(`Wrote ${vectors.length} valid and ${invalid.length} invalid conformance vectors.\n`);
} else if (process.argv.length === 3 && process.argv[2] === '--check') {
  if (await readFile(destination, 'utf8') !== content) {
    process.stderr.write('Conformance vectors differ. Do not update v1 expectations to conceal a mapping change.\n');
    process.exitCode = 1;
  } else process.stdout.write(`Verified ${vectors.length} valid and ${invalid.length} invalid conformance vectors.\n`);
} else {
  process.stderr.write('Usage: node tools/build-vectors.mjs --check | --write\n');
  process.exitCode = 2;
}
