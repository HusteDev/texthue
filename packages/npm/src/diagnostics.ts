import { decode, encode, hexFormat, multiply } from './color-math.js';
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

/** Simulate a rendered sRGB color using a fixed Machado model and severity. */
export function simulateVision(hex: string, vision: Vision, severity: Severity = 1): string {
  if (typeof hex !== 'string' || !/^#[0-9a-f]{6}$/i.test(hex) || hex.length !== 7) throw new TypeError('Expected a six-digit sRGB color');
  if (!Object.hasOwn(matrices, vision) || (severity !== 0.5 && severity !== 1)) throw new RangeError('Unknown vision model or severity');
  const linear = [1, 3, 5].map(i => decode(Number.parseInt(hex.slice(i, i + 2), 16) / 255)) as Triple;
  const simulated = multiply(matrices[vision][severity], linear);
  return hexFormat(simulated.map(x => Math.round(255 * encode(Math.max(0, Math.min(1, x))))) as Triple);
}
