/**
 * TextHue: deterministic text-to-color for JavaScript and TypeScript.
 *
 * Maps exact Unicode text to coordinated light and dark theme colors using
 * the `text-to-color-v1` algorithm. Results match the TextHue Python and Go
 * libraries for identical inputs and options.
 *
 * @packageDocumentation
 */

import { assignCollection, type Placement } from './assignment.js';
import { chooseColor, contrast, cusp, foreground, formats } from './color-math.js';
import { sha256 } from './sha256.js';
import { anchors, biases } from './tables.js';
import type { ChosenColor, ColorSet, Range, ResolvedOptions, TextColorErrorCode, TextColorOptions, ThemeColors, Triple } from './types.js';

export type { Color, ColorProfile, ColorSet, ContrastResult, HSL, OKLCH, Range, RGB, TextColorErrorCode, TextColorOptions, ThemeColors, ThemeProfiles } from './types.js';

/**
 * Algorithm identifier for the color mapping.
 *
 * It is written into every hashed payload and returned as `ColorSet.version`.
 * It is independent of the package version and changes only when the mapping
 * itself changes.
 */
export const VERSION = 'text-to-color-v1';

/**
 * Error thrown (as a promise rejection) for invalid text or options.
 *
 * The `code` property is stable across the TextHue libraries:
 * `INVALID_TEXT` for a malformed `text` argument and `INVALID_OPTIONS` for
 * any invalid option, including an invalid `namespace`.
 */
export class TextColorError extends TypeError {
  /** Language-neutral error code. */
  readonly code: TextColorErrorCode;

  /**
   * @param code - Stable error code.
   * @param message - Human-readable detail; wording is not part of the contract.
   */
  constructor(code: TextColorErrorCode, message: string) {
    super(message);
    this.name = 'TextColorError';
    this.code = code;
  }
}

/** Throws a `TextColorError`; typed as `never` so callers can use it in expressions. */
function fail(code: TextColorErrorCode, message: string): never { throw new TextColorError(code, message); }

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
function textValue(value: unknown, path: string, code: TextColorErrorCode): string {
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
function record(value: unknown, keys: readonly string[], path: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) {
    fail('INVALID_OPTIONS', `${path} must be an object`);
  }
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string' || !keys.includes(key)) fail('INVALID_OPTIONS', `${path} contains an unknown option: ${String(key)}`);
  }
  return value as Record<string, unknown>;
}

/** Returns an own property value, or `fallback` when the key is absent. An explicit `undefined` is returned as-is. */
const own = (object: Record<string, unknown>, key: string, fallback: unknown): unknown => Object.hasOwn(object, key) ? object[key] : fallback;

/** Type guard for finite numbers; rejects `NaN`, infinities, and non-number types. */
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

/**
 * Validates an ordered `[minimum, maximum]` pair within `0..maximum`.
 *
 * @param value - Candidate value.
 * @param maximum - Inclusive upper bound for both endpoints.
 * @param path - Option path used in error messages.
 * @returns A fresh two-element tuple.
 */
