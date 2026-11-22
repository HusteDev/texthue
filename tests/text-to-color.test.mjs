// JavaScript conformance suite. Runs the frozen vectors, runtime-only
// rejections, immutability checks, format round trips, and a default-range
// readability sweep against the compiled npm package.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { contrast, fitColor, foreground, formats, oklchToLinear } from '../packages/npm/dist/color-math.js';
import { resolveTextColors, TextColorError, VERSION } from '../packages/npm/dist/index.js';

const fixture = JSON.parse(await readFile(new URL('../conformance/vectors.json', import.meta.url), 'utf8'));
/** Extracts a `Color`'s RGB bytes as a triple. */
const rgb = color => [color.rgb.r, color.rgb.g, color.rgb.b];

test('frozen v1 fixture file matches its pinned SHA-256 digest', async () => {
  const bytes = await readFile(new URL('../conformance/vectors.json', import.meta.url));
  assert.equal(createHash('sha256').update(bytes).digest('hex'),
    '9ed248dc3b016c69aafc076fbc6e4d070305bd9e190c449315d9094e960109d2');
});

/** Independent HSL-to-RGB conversion used to confirm published HSL round-trips to the canonical bytes. */
function hslToRgb({ h, s, l }) {
  s /= 100;
  l /= 100;
  const a = s * Math.min(l, 1 - l);
  const channel = n => {
    const k = (n + h / 30) % 12;
    return Math.floor((l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))) * 255 + 0.5);
  };
  return [channel(0), channel(8), channel(4)];
}

