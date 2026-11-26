/**
 * TextHue: deterministic text-to-color for JavaScript and TypeScript.
 *
 * Maps exact Unicode text to coordinated light and dark theme colors using
 * the `text-to-color-v1` algorithm. The shared conformance corpus defines the
 * portable color results.
 *
 * @packageDocumentation
 */

import type { Placement } from './assignment.js';
import { compareBytes } from './bytes.js';
import {
  apcaContrast,
  blendOver,
  chooseColor,
  contrast,
  contrastRatio,
  cusp,
  formats,
  hexFormat,
  hslFormat,
  luminance,
  oklchFormat,
  P3_TO_XYZ,
  p3ApcaContrast,
  p3Channels,
  p3Contrast,
  p3Css,
  p3Fallback,
  p3Formats,
  rgbFormat,
  srgbToP3,
  XYZ_TO_P3,
} from './color-math.js';
import { fail } from './errors.js';
import { sha256 } from './sha256.js';
import { anchors, biases } from './tables.js';
import type {
  ChosenColor,
  Color,
  ColorSet,
  Range,
  ResolvedOptions,
  TextColorErrorCode,
  TextColorOptions,
  ThemeColors,
  Triple,
} from './types.js';

export { fail, TextColorError } from './errors.js';
export type {
  Color,
  ColorProfile,
  ColorSet,
  ContrastResult,
  HSL,
  OKLCH,
  Range,
  RGB,
  TextColorErrorCode,
  TextColorOptions,
  ThemeColors,
  ThemeProfiles,
  ToneTrace,
} from './types.js';

/**
 * Algorithm identifier for the color mapping.
 *
 * It is written into every hashed payload and returned as `ColorSet.version`.
 * It is independent of the package version and changes only when the mapping
 * itself changes.
 */
export const VERSION = 'text-to-color-v1';

function colorBytes(color: Color): Triple {
  const rgb = color?.rgb;
  if (!rgb || ![rgb.r, rgb.g, rgb.b].every((v) => Number.isInteger(v) && v >= 0 && v <= 255)) {
    fail('INVALID_OPTIONS', 'Expected an opaque color with sRGB bytes');
  }
  return [rgb.r, rgb.g, rgb.b];
}

/** Signed APCA Lc for opaque sRGB colors. Positive values indicate dark text on a lighter background. */
export function measureApca(text: Color, background: Color): number {
  return apcaContrast(colorBytes(text), colorBytes(background));
}

/** Composite a translucent source over an opaque backdrop in linear sRGB. */
export function compositeOver(color: Color, alpha: number, backdrop: Color): Color {
  if (!Number.isFinite(alpha) || alpha < 0 || alpha > 1)
    fail('INVALID_OPTIONS', 'Alpha must be in [0,1]');
  return formats(blendOver(colorBytes(color), alpha, colorBytes(backdrop)));
}

/**
 * Validates that a value is a well-formed Unicode string.
 *
 * Rejects non-strings and strings containing unpaired UTF-16 surrogates, which
 * cannot be encoded as UTF-8. Empty strings and embedded NUL are accepted.
 *
 * @param value - Candidate value.
 * @param path - Option path used in error messages.
 * @param code - Error code to raise on failure.
 * @returns The validated string.
 */
export function textValue(value: unknown, path: string, code: TextColorErrorCode): string {
  if (typeof value !== 'string') fail(code, `${path} must be a string`);
  for (let i = 0; i < value.length; i++) {
    const unit = value.charCodeAt(i);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(++i);
      if (!(next >= 0xdc00 && next <= 0xdfff)) fail(code, `${path} contains malformed Unicode`);
    } else if (unit >= 0xdc00 && unit <= 0xdfff) fail(code, `${path} contains malformed Unicode`);
  }
  return value;
}

/**
 * Validates that a value is a plain object containing only known string keys.
 *
 * Arrays, `null`, class instances, and objects with symbol keys or unknown
 * keys are rejected. Only plain objects and null-prototype objects pass.
 *
 * @param value - Candidate value.
 * @param keys - Permitted own property names.
 * @param path - Option path used in error messages.
 * @returns The validated record.
 */
export function record(
  value: unknown,
  keys: readonly string[],
  path: string,
): Record<string, unknown> {
  if (
    value === null ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value))
  ) {
    fail('INVALID_OPTIONS', `${path} must be an object`);
  }
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string' || !keys.includes(key))
      fail('INVALID_OPTIONS', `${path} contains an unknown option: ${String(key)}`);
  }
  return value as Record<string, unknown>;
}

/** Returns an own property value, or `fallback` when the key is absent. An explicit `undefined` is returned as-is. */
const own = (object: Record<string, unknown>, key: string, fallback: unknown): unknown =>
  Object.hasOwn(object, key) ? object[key] : fallback;

/** Type guard for finite numbers; rejects `NaN`, infinities, and non-number types. */
const finite = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/**
 * Validates an ordered `[minimum, maximum]` pair within `0..maximum`.
 *
 * @param value - Candidate value.
 * @param maximum - Inclusive upper bound for both endpoints.
 * @param path - Option path used in error messages.
 * @returns A fresh two-element tuple.
 */
function range(value: unknown, maximum: number, path: string): Range {
  if (
    !Array.isArray(value) ||
    value.length !== 2 ||
    !finite(value[0]) ||
    !finite(value[1]) ||
    value[0] < 0 ||
    value[0] > value[1] ||
    value[1] > maximum
  ) {
    fail('INVALID_OPTIONS', `${path} must be [minimum, maximum] within 0..${maximum}`);
  }
  return [value[0], value[1]];
}