function range(value: unknown, maximum: number, path: string): Range {
  if (!Array.isArray(value) || value.length !== 2 || !finite(value[0])
    || !finite(value[1]) || value[0] < 0 || value[0] > value[1] || value[1] > maximum) {
    fail('INVALID_OPTIONS', `${path} must be [minimum, maximum] within 0..${maximum}`);
  }
  return [value[0], value[1]];
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
function compileHueDomain(allowed:unknown, excluded:unknown) {
  const split = (arc:unknown):Range[] => {
    if (!Array.isArray(arc) || arc.length !== 2 || !arc.every(x => finite(x) && x >= 0 && x <= 360)) {
      fail('INVALID_OPTIONS','Hue intervals need two endpoints from 0 to 360');
    }
    const [a,b] = arc;
    return a <= b ? [[a,b]] : [[0,b],[a,360]];
  };
  if (!Array.isArray(excluded) || excluded.length > 16) fail('INVALID_OPTIONS','Invalid excluded hues');
  let segments = split(allowed);
  for (const arc of excluded) for (const [a,b] of split(arc)) {
    segments = segments.flatMap(([lo,hi]):Range[] => [[lo,Math.min(hi,a)],[Math.max(lo,b),hi]])
      .filter(([lo,hi])=>lo<hi);
  }
  segments = segments.filter(([lo,hi])=>lo<hi);
  const width = segments.reduce((sum,[lo,hi])=>sum+hi-lo,0);
  if (!width) fail('INVALID_OPTIONS','Empty hue domain');
  if (width === 360) return (h:number)=>h;
  return (h:number) => {
    let distance = h / 360 * width;
    for (const [lo,hi] of segments) {
      if (distance < hi-lo) return lo+distance;
      distance -= hi-lo;
    }
    return segments[0]?.[0] ?? 0;
  };
}

function optionsValue(options: unknown): ResolvedOptions {
  const source = record(options, ['preset','hueRange','excludeHues','normalize','namespace', 'seed', 'backgrounds', 'contrastTarget', 'contrastTargets', 'profiles'], 'options');
  const preset = own(source,'preset','labels');
  if (typeof preset !== 'string' || !['labels','controls','chart','subdued','mono'].includes(preset)) fail('INVALID_OPTIONS','Unknown preset');
  const scale = preset === 'mono' ? [0,0] : preset === 'subdued' ? [0.2,0.4] : preset === 'chart' ? [0.8,1] : [0.6,0.8];
  const seed = own(source, 'seed', 0);
  if (!finite(seed) || !Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) fail('INVALID_OPTIONS', 'seed must be uint32');
  const hueDomain = compileHueDomain(own(source,'hueRange',[0,360]),own(source,'excludeHues',[]));
  const rules = record(own(source,'normalize',{}), ['unicode','case','whitespace'], 'normalize');
  const form = own(rules,'unicode','none'), casing = own(rules,'case','none'), space = own(rules,'whitespace','none');
  if (form !== 'none' && form !== 'NFC' && form !== 'NFKC') fail('INVALID_OPTIONS','invalid normalize.unicode');
  if (casing !== 'none' && casing !== 'lower') fail('INVALID_OPTIONS','invalid normalize.case');
  if (space !== 'none' && space !== 'trim' && space !== 'collapse') fail('INVALID_OPTIONS','invalid normalize.whitespace');
  const normalize = (input:string) => {
    let value = form === 'none' ? input : input.normalize(form);
    if (casing === 'lower') value = value.toLowerCase();
    if (space !== 'none') value = value.replace(/^\p{White_Space}+|\p{White_Space}+$/gu,'');
    if (space === 'collapse') value = value.replace(/\p{White_Space}+/gu,' ');
    return value;
  };
  const namespace = textValue(own(source, 'namespace', ''), 'namespace', 'INVALID_OPTIONS');
  const contrastTarget = own(source, 'contrastTarget', preset === 'controls' ? 7 : 4.5);
  if (!finite(contrastTarget) || contrastTarget < 1 || contrastTarget > 21) {
    fail('INVALID_OPTIONS', 'contrastTarget must be a finite number from 1 through 21');
  }
  const roles = ['fill','fillHover','fillActive','border','text','textOnSubtle','strong'] as const;
  const overrides = record(own(source,'contrastTargets',{}), roles, 'contrastTargets');
  const targets = {} as ResolvedOptions['targets'];
  for (const role of roles) {
    const target = own(overrides,role,role === 'border' ? Math.min(3,contrastTarget) : contrastTarget);
    if (!finite(target) || target < 1 || target > 21) fail('INVALID_OPTIONS', `invalid contrastTargets.${role}`);
    targets[role] = target;
  }
  const backgroundsSource = record(own(source, 'backgrounds', {}), ['light', 'dark'], 'backgrounds');
  const profilesSource = record(own(source, 'profiles', {}), ['light', 'dark'], 'profiles');
  const backgrounds = {} as ResolvedOptions['backgrounds'];
  const profiles = {} as ResolvedOptions['profiles'];
  for (const theme of ['light', 'dark'] as const) {
    const background = own(backgroundsSource, theme, theme === 'light' ? '#ffffff' : '#121212');
    if (typeof background !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(background)) {
      fail('INVALID_OPTIONS', `backgrounds.${theme} must be opaque #RRGGBB`);
    }
    backgrounds[theme] = [1, 3, 5].map(index => parseInt(background.slice(index, index + 2), 16)) as Triple;
    const themeSource = record(own(profilesSource, theme, {}), ['fill', 'text'], `profiles.${theme}`);
    profiles[theme] = {} as ResolvedOptions['profiles']['light'];
    for (const role of ['fill', 'text'] as const) {
      const path = `profiles.${theme}.${role}`;
      const profile = record(own(themeSource, role, {}), ['lightness', 'chromaScale', 'chromaCap'], path);
      const defaultLightness = theme === 'light'
        ? (role === 'fill' ? [0.72, 0.82] : [0.43, 0.53])
        : (role === 'fill' ? [0.4, 0.5] : [0.72, 0.82]);
      const cap = own(profile, 'chromaCap', role === 'fill' ? 0.16 : 0.19);
      if (!finite(cap) || cap < 0 || cap > 0.4) fail('INVALID_OPTIONS', 'invalid chromaCap');
      profiles[theme][role] = {
        lightness: range(own(profile, 'lightness', defaultLightness), 1, `${path}.lightness`),
        chromaCap: cap,
        chromaScale: range(own(profile, 'chromaScale', scale), 1, `${path}.chromaScale`),
      };
    }
  }
  return { hueDomain, normalize, targets, seed, namespace:normalize(namespace), backgrounds, contrastTarget, profiles };
}

/**
 * Resolves exact text to coordinated light and dark theme colors.
 *
 * The text is hashed with SHA-256 together with the algorithm identifier and
 * the namespace, and the digest drives hue, lightness, and chroma sampling
 * for four OKLCH profiles. Each color is gamut-fitted to sRGB, checked against
 * the contrast target, and returned in Hex, RGB, HSL, and OKLCH.
 *
 * Text is used exactly as given: no trimming, case folding, or Unicode
 * normalization is applied. The same text and options produce the same
 * result in every TextHue library. No input is retained after the call.
 *
 * @param text - Any well-formed Unicode string, including the empty string.
 * @param options - Optional namespace, backgrounds, contrast target, and profiles. Omit for defaults; `null` is invalid.
 * @returns The complete color set. Throws with `TextColorError` on invalid input.
 *
 * @example
 * ```ts
 * const colors = await resolveTextColors('research');
 * colors.light.fill.hex; // '#59b8d8'
 * colors.dark.fill.hex;  // '#255464'
 * ```
 */
export function resolveTextColors(text: string, options: TextColorOptions = {}): ColorSet {
  textValue(text, 'text', 'INVALID_TEXT');
  return createResolver(options).resolve(text);
}

export type ColorRole = Exclude<keyof ThemeColors, 'contrast'>;
export type Selection = {theme: 'light'|'dark'; role: ColorRole};

export function createResolver(options: TextColorOptions = {}) {
  const settings = optionsValue(options);
  const encoder = new TextEncoder();
  const prefix = encoder.encode(`${VERSION}\0`);
  const namespace = encoder.encode(settings.namespace);
  if (namespace.length > 0xffffffff) fail('INVALID_OPTIONS', 'namespace exceeds the v1 byte-length limit');
  const header = new DataView(new ArrayBuffer(8));
  header.setUint32(0, settings.seed);
  header.setUint32(4, namespace.length);
  const bases = {light: formats(settings.backgrounds.light), dark: formats(settings.backgrounds.dark)};
  const digestOf = (text: string) => {
    const input = encoder.encode(settings.normalize(textValue(text, 'text', 'INVALID_TEXT')));
    return sha256(prefix, new Uint8Array(header.buffer), namespace, input);
  };
  const resolve = (text:string) => render(settings,bases,digestOf(text));
  const assign = (texts:readonly string[], {pinned = {}}: {pinned?: Record<string,Placement>} = {}) =>
    assignCollection(texts, pinned, text => settings.normalize(textValue(text, 'text', 'INVALID_TEXT')),digestOf,
      (digest,placement) => render(settings,bases,digest,placement));
  const batch = (texts: readonly string[]) => {
    const seen = new Map<string,ColorSet>();
    return texts.map(text => {
      const previous = seen.get(text);
      if (previous) return structuredClone(previous);
      const result = resolve(text);
      seen.set(text,result);
      return result;
    });
  };
  const color = (text: string, select: Selection) => resolve(text)[select.theme][select.role];
  const hex = (text: string, select: Selection) => color(text, select).hex;
  return {resolve,batch,color,hex,assign};
}

export function resolveTextColor(text: string, select: Selection, options: TextColorOptions = {}) {
  return createResolver(options).color(text,select);
}

function render(settings: ResolvedOptions, bases: Record<'light'|'dark',ThemeColors['background']>, digest: DataView, placement?: Placement): ColorSet {
  // The first three big-endian 32-bit digest words become fractions in [0, 1) for hue, lightness, and chroma.
  const fractions = [0, 4, 8].map(offset => digest.getUint32(offset, false) / 4294967296) as Triple;
  const hueFraction = placement?.hueFraction ?? fractions[0];
  const ring = (placement?.ring ?? 0) % 5;
  const offset = [0,0.08,-0.08,0.16,-0.16][ring] ?? 0;
  const position = hueFraction * 12;
  const index = Math.floor(position);
  const hue = settings.hueDomain((Number(anchors[index]) + (Number(anchors[index+1]) - Number(anchors[index])) * (position-index)) % 360);
  const themes = {} as Record<'light' | 'dark', ThemeColors>;
  for (const theme of ['light', 'dark'] as const) {
    const direction = theme === 'light' ? -1 : 1;
    const background = settings.backgrounds[theme];
    const base = bases[theme];
    const lb = Math.round(base.oklch.l * 4096) / 4096;
    const sample = (role: 'fill' | 'text') => {
      const profile = settings.profiles[theme][role];
      const sampled = profile.lightness[0] + (profile.lightness[1] - profile.lightness[0]) * fractions[1];
      const bias = biases[(theme === 'light' ? 0 : 2) + (role === 'fill' ? 0 : 1)];
      if (!bias) throw new Error('Missing profile bias table');
      const segment = Math.floor(hue / 30);
      const correction = Number(bias[segment]) + (Number(bias[(segment+1)%12]) - Number(bias[segment])) * (hue/30-segment);
      return { l: Math.max(0, Math.min(1, sampled + correction + offset)),
        scale: (profile.chromaScale[0] + (profile.chromaScale[1]-profile.chromaScale[0])*fractions[2]) * (ring < 3 ? 1 : 0.6), cap: profile.chromaCap };
    };
    const fillProfile = sample('fill'), textProfile = sample('text');
    const tone = (l: number, profile: typeof fillProfile, backdrop: Triple | null, target: number, second?: Triple, secondTarget = target) => {
      const lightness = Math.max(0, Math.min(1, l));
      const chroma = cusp(lightness, hue) * profile.scale;
      const result = chooseColor(lightness, Math.min(chroma, profile.cap), hue, backdrop, target, second, secondTarget);
      result.metadata.chromaCapped = chroma > profile.cap;
      return result;
    };
    const target = settings.contrastTarget, targets = settings.targets;
    const subtle = tone(lb + direction*0.04, fillProfile, null, 1);
    const muted = tone(lb + direction*0.10, fillProfile, null, 1);
    const fill = tone(fillProfile.l, fillProfile, null, targets.fill);
    const onFill = foreground(fill.rgb);
    const hover = tone(fillProfile.l + direction*0.025, fillProfile, onFill, targets.fillHover);
    const active = tone(fillProfile.l + direction*0.05, fillProfile, onFill, targets.fillActive);
    const border = tone(lb + direction*0.39, fillProfile, background, targets.border);
    const text = tone(textProfile.l, textProfile, background, targets.text, subtle.rgb, targets.textOnSubtle);
    const strong = tone(textProfile.l + direction*0.10, textProfile, background, targets.strong);
    const relationship = (color: ChosenColor, backdrop: Triple, required: number) => {
      const ratio = contrast(color.rgb, backdrop);
      return {...color.metadata, ratio, meetsTarget: ratio >= required};
    };
    themes[theme] = {background: structuredClone(base), subtle: formats(subtle.rgb), muted: formats(muted.rgb),
      fill: formats(fill.rgb), onFill: formats(onFill), fillHover: formats(hover.rgb), fillActive: formats(active.rgb),
      border: formats(border.rgb), text: formats(text.rgb), strong: formats(strong.rgb),
      contrast: {target, fill: fill.metadata, fillHover: hover.metadata, fillActive: active.metadata, border: border.metadata,
        text: relationship(text,background,targets.text), textOnSubtle: relationship(text,subtle.rgb,targets.textOnSubtle), strong: strong.metadata}};

  }
  return { version: VERSION, hueFraction, hue, light: themes.light, dark: themes.dark };
}


export function assignTextColors(texts: readonly string[], options: TextColorOptions = {}, pinned: Record<string,Placement> = {}) {
  return createResolver(options).assign(texts,{pinned});
}
export { cssVariables, toCss } from './css.js';
