import { decode, encode, hexFormat, multiply, toOklab } from './color-math.js';
import type { Matrix, Triple } from './types.js';

export type Vision = 'protan' | 'deutan' | 'tritan';
export type Severity = 0.5 | 1;

// Machado, Oliveira & Fernandes (2009), doi:10.1109/TVCG.2009.113.
// Precomputed linear RGB matrices, also tabulated in Machado's thesis, Appendix A.
const matrices: Record<Vision, Record<Severity, Matrix>> = {
  protan: {
    0.5: [[0.458064, 0.679578, -0.137642], [0.092785, 0.846313, 0.060902], [-0.007494, -0.016807, 1.024301]],
    1: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
  },
  deutan: {
    0.5: [[0.547494, 0.607765, -0.155259], [0.181692, 0.781742, 0.036566], [-0.01041, 0.027275, 0.983136]],
    1: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.01182, 0.04294, 0.968881]],
  },
  tritan: {
    0.5: [[1.017277, 0.027029, -0.044306], [-0.006113, 0.958479, 0.047634], [0.006379, 0.248708, 0.744913]],
    1: [[1.255528, -0.076749, -0.178779], [-0.078411, 0.930809, 0.147602], [0.004733, 0.691367, 0.3039]],
  },
};

function rgbBytes(hex: string): Triple {
  if (typeof hex !== 'string' || !/^#[0-9a-f]{6}$/i.test(hex) || hex.length !== 7) throw new TypeError('Expected a six-digit sRGB color');
  return [1, 3, 5].map(i => Number.parseInt(hex.slice(i, i + 2), 16)) as Triple;
}

/** Simulate a rendered sRGB color using a fixed Machado model and severity. */
export function simulateVision(hex: string, vision: Vision, severity: Severity = 1): string {
  if (!Object.hasOwn(matrices, vision) || (severity !== 0.5 && severity !== 1)) throw new RangeError('Unknown vision model or severity');
  const linear = rgbBytes(hex).map(channel => decode(channel / 255)) as Triple;
  const simulated = multiply(matrices[vision][severity], linear);
  return hexFormat(simulated.map(x => Math.round(255 * encode(Math.max(0, Math.min(1, x))))) as Triple);
}

export function visionPoint(hex: string, vision: Vision | 'normal', severity: Severity = 1): Triple {
  return toOklab(rgbBytes(vision === 'normal' ? hex : simulateVision(hex, vision, severity)));
}

/** Compare rendered sRGB swatches in input order. Distances are Euclidean OKLab units. */
export function analyzePalette(colors: readonly string[], vision: Vision | 'normal' = 'normal', severity: Severity = 1) {
  if (!Array.isArray(colors)) throw new TypeError('Expected an array of sRGB colors');
  if (vision !== 'normal' && !Object.hasOwn(matrices, vision)) throw new RangeError('Unknown vision model');
  if (severity !== 0.5 && severity !== 1) throw new RangeError('Unknown severity');
  const originals = Array.from(colors, hex => hexFormat(rgbBytes(hex)));
  const points = originals.map(hex => visionPoint(hex, vision, severity));
  const pairs: {first: number; second: number; distance: number}[] = [];
  const nearest = points.map((): {indices: number[]; distance: number | null} => ({indices: [], distance: null}));
  const duplicates: [number, number][] = [];
  let total = 0;
  let min = Infinity;
  let max = 0;
  function record(index: number, other: number, distance: number) {
    const entry = nearest[index];
    if (!entry) throw new Error('Missing swatch');
    if (entry.distance === null || distance < entry.distance) {
      entry.distance = distance;
      entry.indices = [other];
    } else if (distance === entry.distance) entry.indices.push(other);
  }
  for (const [first, a] of points.entries()) {
    for (let second = first + 1; second < points.length; second++) {
      const b = points[second];
      if (!b) throw new Error('Missing swatch');
      const distance = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
      pairs.push({first, second, distance});
      if (originals[first] === originals[second]) duplicates.push([first, second]);
      record(first, second, distance);
      record(second, first, distance);
      min = Math.min(min, distance);
      max = Math.max(max, distance);
      total += distance;
    }
  }
  return {pairs, nearest, duplicates, stats: {
    count: pairs.length, min: pairs.length ? min : null, max: pairs.length ? max : null,
    mean: pairs.length ? total / pairs.length : null,
  }};
}
