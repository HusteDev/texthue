export { default as initialize, initSync } from './dist/texthue.js';
import { resolveRoleHex } from './dist/texthue.js';

export function roleHex(text, role, {namespace = '', seed = 0, theme = 'light'} = {}) {
  for (const value of [text, namespace, role]) {
    if (typeof value !== 'string' || !value.isWellFormed()) throw new TypeError('Expected well-formed text');
  }
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) throw new RangeError('Invalid seed');
  if (theme !== 'light' && theme !== 'dark') throw new RangeError('Unknown theme');
  return resolveRoleHex(text, namespace, seed, theme === 'dark', role);
}
