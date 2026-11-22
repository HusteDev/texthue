/**
 * Public option and result types for TextHue.
 *
 * Numeric bounds described here are enforced at runtime by `resolveTextColors`;
 * the types alone cannot express them.
 *
 * @packageDocumentation
 */

/**
 * An ordered `[minimum, maximum]` pair of preferred bounds.
 *
 * Equal endpoints request a fixed value. Lightness adjustment for contrast and
 * chroma reduction for the sRGB gamut may move the final color outside the
 * preferred range. Readonly tuples written with `as const` are accepted.
 */
export type Range = readonly [minimum: number, maximum: number];

/** Preferred OKLCH lightness and chroma ranges for one color role. */
export interface ColorProfile {
  /** Preferred OKLCH lightness range; both endpoints in `0..1`. */
  lightness?: Range;
  /** Preferred OKLCH chroma range; both endpoints in `0..0.4`. `[0, 0]` requests grayscale. */
  chromaCap?: number;
  chromaScale?: Range;
}

/** Profiles for the two color roles of one theme. */
export interface ThemeProfiles {
  /** Badge or surface background color. */
  fill?: ColorProfile;
  /** Text or mark color used directly on the theme background. */
  text?: ColorProfile;
}

/**
 * Options for `resolveTextColors`.
 *
 * Every field is optional and omitted fields keep their defaults. Explicit
 * `null` and unknown keys are invalid at every level. Options are never mutated.
 */
export type ContrastRole = 'fill' | 'fillHover' | 'fillActive' | 'border' | 'text' | 'textOnSubtle' | 'strong';
export interface NormalizeOptions {
  unicode?: 'none'|'NFC'|'NFKC';
  case?: 'none'|'lower';
  whitespace?: 'none'|'trim'|'collapse';
}
export interface TextColorOptions {
  overrides?: Readonly<Record<string,string | {light:string;dark:string}>>;
  palette?: readonly {id:string;light?:string;dark?:string}[];
  foregrounds?: readonly string[];
  foregroundPolicy?: 'best'|'first-passing';
  preset?: 'labels'|'controls'|'chart'|'subdued'|'mono';
  hueRange?: Range;
  excludeHues?: readonly Range[];
  normalize?: NormalizeOptions;
  contrastTargets?: Partial<Record<ContrastRole,number>>;
  /**
   * Domain separator mixed into the hash. Default `''`.
   *
   * Use it to keep separate collections (for example projects and people) from
   * sharing colors. It is exact Unicode text and is not a secret.
   */
  namespace?: string;
  seed?: number;
  /** Theme backgrounds used for text contrast, as opaque `#RRGGBB` strings. Defaults `#ffffff` and `#121212`. */
  backgrounds?: { light?: string; dark?: string };
  /** WCAG contrast ratio required for both contrast pairs in both themes; `1..21` inclusive. Default `4.5`. */
  contrastTarget?: number;
  /** Per-theme, per-role lightness and chroma preferences. */
  profiles?: { light?: ThemeProfiles; dark?: ThemeProfiles };
}

/** sRGB channels as integers in `0..255`. */
export interface RGB { r: number; g: number; b: number }

/** Hue in degrees `[0, 360)`; saturation and lightness in percent, rounded to six decimals. */
export interface HSL { h: number; s: number; l: number }

/** OKLCH lightness in `0..1`, numeric chroma, and hue in degrees `[0, 360)`, rounded to six decimals. */
export interface OKLCH { l: number; c: number; h: number }

/**
 * One opaque sRGB color in four equivalent representations.
 *
 * The RGB bytes are canonical; `hex`, `hsl`, and `oklch` are derived from them.
 */
export interface Color {
  /** Lowercase six-digit `#rrggbb`. */
  hex: string;
  rgb: RGB;
  hsl: HSL;
  oklch: OKLCH;
}

/** Contrast measurement for one color pair and a record of any adjustments made to reach the target. */
export interface ContrastResult {
  /** WCAG contrast ratio of the final RGB pair, at full computational precision. */
  ratio: number;
  /** Whether `ratio` is at least the configured target. */
  meetsTarget: boolean;
  /** Whether lightness was moved away from the sampled value to reach the target. */
  lightnessAdjusted: boolean;
  /** Whether chroma was reduced below the requested value to fit the sRGB gamut. */
  chromaReduced: boolean;
  chromaCapped: boolean;
  /** `'unattainable-contrast'` when no sRGB text can reach the target against the background; otherwise `null`. */
  fallback: 'unattainable-contrast' | 'palette-constraint' | null;
}

/** All colors and contrast measurements for one theme. */
export interface ThemeColors {
  /** The configured theme background. */
  background: Color;
  /** Badge or surface color. */
  fill: Color;
  /** Black or white, whichever contrasts more with `fill`. */
  onFill: Color;
  /** Text or mark color for use on `background`. */
  subtle: Color;
  muted: Color;
  fillHover: Color;
  fillActive: Color;
  border: Color;
  text: Color;
  strong: Color;
  /** The configured target plus measurements for the fill/onFill and text/background pairs. */
  contrast: { target: number } & Record<'fill'|'fillHover'|'fillActive'|'border'|'text'|'textOnSubtle'|'strong', ContrastResult>;
}

/** Complete result of `resolveTextColors`. */
export interface ColorSet {
  source: 'hash'|'assigned'|'palette'|'override';
  /** Algorithm identifier that produced this result. */
  version: 'text-to-color-v1';
  /** Hash-derived identity hue in degrees, unrounded. Shared by all four roles before gamut fitting. */
  hue: number;
  hueFraction: number;
  light: ThemeColors;
  dark: ThemeColors;
}

/** Stable error codes carried by `TextColorError.code`. */
export type TextColorErrorCode = 'INVALID_TEXT' | 'INVALID_OPTIONS' | 'UNMET_CONSTRAINT';

// Internal numerical types are not re-exported by the package entry point.

/** Three numeric channels: linear RGB, RGB bytes, XYZ, LMS, or OKLab depending on context. */
export type Triple = [number, number, number];

/** A 3x3 row-major conversion matrix. */
export type Matrix = [Triple, Triple, Triple];

/** A gamut-fitted color: final RGB bytes plus the retained pre-quantization lightness and chroma. */
export interface FittedColor { rgb: Triple; chroma: number; lightness: number }

/** The selected color for a role and its contrast metadata. */
export interface ChosenColor { rgb: Triple; metadata: ContrastResult }

/** A profile with both ranges present. */
export interface ResolvedProfile { lightness: Range; chromaCap: number; chromaScale: Range }

/** Options after validation, with defaults applied and backgrounds parsed to RGB bytes. */
export interface ResolvedOptions {
  exportOptions: () => Record<string,unknown>;
  brand: (name:string,digest:DataView)=>{light:Triple;dark:Triple;source:'palette'|'override'}|undefined;
  selectForeground: (rgb:Triple, target:number)=>Triple;
  hueDomain: (hue:number)=>number;
  normalize: (text:string)=>string;
  targets: Record<ContrastRole,number>;
  namespace: string;
  seed: number;
  backgrounds: Record<'light' | 'dark', Triple>;
  contrastTarget: number;
  profiles: Record<'light' | 'dark', Record<'fill' | 'text', ResolvedProfile>>;
}
