/**
 * Color conversion, gamut fitting, contrast measurement, and output formatting.
 *
 * Conversion equations and matrices are taken from W3C CSS Color 4
 * (1 September 2026); see THIRD_PARTY_NOTICES.md. The order of floating-point
 * operations is part of the `text-to-color-v1` contract and must not change.
 *
 * @packageDocumentation
 */
import type { ChosenColor, Color, FittedColor, Matrix, Triple } from './types.js';

/** OKLab to non-linear LMS (specification matrix M1). */
const LAB_TO_LMS: Matrix = [
  [1, 0.3963377773761749, 0.2158037573099136],
  [1, -0.1055613458156586, -0.0638541728258133],
  [1, -0.0894841775298119, -1.2914855480194092],
];
/** LMS to XYZ D65 (M2). */
const LMS_TO_XYZ: Matrix = [
  [1.2268798758459243, -0.5578149944602171, 0.2813910456659647],
  [-0.0405757452148008, 1.112286803280317, -0.0717110580655164],
  [-0.0763729366746601, -0.4214933324022432, 1.5869240198367816],
];
/** XYZ D65 to linear sRGB (M3). Rational entries are evaluated as binary64 divisions. */
const XYZ_TO_RGB: Matrix = [
  [12831 / 3959, -329 / 214, -1974 / 3959],
  [-851781 / 878810, 1648619 / 878810, 36519 / 878810],
  [705 / 12673, -2585 / 12673, 705 / 667],
];
export const XYZ_TO_P3: Matrix = [
    [446124 / 178915, -333277 / 357830, -72051 / 178915],
    [-14852 / 17905, 63121 / 35810, 423 / 17905],
    [11844 / 330415, -50337 / 660830, 316169 / 330415],
];
export const P3_TO_XYZ: Matrix = [
    [608311 / 1250200, 189793 / 714400, 198249 / 1000160],
    [35783 / 156275, 247089 / 357200, 198249 / 2500400],
    [0 / 1, 32229 / 714400, 5220557 / 5000800],
];
/** Linear sRGB to XYZ D65 (M4). */
const RGB_TO_XYZ: Matrix = [
  [506752 / 1228815, 87881 / 245763, 12673 / 70218],
  [87098 / 409605, 175762 / 245763, 12673 / 175545],
  [7918 / 409605, 87881 / 737289, 1001167 / 1053270],
];
/** XYZ D65 to LMS (M5). */
const XYZ_TO_LMS: Matrix = [
  [0.819022437996703, 0.3619062600528904, -0.1288737815209879],
  [0.0329836539323885, 0.9292868615863434, 0.0361446663506424],
  [0.0481771893596242, 0.2642395317527308, 0.6335478284694309],
];
/** Cube-root LMS to OKLab (M6). */
const LMS_TO_LAB: Matrix = [
  [0.210454268309314, 0.7936177747023054, -0.0040720430116193],
  [1.9779985324311684, -2.42859224204858, 0.450593709617411],
  [0.0259040424655478, 0.7827717124575296, -0.8086757549230774],
];

/** Multiplies a 3x3 matrix by a column vector. Each row is evaluated as `(m0*v0 + m1*v1) + m2*v2`. */
export const multiply = (matrix: Matrix, v: Triple): Triple => matrix.map(row =>
  row[0] * v[0] + row[1] * v[1] + row[2] * v[2]) as Triple;
/** Clamps a linear channel to `[0, 1]`. */
const clamp = (x: number) => Math.max(0, Math.min(1, x));
/** Whether every linear channel lies within the sRGB gamut, allowing `1e-12` of floating-point residue. */
const inside = (rgb: Triple) => rgb.every(x => x >= -1e-12 && x <= 1 + 1e-12);
/** Rounds half up to six decimal places. */
const round6 = (x: number) => Math.floor(x * 1e6 + 0.5) / 1e6;
/** Normalizes an angle in degrees into `[0, 360)`. */
const hueDegrees = (x: number) => ((x % 360) + 360) % 360;
/** sRGB transfer function: encoded channel to linear light. */
export const decode = (x: number) => x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
/** sRGB transfer function: linear light to encoded channel. */
export const encode = (x: number) => x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055;