function compileHueDomain(allowed: unknown, excluded: unknown) {
  const split = (arc: unknown): Range[] => {
    if (
      !Array.isArray(arc) ||
      arc.length !== 2 ||
      !arc.every((x) => finite(x) && x >= 0 && x <= 360)
    ) {
      fail('INVALID_OPTIONS', 'Hue intervals need two endpoints from 0 to 360');
    }
    const [a, b] = arc;
    return a <= b
      ? [[a, b]]
      : [
          [0, b],
          [a, 360],
        ];
  };
  if (!Array.isArray(excluded) || excluded.length > 16)
    fail('INVALID_OPTIONS', 'Invalid excluded hues');
  const exclusions = excluded.flatMap(split).filter(([lo, hi]) => lo < hi);
  const excludesHue = exclusions.length
    ? (h: number) => exclusions.some(([lo, hi]) => lo <= h && h < hi)
    : undefined;
  let segments = split(allowed);
  for (const [a, b] of exclusions) {
    segments = segments
      .flatMap(([lo, hi]): Range[] => [
        [lo, Math.min(hi, a)],
        [Math.max(lo, b), hi],
      ])
      .filter(([lo, hi]) => lo < hi);
  }
  segments = segments.filter(([lo, hi]) => lo < hi);
  const width = segments.reduce((sum, [lo, hi]) => sum + hi - lo, 0);
  if (!width) fail('INVALID_OPTIONS', 'Empty hue domain');
  const hueDomain = (h: number) => {
    if (width === 360) return h;
    let distance = (h / 360) * width;
    for (const [lo, hi] of segments) {
      if (distance < hi - lo) return (lo + distance) % 360;
      distance -= hi - lo;
    }
    return segments[0]?.[0] ?? 0;
  };
  return { hueDomain, excludesHue, segments, exclusions };
}

