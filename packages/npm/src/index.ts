/**
 * TextHue: deterministic text-to-color for JavaScript and TypeScript.
 *
 * Maps exact Unicode text to coordinated light and dark theme colors using
 * the `text-to-color-v1` algorithm. Results match the TextHue Python and Go
 * libraries for identical inputs and options.
 *
 * @packageDocumentation
 */
import { sha256 } from './sha256.js';
import { chooseColor, foreground, formats } from './color-math.js';
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
function optionsValue(options: unknown): ResolvedOptions {
  const source = record(options, ['namespace', 'backgrounds', 'contrastTarget', 'profiles'], 'options');
  const namespace = textValue(own(source, 'namespace', ''), 'namespace', 'INVALID_OPTIONS');
  const contrastTarget = own(source, 'contrastTarget', 4.5);
  if (!finite(contrastTarget) || contrastTarget < 1 || contrastTarget > 21) {
    fail('INVALID_OPTIONS', 'contrastTarget must be a finite number from 1 through 21');
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
    const themeSource = record(own(profilesSource, theme, {}), ['fill', 'accent'], `profiles.${theme}`);
    profiles[theme] = {} as ResolvedOptions['profiles']['light'];
    for (const role of ['fill', 'accent'] as const) {
      const path = `profiles.${theme}.${role}`;
      const profile = record(own(themeSource, role, {}), ['lightness', 'chroma'], path);
      const defaultLightness = theme === 'light'
        ? (role === 'fill' ? [0.72, 0.82] : [0.45, 0.55])
        : (role === 'fill' ? [0.4, 0.5] : [0.72, 0.82]);
      profiles[theme][role] = {
        lightness: range(own(profile, 'lightness', defaultLightness), 1, `${path}.lightness`),
        chroma: range(own(profile, 'chroma', [0.1, 0.16]), 0.4, `${path}.chroma`),
      };
    }
  }
  return { namespace, backgrounds, contrastTarget, profiles };
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
 * colors.light.fill.hex; // '#bf97fc'
 * colors.dark.fill.hex;  // '#5f3692'
 * ```
 */
export function resolveTextColors(text: string, options: TextColorOptions = {}): ColorSet {
  textValue(text, 'text', 'INVALID_TEXT');
  const settings = optionsValue(options);
  const encoder = new TextEncoder();
  const prefix = encoder.encode(`${VERSION}\0`);
  const namespace = encoder.encode(settings.namespace);
  const input = encoder.encode(text);
  if (namespace.length > 0xffffffff) fail('INVALID_OPTIONS', 'namespace exceeds the v1 byte-length limit');
  // Payload: VERSION, NUL, namespace byte length (uint32 big-endian), namespace, text.
  const header = new DataView(new ArrayBuffer(4));
  header.setUint32(0, namespace.length);
  const digest = sha256(prefix, new Uint8Array(header.buffer), namespace, input);
  // The first three big-endian 32-bit digest words become fractions in [0, 1) for hue, lightness, and chroma.
  const fractions = [0, 4, 8].map(offset => digest.getUint32(offset, false) / 4294967296) as Triple;
  const hue = fractions[0] * 360;
  const themes = {} as Record<'light' | 'dark', ThemeColors>;
  for (const theme of ['light', 'dark'] as const) {
    const colors = {} as Record<'fill' | 'accent', ChosenColor>;
    for (const role of ['fill', 'accent'] as const) {
      const profile = settings.profiles[theme][role];
      const lightness = profile.lightness[0] + (profile.lightness[1] - profile.lightness[0]) * fractions[1];
      const chroma = profile.chroma[0] + (profile.chroma[1] - profile.chroma[0]) * fractions[2];
      // A fill is measured against its own black/white foreground; an accent against the theme background.
      colors[role] = chooseColor(lightness, chroma, hue,
        role === 'accent' ? settings.backgrounds[theme] : null, settings.contrastTarget);
    }
    themes[theme] = {
      background: formats(settings.backgrounds[theme]),
      fill: formats(colors.fill.rgb),
      onFill: formats(foreground(colors.fill.rgb)),
      accent: formats(colors.accent.rgb),
      contrast: {
        target: settings.contrastTarget,
        fill: colors.fill.metadata,
        accent: colors.accent.metadata,
      },
    };
  }
  return { version: VERSION, hue, light: themes.light, dark: themes.dark };
}