/**
 * Converts OKLCH coordinates to linear sRGB without clamping.
 *
 * Channels outside `[0, 1]` indicate a color outside the sRGB gamut.
 *
 * @param lightness - OKLCH lightness in `0..1`.
 * @param chroma - OKLCH chroma.
 * @param hue - OKLCH hue in degrees.
 * @returns Linear sRGB channels.
 */
export function oklchToLinear(lightness: number, chroma: number, hue: number, target:Matrix = XYZ_TO_RGB): Triple {
  const angle = hue * Math.PI / 180;
  const lab: Triple = [lightness, chroma * Math.cos(angle), chroma * Math.sin(angle)];
  const lms = multiply(LAB_TO_LMS, lab).map(x => x * x * x) as Triple;
  return multiply(target, multiply(LMS_TO_XYZ, lms));
}

/**
 * Fits an OKLCH color into the sRGB gamut and quantizes it to RGB bytes.
 *
 * Lightness and hue are preserved. If the requested chroma is out of gamut,
 * chroma is reduced with exactly 24 binary-search iterations. Lightness `0`
 * and `1` short-circuit to black and white. Channels are gamma-encoded,
 * clamped, and rounded half up.
 *
 * @param lightness - OKLCH lightness in `0..1`.
 * @param chroma - Requested OKLCH chroma.
 * @param hue - OKLCH hue in degrees.
 * @returns Final RGB bytes plus the retained chroma and the input lightness.
 */
export function cusp(lightness: number, hue: number, target:Matrix = XYZ_TO_RGB): number {
  if (lightness === 0 || lightness === 1) return 0;
  let low = 0, high = 0.4;
  for (let i = 0; i < 20; i++) {
    const mid = (low + high) / 2;
    if (inside(oklchToLinear(lightness, mid, hue,target))) low = mid;
    else high = mid;
  }
  return low;
}

export function fitColor(lightness: number, chroma: number, hue: number, target:Matrix = XYZ_TO_RGB): FittedColor {
  if (lightness === 0 || lightness === 1) {
    return { rgb: [lightness * 255, lightness * 255, lightness * 255], chroma: 0, lightness };
  }
  let retained = chroma;
  let linear = oklchToLinear(lightness, retained, hue,target);
  if (!inside(linear)) {
    let low = 0;
    let high = chroma;
    for (let i = 0; i < 24; i++) {
      const mid = (low + high) / 2;
      if (inside(oklchToLinear(lightness, mid, hue,target))) low = mid;
      else high = mid;
    }
    retained = low;
    linear = oklchToLinear(lightness, retained, hue,target);
  }
  return {
    rgb: linear.map(x => Math.floor(encode(clamp(x)) * 255 + 0.5)) as Triple,
    chroma: retained,
    lightness,
  };
}

/**
 * Computes WCAG relative luminance from RGB bytes.
 *
 * @param rgb - Integer channels in `0..255`.
 * @returns Relative luminance in `0..1`.
 */
export function luminance(rgb: Triple, weights:Triple = [0.2126,0.7152,0.0722]): number {
  const [r, g, b] = rgb.map(x => decode(x / 255)) as Triple;
  return weights[0]*r + weights[1]*g + weights[2]*b;
}

/**
 * Computes the WCAG contrast ratio between two RGB colors.
 *
 * @returns A ratio in `1..21`, at full computational precision.
 */