function compileForegrounds(
  source: Record<string, unknown>,
  canonical: ResolvedOptions['canonical'],
  measure: ResolvedOptions['measure'],
  wide: boolean,
) {
  const candidates = own(source, 'foregrounds', ['#000000', '#ffffff']);
  const policy = own(source, 'foregroundPolicy', 'best');
  if (
    !Array.isArray(candidates) ||
    candidates.length === 0 ||
    !['best', 'first-passing'].some((v) => v === policy)
  ) {
    fail('INVALID_OPTIONS', 'Invalid foreground list or policy');
  }
  const foregrounds = Array.from(candidates, (hex) => {
    if (typeof hex !== 'string' || !/^#[0-9a-f]{6}$/i.test(hex))
      fail('INVALID_OPTIONS', 'Invalid foreground color');
    return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as Triple;
  });
  const canonicalForegrounds = foregrounds.map(canonical);
  const foregroundColors = new Map(
    canonicalForegrounds.map((rgb) => [rgb, wide ? p3Formats(rgb) : formats(rgb)]),
  );
  const formatForeground = (rgb: Triple) => {
    const color = foregroundColors.get(rgb);
    if (!color) throw new Error('Selected foreground is missing from the compiled palette');
    return structuredClone(color);
  };
  const selectForeground = (rgb: Triple, target: number): Triple => {
    let selected: Triple = [0, 0, 0],
      best = -1;
    for (const candidate of canonicalForegrounds) {
      const ratio = Math.abs(measure(candidate, rgb));
      if (policy === 'first-passing' && ratio >= target) return candidate;
      if (ratio > best) {
        best = ratio;
        selected = candidate;
      }
    }
    return selected;
  };
  return { foregrounds, policy, selectForeground, formatForeground };
}

function compileNormalization(source: Record<string, unknown>) {
  const rules = record(
    own(source, 'normalize', {}),
    ['unicode', 'case', 'whitespace'],
    'normalize',
  );
  const form = own(rules, 'unicode', 'none'),
    casing = own(rules, 'case', 'none'),
    space = own(rules, 'whitespace', 'none');
  if (form !== 'none' && form !== 'NFC' && form !== 'NFKC')
    fail('INVALID_OPTIONS', 'invalid normalize.unicode');
  if (casing !== 'none' && casing !== 'lower') fail('INVALID_OPTIONS', 'invalid normalize.case');
  if (space !== 'none' && space !== 'trim' && space !== 'collapse')
    fail('INVALID_OPTIONS', 'invalid normalize.whitespace');
  const normalize = (input: string) => {
    let value = form === 'none' ? input : input.normalize(form);
    if (casing === 'lower') value = value.toLowerCase();
    if (space !== 'none') value = value.replace(/^\p{White_Space}+|\p{White_Space}+$/gu, '');
    if (space === 'collapse') value = value.replace(/\p{White_Space}+/gu, ' ');
    return value;
  };
  return { normalize, form, casing, space };
}

function compileThemes(source: Record<string, unknown>, scale: number[]) {
  const backgroundsSource = record(
    own(source, 'backgrounds', {}),
    ['light', 'dark'],
    'backgrounds',
  );
  const profilesSource = record(own(source, 'profiles', {}), ['light', 'dark'], 'profiles');
  const backgrounds = {} as ResolvedOptions['backgrounds'];
  const profiles = {} as ResolvedOptions['profiles'];
  for (const theme of ['light', 'dark'] as const) {
    const input = own(backgroundsSource, theme, theme === 'light' ? '#ffffff' : '#121212');
    const background =
      input && typeof input === 'object' ? hexFormat(colorBytes(input as Color)) : input;
    if (typeof background !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(background)) {
      fail('INVALID_OPTIONS', `backgrounds.${theme} must be opaque #RRGGBB`);
    }
    backgrounds[theme] = [1, 3, 5].map((index) =>
      parseInt(background.slice(index, index + 2), 16),
    ) as Triple;
    const themeSource = record(
      own(profilesSource, theme, {}),
      ['fill', 'text'],
      `profiles.${theme}`,
    );
    profiles[theme] = {} as ResolvedOptions['profiles']['light'];
    for (const role of ['fill', 'text'] as const) {
      const path = `profiles.${theme}.${role}`;
      const profile = record(
        own(themeSource, role, {}),
        ['lightness', 'chromaScale', 'chromaCap'],
        path,
      );
      const defaultLightness =
        theme === 'light'
          ? role === 'fill'
            ? [0.72, 0.82]
            : [0.43, 0.53]
          : role === 'fill'
            ? [0.4, 0.5]
            : [0.72, 0.82];
      const cap = own(profile, 'chromaCap', role === 'fill' ? 0.16 : 0.19);
      if (!finite(cap) || cap < 0 || cap > 0.4) fail('INVALID_OPTIONS', 'invalid chromaCap');
      profiles[theme][role] = {
        lightness: range(own(profile, 'lightness', defaultLightness), 1, `${path}.lightness`),
        chromaCap: cap,
        chromaScale: range(own(profile, 'chromaScale', scale), 1, `${path}.chromaScale`),
      };
    }
  }
  return { backgrounds, profiles };
}

function compileBrand(
  source: Record<string, unknown>,
  normalize: ResolvedOptions['normalize'],
  canonical: ResolvedOptions['canonical'],
  measure: ResolvedOptions['measure'],
  selectForeground: ResolvedOptions['selectForeground'],
  targets: ResolvedOptions['targets'],
  hueDomain: ResolvedOptions['hueDomain'],
) {
  const parseBrandHex = (hex: unknown): Triple => {
    if (typeof hex !== 'string' || !/^#[0-9a-f]{6}$/i.test(hex))
      fail('INVALID_OPTIONS', 'Invalid brand hex');
    return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as Triple;
  };
  const originalNames = new Map<string, string>();
  const rawOverrides = own(source, 'overrides', {});
  const pairs = new Map<string, { light: Triple; dark: Triple }>();
  const entries = record(rawOverrides, Object.keys(rawOverrides ?? {}), 'overrides');
  for (const [key, value] of Object.entries(entries)) {
    const name = normalize(textValue(key, 'overrides', 'INVALID_OPTIONS'));
    if (pairs.has(name)) fail('INVALID_OPTIONS', 'Duplicate normalized override');
    const pair =
      typeof value === 'string'
        ? { light: value, dark: value }
        : record(value, ['light', 'dark'], 'override');
    originalNames.set(name, key);
    pairs.set(name, { light: parseBrandHex(pair.light), dark: parseBrandHex(pair.dark) });
  }
  const paletteMode = own(source, 'paletteMode', 'fixed');
  if (paletteMode !== 'fixed' && paletteMode !== 'anchors')
    fail('INVALID_OPTIONS', 'Unknown palette mode');
  const rawPalette = own(source, 'palette', []);
  if (!Array.isArray(rawPalette) || (Object.hasOwn(source, 'palette') && !rawPalette.length))
    fail('INVALID_OPTIONS', 'Empty palette');
  const ids = new Set<string>();
  const palette = rawPalette.map((value) => {
    const entry = record(value, ['id', 'light', 'dark'], 'palette');
    const id = textValue(entry.id, 'palette.id', 'INVALID_OPTIONS');
    if (ids.has(id)) fail('INVALID_OPTIONS', 'Duplicate palette ID');
    ids.add(id);
    const light = parseBrandHex(own(entry, 'light', entry.dark)),
      dark = parseBrandHex(own(entry, 'dark', entry.light));
    const passing = [light, dark]
      .map(canonical)
      .every((rgb) => Math.abs(measure(selectForeground(rgb, targets.fill), rgb)) >= targets.fill);
    return { name: id, id: new TextEncoder().encode(id), light, dark, passing };
  });
  const anchorColors =
    paletteMode === 'anchors'
      ? [...palette]
          .sort((a, b) => compareBytes(a.id, b.id))
          .map((entry) => ({ light: formats(entry.light).oklch, dark: formats(entry.dark).oklch }))
      : [];
  const anchor: ResolvedOptions['anchor'] = (fraction, theme) => {
    if (!anchorColors.length) return undefined;
    const position = fraction * anchorColors.length;
    const color = anchorColors[Math.floor(position)]?.[theme];
    if (!color) throw new RangeError('Invalid anchor placement');
    // Each anchor owns an equal interval. Its local position varies hue by up to 15 degrees.
    const hue = hueDomain((color.h + ((position % 1) - 0.5) * 30 + 360) % 360);
    return { hue, cap: color.c * 1.25 };
  };
  const brand: ResolvedOptions['brand'] = (name, digest) => {
    const pinned = pairs.get(name);
    if (pinned) return { ...pinned, source: 'override' };
    if (paletteMode === 'anchors') return undefined;
    let best = '';
    let winner: (typeof palette)[number] | undefined;
    for (const entry of palette) {
      const rank = sha256(
        new Uint8Array(digest.buffer, digest.byteOffset, digest.byteLength),
        entry.id,
      );
      const score =
        (entry.passing ? '1' : '0') +
        Array.from(new Uint8Array(rank.buffer), (v) => v.toString(16).padStart(2, '0')).join('');
      if (score > best) {
        best = score;
        winner = entry;
      }
    }
    return winner ? { light: winner.light, dark: winner.dark, source: 'palette' } : undefined;
  };
  return { brand, anchor, paletteMode, palette, pairs, originalNames };
}

/**
 * Validates caller options and fills in defaults.
 *
 * Returns a fully resolved, independent copy so later mutation of the caller's
 * object cannot affect an in-flight call. Backgrounds are parsed to RGB bytes.
 *
 * @param options - Caller-supplied options; `undefined` is treated as `{}` by the caller.
 * @returns Resolved settings with every field present.
 */
function optionsValue(options: unknown): ResolvedOptions {
  const source = record(
    options,
    [
      'gamut',
      'contrastModel',
      'overrides',
      'palette',
      'paletteMode',
      'foregrounds',
      'foregroundPolicy',
      'preset',
      'hueRange',
      'excludeHues',
      'normalize',
      'namespace',
      'seed',
      'backgrounds',
      'contrastTarget',
      'contrastTargets',
      'profiles',
    ],
    'options',
  );
  const contrastModel = own(source, 'contrastModel', 'wcag2');
  if (contrastModel !== 'wcag2' && contrastModel !== 'apca')
    fail('INVALID_OPTIONS', 'Unknown contrast model');
  const apca = contrastModel === 'apca';
  const gamut = own(source, 'gamut', 'srgb');
  if (gamut !== 'srgb' && gamut !== 'display-p3') fail('INVALID_OPTIONS', 'Unknown gamut');
  const wide = gamut === 'display-p3';
  const canonical = (rgb: Triple): Triple =>
    wide ? (srgbToP3(rgb, true).map((v) => v * 255) as Triple) : rgb;
  const measure = apca ? (wide ? p3ApcaContrast : apcaContrast) : wide ? p3Contrast : contrast;
  const validTarget = (target: unknown): target is number =>
    finite(target) && target >= (apca ? 0 : 1) && target <= (apca ? 106 : 21);
  const { foregrounds, policy, selectForeground, formatForeground } = compileForegrounds(
    source,
    canonical,
    measure,
    wide,
  );
  const preset = own(source, 'preset', 'labels');
  if (
    typeof preset !== 'string' ||
    !['labels', 'controls', 'chart', 'subdued', 'mono'].includes(preset)
  )
    fail('INVALID_OPTIONS', 'Unknown preset');
  const scale =
    preset === 'mono'
      ? [0, 0]
      : preset === 'subdued'
        ? [0.2, 0.4]
        : preset === 'chart'
          ? [0.8, 1]
          : [0.6, 0.8];
  const seed = own(source, 'seed', 0);
  if (!finite(seed) || !Number.isInteger(seed) || seed < 0 || seed > 0xffffffff)
    fail('INVALID_OPTIONS', 'seed must be uint32');
  const domain = compileHueDomain(
    own(source, 'hueRange', [0, 360]),
    own(source, 'excludeHues', []),
  );
  const { hueDomain, excludesHue } = domain;
  const { normalize, form, casing, space } = compileNormalization(source);
  const namespace = textValue(own(source, 'namespace', ''), 'namespace', 'INVALID_OPTIONS');
  const contrastTarget = own(source, 'contrastTarget', apca ? 60 : preset === 'controls' ? 7 : 4.5);
  if (!validTarget(contrastTarget)) {
    fail('INVALID_OPTIONS', 'contrastTarget outside the selected model range');
  }
  const roles = [
    'fill',
    'fillHover',
    'fillActive',
    'border',
    'text',
    'textOnSubtle',
    'strong',
  ] as const;
  const overrides = record(own(source, 'contrastTargets', {}), roles, 'contrastTargets');
  const targets = {} as ResolvedOptions['targets'];
  for (const role of roles) {
    const target = own(
      overrides,
      role,
      role === 'border' && !apca ? Math.min(3, contrastTarget) : contrastTarget,
    );
    if (!validTarget(target)) fail('INVALID_OPTIONS', `invalid contrastTargets.${role}`);
    targets[role] = target;
  }
  const { backgrounds, profiles } = compileThemes(source, scale);
  const { brand, anchor, paletteMode, palette, pairs, originalNames } = compileBrand(
    source,
    normalize,
    canonical,
    measure,
    selectForeground,
    targets,
    hueDomain,
  );
  const hueRange = structuredClone(own(source, 'hueRange', [0, 360]));
  const exclusions = structuredClone(own(source, 'excludeHues', [])) as number[][];
  exclusions.sort((a, b) => Number(a[0]) - Number(b[0]) || Number(a[1]) - Number(b[1]));
  const exportOptions = () => ({
    preset,
    seed,
    namespace,
    hueRange,
    excludeHues: exclusions,
    normalize: { unicode: form, case: casing, whitespace: space },
    ...(wide ? { gamut } : {}),
    ...(apca ? { contrastModel } : {}),
    contrastTarget,
    contrastTargets: targets,
    profiles,
    backgrounds: { light: hexFormat(backgrounds.light), dark: hexFormat(backgrounds.dark) },
    foregroundPolicy: policy,
    foregrounds: foregrounds.map(hexFormat),
    overrides: Object.fromEntries(
      [...pairs].map(([name, pair]) => [
        originalNames.get(name) ?? name,
        { light: hexFormat(pair.light), dark: hexFormat(pair.dark) },
      ]),
    ),
    ...(paletteMode === 'anchors' ? { paletteMode } : {}),
    ...(palette.length
      ? {
          palette: [...palette]
            .sort((a, b) => compareBytes(a.id, b.id))
            .map((entry) => ({
              id: entry.name,
              light: hexFormat(entry.light),
              dark: hexFormat(entry.dark),
            })),
        }
      : {}),
  });
  return {
    segments: domain.segments,
    exclusions: domain.exclusions,
    gamut,
    canonical,
    contrastModel,
    measure,
    exportOptions,
    anchor,
    brand,
    selectForeground,
    formatForeground,
    hueDomain,
    excludesHue,
    normalize,
    targets,
    seed,
    namespace: normalize(namespace),
    backgrounds,
    contrastTarget,
    profiles,
  };
}

/**
 * Resolves exact text to coordinated light and dark theme colors.
 *
 * The text is hashed with SHA-256 together with the algorithm identifier and
 * the namespace, and the digest drives hue, lightness, and chroma sampling
 * for ten roles in each theme. Colors are fitted to the selected gamut.
 * Each theme reports the seven contrast relationships.
 *
 * Identity preserves exact text by default. The normalize option applies Unicode form,
 * lowercase mapping, and whitespace handling to both text and namespace before hashing. Runtime Unicode tables can affect normalized identities.
 *
 * @param text - Any well-formed Unicode string, including the empty string.
 * @param options - Optional namespace, backgrounds, contrast target, and profiles. Omit for defaults; `null` is invalid.
 * @returns The complete color set. Throws with `TextColorError` on invalid input.
 *
 * @example
 * ```ts
 * const colors = resolveTextColors('research');
 * colors.light.fill.hex; // '#59b8d8'
 * colors.dark.fill.hex;  // '#255464'
 * ```
 */
export function resolveTextColors(
  text: string,
  options: TextColorOptions,
  selection: Only,
): Projection;
/** @deprecated Pass the output selection separately or use resolver.project(text, selection). */
export function resolveTextColors(
  text: string,
  options: TextColorOptions & { only: Only },
): Projection;
export function resolveTextColors(text: string, options?: TextColorOptions): ColorSet;
export function resolveTextColors(
  text: string,
  options: TextColorOptions & { only?: Only } = {},
  selection?: Only,
): ColorSet | Projection {
  textValue(text, 'text', 'INVALID_TEXT');
  if (options && Object.hasOwn(options, 'only')) {
    const { only, ...settings } = options;
    if (!only || selection !== undefined)
      fail('INVALID_OPTIONS', 'Invalid or conflicting selection');
    return compileRenderer(settings).project(text, only);
  }
  const renderer = compileRenderer(options);
  return selection === undefined ? renderer.resolve(text) : renderer.project(text, selection);
}

export type ColorRole = Exclude<keyof ThemeColors, 'contrast'>;
type Slot = 'light' | 'dark';
type Format = keyof ThemeColors['background'];
export type Only = {
  themes?: readonly Slot[];
  roles?: readonly ColorRole[];
  formats?: readonly Format[];
};
type Projection = Partial<
  Record<Slot, Partial<Record<ColorRole, Partial<ThemeColors['background']>>>>
>;
export type Selection = { theme: 'light' | 'dark'; role: ColorRole };

export function compileRenderer(options: TextColorOptions = {}) {
  const settings = optionsValue(options);
  const encoder = new TextEncoder();
  const prefix = encoder.encode(`${VERSION}\0`);
  const namespace = encoder.encode(settings.namespace);
  if (namespace.length > 0xffffffff)
    fail('INVALID_OPTIONS', 'namespace exceeds the v1 byte-length limit');
  const header = new DataView(new ArrayBuffer(8));
  header.setUint32(0, settings.seed);
  header.setUint32(4, namespace.length);
  const baseColor = (rgb: Triple) => {
    const channels = settings.canonical(rgb);
    const color = settings.gamut === 'srgb' ? formats(channels) : p3Formats(channels);
    return {
      channels,
      color,
      luminance: luminance(channels, settings.gamut === 'display-p3' ? P3_TO_XYZ[1] : undefined),
      lightness: Math.round(color.oklch.l * 4096) / 4096,
    };
  };
  const bases = {
    light: baseColor(settings.backgrounds.light),
    dark: baseColor(settings.backgrounds.dark),
  };
  const digestOf = (text: string) => {
    const input = encoder.encode(text);
    return sha256(prefix, new Uint8Array(header.buffer), namespace, input);
  };
  const identity = (text: string) => settings.normalize(textValue(text, 'text', 'INVALID_TEXT'));
  const resolveName = (name: string) => render(settings, bases, digestOf(name), name);
  const resolve = (text: string) => resolveName(identity(text));
  const batch = (texts: readonly string[]) => {
    const seen = new Map<string, ColorSet>();
    if (!Array.isArray(texts)) fail('INVALID_TEXT', 'Expected an array of labels');
    return Array.from(texts, (text) => {
      const name = identity(text);
      const previous = seen.get(name);
      if (previous) return structuredClone(previous);
      const result = resolveName(name);
      seen.set(name, result);
      return result;
    });
  };
  const project = (text: string, only: Only, strict = false, placement?: Placement) => {
    if (!only || typeof strict !== 'boolean') fail('INVALID_OPTIONS', 'Invalid projection');
    const name = settings.normalize(textValue(text, 'text', 'INVALID_TEXT'));
    return render(
      settings,
      bases,
      digestOf(name),
      name,
      placement === undefined ? undefined : readPlacement(placement),
      only,
      strict,
    );
  };
  function color<F extends Format>(text: string, selection: Selection & { format: F }): Color[F];
  function color(text: string, selection: Selection): Color;
  function color(text: string, selection: Selection & { format?: Format }) {
    record(selection, ['theme', 'role', 'format'], 'color selection');
    const { theme, role, format } = selection;
    const only: Only = { themes: [theme], roles: [role] };
    if (format !== undefined) only.formats = [format];
    const selected = project(text, only)[theme]?.[role];
    if (!selected) fail('INVALID_OPTIONS', 'Unknown role');
    return format === undefined ? (selected as Color) : selected[format];
  }
  const hex = (text: string, selection: Selection & { strict?: boolean }) => {
    record(selection, ['theme', 'role', 'strict'], 'hex selection');
    const { theme, role, strict = false } = selection;
    if (typeof strict !== 'boolean') fail('INVALID_OPTIONS', 'strict must be boolean');
    const selected = project(text, { themes: [theme], roles: [role], formats: ['hex'] }, strict)[
      theme
    ]?.[role]?.hex;
    if (!selected) fail('INVALID_OPTIONS', 'Unknown role');
    return selected;
  };
  function readPlacement(raw: unknown): Placement {
    const p = record(raw, ['hueFraction', 'ring', 'moved'], 'registry placement');
    const { hueFraction, ring, moved } = p;
    if (
      !finite(hueFraction) ||
      hueFraction < 0 ||
      hueFraction >= 1 ||
      !finite(ring) ||
      !Number.isSafeInteger(ring) ||
      ring < 0 ||
      typeof moved !== 'boolean'
    )
      fail('INVALID_OPTIONS', 'Invalid registry placement');
    return { hueFraction, ring, moved };
  }
  const renderPlacement = (digest: DataView, placement: Placement, name: string) =>
    render(settings, bases, digest, name, placement);
  const fixedFraction = (name: string, digest: DataView) => {
    const entry = settings.brand(name, digest);
    return entry ? fixedIdentity(entry.light).fraction : undefined;
  };
  return {
    resolve,
    batch,
    color,
    hex,
    project,
    identity,
    digestOf,
    renderPlacement,
    fixedFraction,
    readPlacement,
    segments: settings.segments,
    exclusions: settings.exclusions,
    options: settings.exportOptions,
  };
}

export function resolveTextColor<F extends Format>(
  text: string,
  select: Selection & { format: F },
  options?: TextColorOptions,
): Color[F];
export function resolveTextColor(
  text: string,
  select: Selection,
  options?: TextColorOptions,
): Color;
export function resolveTextColor(
  text: string,
  select: Selection & { format?: Format },
  options: TextColorOptions = {},
) {
  const renderer = compileRenderer(options);
  return renderer.color(text, select);
}

function fixedIdentity(rgb: Triple) {
  const hue = (Math.round(formats(rgb).oklch.h * 1024) / 1024) % 360;
  const angle = hue < Number(anchors[0]) ? hue + 360 : hue;
  const i = anchors.findIndex((anchor) => anchor > angle) - 1;
  const fraction =
    (i + (angle - Number(anchors[i])) / (Number(anchors[i + 1]) - Number(anchors[i]))) / 12;
  return { hue, fraction };
}

type Bases = Record<
  Slot,
  { channels: Triple; luminance: number; color: ThemeColors['background']; lightness: number }
>;
// Role dependencies share their computed color within one theme and identity.
function once<T>(compute: () => T): () => T {
  let cached: T | undefined;
  return () => (cached ??= compute());
}

function projectFormats(
  readChannels: () => Triple,
  wide: boolean,
  formatsToRead: NonNullable<Only['formats']>,
  trace: () => Color['trace'],
) {
  const value: Partial<ThemeColors['background']> = {};
  const native = once(readChannels);
  const fallback = once(() => p3Fallback(native()));
  const srgb = () => (wide ? fallback().rgb : native());
  const channels = once(() => p3Channels(native()));
  for (const format of formatsToRead) {
    if (format === 'trace') {
      const traced = trace();
      if (traced) value.trace = traced;
    } else {
      switch (format) {
        case 'hex':
          value.hex = hexFormat(srgb());
          break;
        case 'rgb':
          value.rgb = rgbFormat(srgb());
          break;
        case 'hsl':
          value.hsl = hslFormat(srgb());
          break;
        case 'oklch':
          value.oklch = oklchFormat(native(), wide ? P3_TO_XYZ : undefined);
          break;
        case 'p3':
          value.p3 = rgbFormat(channels());
          break;
        case 'css':
          value.css = p3Css(channels());
          break;
        case 'srgbClipped':
          value.srgbClipped = fallback().srgbClipped;
          break;
      }
    }
  }
  return value;
}

function render(
  settings: ResolvedOptions,
  bases: Bases,
  digest: DataView,
  name: string,
  placement?: Placement,
): ColorSet;
function render(
  settings: ResolvedOptions,
  bases: Bases,
  digest: DataView,
  name: string,
  placement: Placement | undefined,
  only: Only,
  strict?: boolean,
): Projection;
function render(
  settings: ResolvedOptions,
  bases: Bases,
  digest: DataView,
  name: string,
  placement?: Placement,
  only?: Only,
  strict = false,
): ColorSet | Projection {
  const output: Projection = {};
  const roleNames = [
    'background',
    'subtle',
    'muted',
    'fill',
    'onFill',
    'fillHover',
    'fillActive',
    'border',
    'text',
    'strong',
  ] as const;
  const wide = settings.gamut === 'display-p3';
  const display = wide ? p3Formats : formats;
  const matrix = wide ? XYZ_TO_P3 : undefined;
  const formatNames = [
    'hex',
    'rgb',
    'hsl',
    'oklch',
    ...(wide ? (['p3', 'css', 'srgbClipped'] as const) : []),
  ] as const;
  if (only) {
    record(only, ['themes', 'roles', 'formats'], 'only');
    for (const [key, allowed] of [
      ['themes', ['light', 'dark']],
      ['roles', roleNames],
      ['formats', [...formatNames, 'trace']],
    ] as const) {
      const values = only[key];
      if (
        Object.hasOwn(only, key) &&
        (!Array.isArray(values) ||
          !values.length ||
          !values.every((v) => (allowed as readonly string[]).includes(v)))
      )
        fail('INVALID_OPTIONS', 'Invalid selection');
    }
  }
  // The first three big-endian 32-bit digest words become fractions in [0, 1) for hue, lightness, and chroma.
  const fractions = [0, 4, 8].map(
    (offset) => digest.getUint32(offset, false) / 4294967296,
  ) as Triple;
  const hueFraction = placement?.hueFraction ?? fractions[0];
  const ring = (placement?.ring ?? 0) % 5;
  const offset = [0, 0.08, -0.08, 0.16, -0.16][ring] ?? 0;
  const position = hueFraction * 12;
  const index = Math.floor(position);
  const naturalHue = settings.hueDomain(
    (Number(anchors[index]) +
      (Number(anchors[index + 1]) - Number(anchors[index])) * (position - index)) %
      360,
  );
  const brand = settings.brand(name, digest);
  const snappedHue = (rgb: Triple) => (Math.round(formats(rgb).oklch.h * 1024) / 1024) % 360;
  if (brand) {
    fractions[1] = 0.5;
    fractions[2] = 0.5;
  }
  const themes = {} as Record<'light' | 'dark', ThemeColors>;
  for (const theme of ['light', 'dark'] as const) {
    if (only?.themes && !only.themes.includes(theme)) continue;
    const guide = brand ? undefined : settings.anchor(hueFraction, theme);
    const hue = brand ? snappedHue(brand[theme]) : (guide?.hue ?? naturalHue);
    const direction = theme === 'light' ? -1 : 1;
    const {
      channels: background,
      luminance: backgroundY,
      color: base,
      lightness: lb,
    } = bases[theme];
    const sample = (role: 'fill' | 'text') => {
      const profile = settings.profiles[theme][role];
      const sampled =
        profile.lightness[0] + (profile.lightness[1] - profile.lightness[0]) * fractions[1];
      const bias = biases[(theme === 'light' ? 0 : 2) + (role === 'fill' ? 0 : 1)];
      if (!bias) throw new Error('Missing profile bias table');
      const segment = Math.floor(hue / 30);
      const correction =
        Number(bias[segment]) +
        (Number(bias[(segment + 1) % 12]) - Number(bias[segment])) * (hue / 30 - segment);
      return {
        sampled,
        l: Math.max(0, Math.min(1, sampled + correction + offset)),
        scale:
          (profile.chromaScale[0] +
            (profile.chromaScale[1] - profile.chromaScale[0]) * fractions[2]) *
          (ring < 3 ? 1 : 0.6),
        cap: guide ? Math.min(guide.cap, profile.chromaCap) : profile.chromaCap,
      };
    };
    const fillProfile = sample('fill'),
      textProfile = sample('text');
    if (brand) {
      const fixed = formats(brand[theme]);
      fillProfile.l = Math.round(fixed.oklch.l * 4096) / 4096;
      fillProfile.sampled = fillProfile.l;
      if (fixed.oklch.c === 0) {
        fillProfile.cap = 0;
        textProfile.cap = 0;
      }
    }
    const tone = (
      l: number,
      profile: typeof fillProfile,
      backdrop: Triple | null,
      target: number,
      second?: Triple,
      secondTarget = target,
      surface = false,
      requestedL = l,
    ) => {
      const lightness = Math.max(0, Math.min(1, l));
      const chroma = cusp(lightness, hue, matrix) * profile.scale;
      // Each active relationship must pass. Scale the second score to the first
      // target for bisection; a zero target drops that relationship entirely.
      const threshold = target || (second ? secondTarget : 0);
      const gamutScore = (rgb: Triple) => {
        const primary =
          backdrop && !surface
            ? settings.measure(rgb, backdrop)
            : settings.measure(backdrop ?? settings.selectForeground(rgb, target), rgb);
        if (!second || secondTarget === 0) return Math.abs(primary);
        const secondary = Math.abs(settings.measure(rgb, second));
        return target === 0
          ? secondary
          : Math.min(Math.abs(primary), secondary * (target / secondTarget));
      };
      let score = settings.contrastModel === 'apca' || wide ? gamutScore : undefined;
      if (settings.contrastModel === 'wcag2' && backdrop === background) {
        const weights = wide ? P3_TO_XYZ[1] : undefined;
        const secondY = second ? luminance(second, weights) : undefined;
        score = (rgb) => {
          const y = luminance(rgb, weights);
          const primary = contrastRatio(y, backgroundY);
          if (secondY === undefined || secondTarget === 0) return primary;
          const secondary = contrastRatio(y, secondY);
          return target === 0 ? secondary : Math.min(primary, secondary * (target / secondTarget));
        };
      }
      const excludesHue = settings.excludesHue;
      if (excludesHue) {
        const contrastScore = score ?? gamutScore;
        score = (rgb) => {
          if (
            (rgb[0] !== rgb[1] || rgb[1] !== rgb[2]) &&
            excludesHue(oklchFormat(rgb, wide ? P3_TO_XYZ : undefined).h)
          )
            return -Infinity;
          return contrastScore(rgb);
        };
      }
      const result = chooseColor(
        lightness,
        Math.min(chroma, profile.cap),
        hue,
        backdrop,
        threshold,
        second,
        secondTarget,
        settings.selectForeground,
        score,
        matrix,
      );
      if (only?.formats?.includes('trace')) {
        const rawL = Math.max(0, Math.min(1, requestedL));
        const capped = Math.min(chroma, profile.cap);
        result.trace = {
          source: 'generated',
          requested: { l: rawL, c: cusp(rawL, hue, matrix) * profile.scale, h: hue },
          biased: { l: lightness, c: capped, h: hue },
          repaired: { l: result.fitted.lightness, c: capped, h: hue },
          fitted: { l: result.fitted.lightness, c: result.fitted.chroma, h: hue },
        };
      }
      result.metadata.chromaCapped = chroma > profile.cap;
      return result;
    };
    const target = settings.contrastTarget,
      targets = settings.targets;
    const fill = once(() => {
      const chosen = tone(
        fillProfile.l,
        fillProfile,
        null,
        targets.fill,
        undefined,
        targets.fill,
        false,
        fillProfile.sampled,
      );
      if (brand) {
        chosen.rgb = settings.canonical(brand[theme]);
        if (chosen.trace) chosen.trace = { source: 'supplied', hex: hexFormat(brand[theme]) };
        const foreground = settings.selectForeground(chosen.rgb, targets.fill);
        const meetsTarget = Math.abs(settings.measure(foreground, chosen.rgb)) >= targets.fill;
        chosen.metadata = {
          ratio: contrast(foreground, chosen.rgb),
          meetsTarget,
          lightnessAdjusted: false,
          chromaReduced: false,
          chromaCapped: false,
          fallback: meetsTarget ? null : 'palette-constraint',
        };
      }
      return chosen;
    });
    const onFill = once(() => settings.selectForeground(fill().rgb, targets.fill));
    const subtle = once(() =>
      tone(lb + direction * 0.04, fillProfile, null, settings.contrastModel === 'apca' ? 0 : 1),
    );
    const muted = once(() =>
      tone(lb + direction * 0.1, fillProfile, null, settings.contrastModel === 'apca' ? 0 : 1),
    );
    const fillHover = once(() =>
      tone(
        fillProfile.l + direction * 0.025,
        fillProfile,
        onFill(),
        targets.fillHover,
        undefined,
        targets.fillHover,
        true,
        fillProfile.sampled + direction * 0.025,
      ),
    );
    const fillActive = once(() =>
      tone(
        fillProfile.l + direction * 0.05,
        fillProfile,
        onFill(),
        targets.fillActive,
        undefined,
        targets.fillActive,
        true,
        fillProfile.sampled + direction * 0.05,
      ),
    );
    const border = once(() => tone(lb + direction * 0.39, fillProfile, background, targets.border));
    const text = once(() =>
      tone(
        textProfile.l,
        textProfile,
        background,
        targets.text,
        subtle().rgb,
        targets.textOnSubtle,
        false,
        textProfile.sampled,
      ),
    );
    const strong = once(() =>
      tone(
        textProfile.l + direction * 0.1,
        textProfile,
        background,
        targets.strong,
        undefined,
        targets.strong,
        false,
        textProfile.sampled + direction * 0.1,
      ),
    );
    const relationship = (
      color: ChosenColor,
      backdrop: Triple,
      required: number,
      surface = false,
    ) => {
      const ratio = wide ? p3Contrast(color.rgb, backdrop) : contrast(color.rgb, backdrop);
      if (settings.contrastModel === 'apca') {
        const value = surface
          ? settings.measure(backdrop, color.rgb)
          : settings.measure(color.rgb, backdrop);
        return {
          ...color.metadata,
          model: 'apca' as const,
          value,
          ratio,
          meetsTarget: Math.abs(value) >= required,
        };
      }
      return { ...color.metadata, ratio, meetsTarget: ratio >= required };
    };
    if (only) {
      const raw = {
        background: () => background,
        onFill,
        fill: () => fill().rgb,
        subtle: () => subtle().rgb,
        muted: () => muted().rgb,
        fillHover: () => fillHover().rgb,
        fillActive: () => fillActive().rgb,
        border: () => border().rgb,
        text: () => text().rgb,
        strong: () => strong().rgb,
      };
      const selected: Partial<Record<ColorRole, Partial<ThemeColors['background']>>> = {};
      for (const role of only.roles ?? roleNames) {
        if (strict) {
          const requirePair = (name: string, passes: boolean) => {
            if (!passes) fail('UNMET_CONSTRAINT', `${theme}.${name} contrast target was not met`);
          };
          switch (role) {
            case 'fill':
            case 'onFill':
              requirePair('fill', fill().metadata.meetsTarget);
              break;
            case 'fillHover':
              requirePair(role, fillHover().metadata.meetsTarget);
              break;
            case 'fillActive':
              requirePair(role, fillActive().metadata.meetsTarget);
              break;
            case 'border':
              requirePair(role, border().metadata.meetsTarget);
              break;
            case 'strong':
              requirePair(role, strong().metadata.meetsTarget);
              break;
            case 'text':
              requirePair(role, Math.abs(settings.measure(text().rgb, background)) >= targets.text);
              requirePair(
                'textOnSubtle',
                Math.abs(settings.measure(text().rgb, subtle().rgb)) >= targets.textOnSubtle,
              );
              break;
          }
        }
        const readTrace = () => {
          if (role === 'background' || role === 'onFill') {
            const channels = raw[role]();
            return {
              source: 'supplied' as const,
              hex: hexFormat(wide ? p3Fallback(channels).rgb : channels),
            };
          }
          return { subtle, muted, fill, fillHover, fillActive, border, text, strong }[role]().trace;
        };
        selected[role] = projectFormats(raw[role], wide, only.formats ?? formatNames, readTrace);
      }
      output[theme] = selected;
      continue;
    }
    themes[theme] = {
      background: structuredClone(base),
      subtle: display(subtle().rgb),
      muted: display(muted().rgb),
      fill: display(fill().rgb),
      onFill: settings.formatForeground(onFill()),
      fillHover: display(fillHover().rgb),
      fillActive: display(fillActive().rgb),
      border: display(border().rgb),
      text: display(text().rgb),
      strong: display(strong().rgb),
      contrast: {
        target,
        fill: relationship(fill(), onFill(), targets.fill, true),
        fillHover: relationship(fillHover(), onFill(), targets.fillHover, true),
        fillActive: relationship(fillActive(), onFill(), targets.fillActive, true),
        border: relationship(border(), background, targets.border),
        text: relationship(text(), background, targets.text),
        textOnSubtle: relationship(text(), subtle().rgb, targets.textOnSubtle),
        strong: relationship(strong(), background, targets.strong),
      },
    };
  }
  if (only) return output;
  return {
    version: VERSION,
    source: brand?.source ?? (placement ? 'assigned' : 'hash'),
    hueFraction: brand ? fixedIdentity(brand.light).fraction : hueFraction,
    hue: brand
      ? snappedHue(brand.light)
      : (settings.anchor(hueFraction, 'light')?.hue ?? naturalHue),
    light: themes.light,
    dark: themes.dark,
  };
}