/** Asserts that hex, RGB, HSL, and OKLCH all describe the same byte color and that angles are in `[0, 360)`. */
function checkFormats(color) {
  assert.match(color.hex, /^#[0-9a-f]{6}$/);
  const channels = rgb(color);
  for (const value of channels) assert.ok(Number.isInteger(value) && value >= 0 && value <= 255);
  assert.equal(color.hex, `#${channels.map(value => value.toString(16).padStart(2, '0')).join('')}`);
  assert.deepEqual(hslToRgb(color.hsl), channels);
  const linear = oklchToLinear(color.oklch.l, color.oklch.c, color.oklch.h);
  const restored = linear.map(x => {
    x = Math.max(0, Math.min(1, x));
    return Math.floor(255 * (x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055) + 0.5);
  });
  assert.deepEqual(restored, channels);
  for (const component of Object.values(color.hsl).concat(Object.values(color.oklch))) assert.ok(Number.isFinite(component));
  assert.ok(color.hsl.h >= 0 && color.hsl.h < 360);
  assert.ok(color.oklch.h >= 0 && color.oklch.h < 360);
}

for (const item of fixture.vectors) {
  test(`v1 vector: ${item.id}`, async () => {
    const actual = await resolveTextColors(item.text, item.options);
    assert.deepEqual(actual, item.expected);
    const payload = Buffer.from(item.encoding.payloadHex, 'hex');
    assert.equal(createHash('sha256').update(payload).digest('hex'), item.encoding.sha256);
    assert.equal(actual.hueFraction, item.fractions[0]);
    for (const theme of ['light', 'dark']) {
      for (const role of ['background','subtle','muted','fill','fillHover','fillActive','onFill','border','text','strong']) checkFormats(actual[theme][role]);
      const result = actual[theme];
      for (const [role, color, pair] of [
        ['fill',result.fill,result.onFill], ['fillHover',result.fillHover,result.onFill],
        ['fillActive',result.fillActive,result.onFill], ['border',result.border,result.background],
        ['text',result.text,result.background], ['textOnSubtle',result.text,result.subtle],
        ['strong',result.strong,result.background]]) {
        const target = item.options.contrastTargets?.[role] ?? (role === 'border' ? Math.min(3,result.contrast.target) : result.contrast.target);
        const ratio = contrast(rgb(color), rgb(pair));
        assert.equal(result.contrast[role].ratio, ratio);
        assert.equal(result.contrast[role].meetsTarget, ratio >= target);
      }
      assert.ok(result.contrast.fill.meetsTarget);
    }
  });
}

for (const item of fixture.invalid) {
  test(`reject invalid input: ${item.id}`, async () => {
    assert.throws(() => resolveTextColors(item.text, Object.hasOwn(item, 'options') ? item.options : {}),
      error => error instanceof TextColorError && error.code === item.code);
  });
}

test('reject runtime-only non-finite values and malformed option records', async () => {
  for (const value of [NaN, Infinity, -Infinity, '4.5', null]) {
    assert.throws(() => resolveTextColors('x', { contrastTarget: value }), { code: 'INVALID_OPTIONS' });
  }
  for (const value of [new Date(), new Map(), { [Symbol('typo')]: true }]) {
    assert.throws(() => resolveTextColors('x', value), { code: 'INVALID_OPTIONS' });
  }
  assert.throws(() => resolveTextColors('x', { profiles: { light: { fill: { chromaScale: [0, NaN] } } } }), { code: 'INVALID_OPTIONS' });
  assert.throws(() => resolveTextColors(undefined), { code: 'INVALID_TEXT' });
});

test('settings are captured before asynchronous hashing and results share no mutable state', async () => {
  const options = { profiles: { light: { fill: { lightness: [0.72, 0.82] } } } };
  const pending = resolveTextColors('research', options);
  options.profiles.light.fill.lightness[0] = 0;
  const first = await pending;
  assert.deepEqual(first, await resolveTextColors('research'));
  first.light.fill.rgb.r = -1;
  assert.ok((await resolveTextColors('research')).light.fill.rgb.r >= 0);
});

test('palette and background changes preserve identity hue', async () => {
  const basic = await resolveTextColors('dataset:42');
  const custom = await resolveTextColors('dataset:42', { contrastTarget: 7,
    backgrounds: { light: '#888888' }, profiles: { dark: { fill: { lightness: [0.2, 0.3] } } } });
  assert.equal(custom.hue, basic.hue);
  assert.equal(basic.version, VERSION);
});

test('documented failure and adjustment paths are exercised', () => {
  const byId = id => fixture.vectors.find(item => item.id === id).expected;
  assert.equal(byId('adjusted-text').light.contrast.text.lightnessAdjusted, true);
  assert.equal(byId('adjusted-fill').light.contrast.fill.lightnessAdjusted, true);
  assert.equal(byId('capped').light.contrast.fill.chromaCapped, true);
  assert.equal(byId('unattainable').light.contrast.text.meetsTarget, false);
  assert.equal(byId('unattainable').light.contrast.text.fallback, 'unattainable-contrast');
  assert.equal(byId('black-white-endpoints').light.fill.hex, '#000000');
  assert.equal(byId('black-white-endpoints').dark.fill.hex, '#ffffff');
});

test('known color anchors and grayscale have finite equivalent formats', () => {
  const red = formats([255, 0, 0]);
  assert.deepEqual(red.hsl, { h: 0, s: 100, l: 50 });
  assert.ok(Math.abs(red.oklch.l - 0.627955) < 0.000002);
  assert.ok(Math.abs(red.oklch.c - 0.257683) < 0.000002);
  for (const channels of [[0, 255, 0], [0, 0, 255], [0, 0, 0], [255, 255, 255], [128, 128, 128]]) {
    const color = formats(channels);
    checkFormats(color);
    if (channels[0] === channels[1] && channels[1] === channels[2]) {
      assert.equal(color.hsl.h, 0);
      assert.equal(color.oklch.h, 0);
      assert.equal(color.oklch.c, 0);
    }
  }
});

test('25,920 default-range samples remain valid and readable after RGB rounding', () => {
  let count = 0;
  for (const [range, background] of [
    [[0.72, 0.82], null], [[0.4, 0.5], null],
    [[0.45, 0.55], [255, 255, 255]], [[0.72, 0.82], [18, 18, 18]],
  ]) {
    for (let hue = 0; hue < 360; hue += 0.5) {
      for (const lightness of [range[0], (range[0] + range[1]) / 2, range[1]]) {
        for (const chroma of [0.1, 0.13, 0.16]) {
          const sample = fitColor(lightness, chroma, hue);
          assert.ok(contrast(sample.rgb, background ?? foreground(sample.rgb)) >= 4.5);
          checkFormats(formats(sample.rgb));
          count++;
        }
      }
    }
  }
  assert.equal(count, 25920);
});
test('25,920 identities meet every default relationship with at most 5% repair per role', () => {
  const count = 25920;
  const repairs = new Map();
  for (let i = 0; i < count; i++) {
    const result = resolveTextColors(`sweep:${i}`);
    for (const theme of ['light', 'dark']) {
      const { target, ...relationships } = result[theme].contrast;
      assert.equal(target, 4.5);
      for (const [role, pair] of Object.entries(relationships)) {
        assert.ok(pair.meetsTarget, `${theme}.${role}: ${i}`);
        const key = `${theme}.${role}`;
        repairs.set(key, (repairs.get(key) ?? 0) + Number(pair.lightnessAdjusted));
      }
    }
  }
  for (const [role, repaired] of repairs) assert.ok(repaired <= count * 0.05, `${role}: ${repaired}`);
});