export function contrast(first: Triple, second: Triple, weights?:Triple): number {
  const a = luminance(first,weights);
  const b = luminance(second,weights);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/**
 * Chooses black or white as the foreground for a color, whichever contrasts more.
 *
 * An exact tie selects black.
 *
 * @param rgb - The background color as RGB bytes.
 * @returns `[0, 0, 0]` or `[255, 255, 255]`.
 */
export function foreground(rgb: Triple): Triple {
  const black: Triple = [0, 0, 0];
  const white: Triple = [255, 255, 255];
  return contrast(rgb, black) >= contrast(rgb, white) ? black : white;
}

/**
 * Derives every output representation from canonical RGB bytes.
 *
 * HSL and OKLCH are computed from the bytes and rounded to six decimal places.
 * Achromatic colors report zero hue and zero chroma rather than a NaN or an
 * arbitrary angle.
 *
 * @param rgb - Integer channels in `0..255`.
 * @returns Hex, RGB, HSL, and OKLCH describing the same color.
 */
export function formats(rgb: Triple): Color {
  return { hex: hexFormat(rgb), rgb: rgbFormat(rgb), hsl: hslFormat(rgb), oklch: oklchFormat(rgb) };
}

export const hexFormat = (rgb:Triple) => `#${rgb.map(x => x.toString(16).padStart(2,'0')).join('')}`;
export const rgbFormat = ([r,g,b]:Triple) => ({r,g,b});
export function hslFormat(rgb:Triple) {
  const values = rgb.map(x => x / 255) as Triple;
  const maximum = Math.max(...values);
  const minimum = Math.min(...values);
  const delta = maximum - minimum;
  const light = (maximum + minimum) / 2;
  let hue = 0;
  let saturation = 0;
  if (delta !== 0) {
    saturation = (maximum - light) / Math.min(light, 1 - light);
    const [red, green, blue] = values;
    // Branch order (red, green, blue) decides ties between equal maximum channels.
    if (maximum === red) hue = (green - blue) / delta + (green < blue ? 6 : 0);
    else if (maximum === green) hue = (blue - red) / delta + 2;
    else hue = (red - green) / delta + 4;
    hue *= 60;
  }
  return {h:round6(hue)%360,s:round6(saturation*100),l:round6(light*100)};
}
export function toOklab(rgb:Triple, matrix:Matrix=RGB_TO_XYZ):Triple {
  const values = rgb.map(x => x/255);
  const xyz = multiply(matrix, values.map(decode) as Triple);
  return multiply(LMS_TO_LAB, multiply(XYZ_TO_LMS, xyz).map(Math.cbrt) as Triple);
}
export function oklchFormat(rgb:Triple, matrix:Matrix=RGB_TO_XYZ) {
  const [r,g,b] = rgb;
  const lab = toOklab(rgb, matrix);
  const neutral = r === g && g === b;
  const chroma = neutral ? 0 : Math.sqrt(lab[1] * lab[1] + lab[2] * lab[2]);
  const okHue = neutral ? 0 : hueDegrees(Math.atan2(lab[2], lab[1]) * 180 / Math.PI);
  return {l:round6(lab[0]),c:round6(chroma),h:round6(okHue)%360};
}

/**
 * Selects the final color for one role, enforcing the contrast target.
 *
 * Fit the sampled color, then score its quantized channels. If it fails,
 * score black and white using the same relationships. If both fail, return
 * the higher-scoring endpoint with an unattainable-contrast diagnostic.
 * Otherwise bisect each passing side on the 1/4096 lightness grid. Keep
 * the evaluated passing candidate nearest the sample, breaking ties lower.
 *
 * @param lightness - Sampled OKLCH lightness.
 * @param chroma - Sampled OKLCH chroma; every candidate is fitted from this value.
 * @param hue - Identity hue in degrees.
 * @param background - Fixed comparison color, or `null` to select a foreground for each candidate.
 * @param target - Required WCAG contrast ratio.
 * @returns Final RGB bytes with contrast metadata.
 * @throws {Error} If no lightness candidate passes for a fill. The endpoints guarantee this cannot happen for valid targets.
 */
export function chooseColor(lightness: number, chroma: number, hue: number, background: Triple | null, target: number, second?: Triple, secondTarget = target, selectForeground: (rgb:Triple, target:number)=>Triple = foreground, score?: (rgb:Triple)=>number, matrix?:Matrix): ChosenColor {
  const measure = score ?? ((rgb: Triple) => Math.min(contrast(rgb, background ?? selectForeground(rgb,target)), second ? contrast(rgb, second) * (target / secondTarget) : Infinity));
  const initial = fitColor(lightness, chroma, hue,matrix);
  let chosen = initial;
  let ratio = measure(initial.rgb);
  let fallback: ChosenColor['metadata']['fallback'] = null;
  if (ratio < target) {
    if (Math.max(measure([0, 0, 0]), measure([255, 255, 255])) < target) {
      const rgb: Triple = measure([0,0,0]) >= measure([255,255,255]) ? [0,0,0] : [255,255,255];
      chosen = { rgb, lightness: rgb[0] / 255, chroma: 0 };
      ratio = measure(rgb);
      fallback = 'unattainable-contrast';
    } else {
      let bestDistance = Infinity;
      for (const endpoint of [0, 4096]) {
        let pass = endpoint;
        let fail = endpoint === 0 ? Math.ceil(lightness * 4096) : Math.floor(lightness * 4096);
        let candidate = fitColor(pass / 4096, chroma, hue,matrix);
        let score = measure(candidate.rgb);
        if (score < target) continue;
        while (Math.abs(pass - fail) > 1) {
          const mid = Math.floor((pass + fail) / 2);
          const probe = fitColor(mid / 4096, chroma, hue,matrix);
          const measured = measure(probe.rgb);
          if (measured >= target) {
            pass = mid;
            candidate = probe;
            score = measured;
          } else {
            fail = mid;
          }
        }
        const distance = Math.abs(candidate.lightness - lightness);
        if (distance < bestDistance) {
          chosen = candidate;
          ratio = score;
          bestDistance = distance;
        }
      }
      if (bestDistance === Infinity) throw new Error('Contrast search invariant failed');
    }
  }
  return {
    rgb: chosen.rgb,
    fitted: chosen,
    metadata: {
      ratio,
      meetsTarget: ratio >= target,
      lightnessAdjusted: chosen.lightness !== lightness,
      chromaCapped: false,
      chromaReduced: chosen.chroma < chroma,
      fallback,
    },
  };
}

/** Composite validated sRGB bytes in linear light, quantizing once at the end. */
export function blendOver(source:Triple, alpha:number, background:Triple):Triple {
  return source.map((byte,i) => {
    const linear = alpha*decode(byte/255) + (1-alpha)*decode(Number(background[i])/255);
    return Math.round(255*encode(linear));
  }) as Triple;
}

/** Signed APCA-W3 0.1.9 Lc for two opaque sRGB byte triples, text first. */
export function apcaContrast(text:Triple, background:Triple, weights:Triple=[0.2126729,0.7151522,0.0721750]):number {
  const luminance = ([r,g,b]:Triple) => {
    const y = weights[0]*(r/255)**2.4 + weights[1]*(g/255)**2.4 + weights[2]*(b/255)**2.4;
    // biome-ignore lint/suspicious/noApproximativeNumericConstant: APCA-W3 specifies 1.414 exactly.
    return y < 0.022 ? y + (0.022-y)**1.414 : y;
  };
  const fg = luminance(text), bg = luminance(background);
  if (Math.abs(fg-bg)<0.0005) return 0;
  const positive = bg > fg;
  const raw = 1.14*(bg**(positive?0.56:0.65) - fg**(positive?0.57:0.62));
  if (Math.abs(raw)<0.1) return 0;
  return 100*(raw-(positive?0.027:-0.027));
}

/** Clip a quantized Display-P3 rendition into sRGB for its fallback. */
export function p3Fallback(rgb:Triple) {
  const xyz = multiply(P3_TO_XYZ,rgb.map(v=>decode(v/255)) as Triple);
  const linear = multiply(XYZ_TO_RGB,xyz);
  return {rgb:linear.map(v=>Math.round(255*encode(clamp(v)))) as Triple,srgbClipped:!inside(linear)};
}

export function srgbToP3(rgb:Triple, fullPrecision = false):Triple {
  const xyz = multiply(RGB_TO_XYZ,rgb.map(v=>decode(v/255)) as Triple);
  const channels = multiply(XYZ_TO_P3,xyz).map(v=>encode(clamp(v))) as Triple;
  return fullPrecision ? channels : channels.map(round6) as Triple;
}

export function p3Contrast(text:Triple,background:Triple):number {
  return contrast(text,background,P3_TO_XYZ[1]);
}

export function p3ApcaContrast(text:Triple,background:Triple):number {
  return apcaContrast(text,background,[0.2289829594805780,0.6917492625852380,0.0792677779341829]);
}

export const p3Channels = (rgb:Triple) => rgb.map(v=>round6(v/255)) as Triple;
export const p3Css = (channels:Triple) => `color(display-p3 ${channels.join(' ')})`;

export function p3Formats(rgb:Triple):Color {
  const fallback = p3Fallback(rgb);
  const channels = p3Channels(rgb);
  return {hex:hexFormat(fallback.rgb),rgb:rgbFormat(fallback.rgb),hsl:hslFormat(fallback.rgb),
    oklch:oklchFormat(rgb,P3_TO_XYZ),p3:rgbFormat(channels),css:p3Css(channels),
    srgbClipped:fallback.srgbClipped};
}
