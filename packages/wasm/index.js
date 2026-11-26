export { default as initialize, initSync } from './dist/texthue.js';

import { assignPaletteJson, resolvePaletteJson, resolveRoleHex } from './dist/texthue.js';

function invalid(code, message, ErrorType = TypeError) {
  return Object.assign(new ErrorType(message), {code});
}

function textValue(value, code) {
  if (typeof value !== 'string' || !value.isWellFormed()) throw invalid(code, 'Expected well-formed text');
  return value;
}

function callBinding(call) {
  try {
    return call();
  } catch (error) {
    if (error.code) throw error;
    throw invalid('INVALID_OPTIONS', error.message);
  }
}

export function roleHex(text, role, options = {}) {
  textValue(text, 'INVALID_TEXT');
  textValue(role, 'INVALID_OPTIONS');
  if (!options || typeof options !== 'object' || Array.isArray(options) ||
      Object.keys(options).some(key => !['namespace','seed','theme'].includes(key)))
    throw invalid('INVALID_OPTIONS', 'Invalid role options');
  const {namespace = '', seed = 0, theme = 'light'} = options;
  textValue(namespace, 'INVALID_OPTIONS');
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff)
    throw invalid('INVALID_OPTIONS', 'Invalid seed', RangeError);
  if (theme !== 'light' && theme !== 'dark') throw invalid('INVALID_OPTIONS', 'Unknown theme', RangeError);
  return callBinding(() => resolveRoleHex(text, namespace, seed, theme === 'dark', role));
}

function json(value) {
  return JSON.stringify(value, (_key, item) => {
    if (item == null || typeof item === 'function' || typeof item === 'symbol' ||
        typeof item === 'number' && !Number.isFinite(item)) throw invalid('INVALID_OPTIONS', 'Invalid JSON value');
    return item;
  });
}

export function resolve(text, options = {}) {
  textValue(text, 'INVALID_TEXT');
  return callBinding(() => JSON.parse(resolvePaletteJson(text, json(options))));
}

export function assign(labels, options = {}, pinned = {}) {
  if (!Array.isArray(labels)) throw invalid('INVALID_TEXT', 'Expected an array of labels');
  for (const label of labels) textValue(label, 'INVALID_TEXT');
  return callBinding(() => JSON.parse(assignPaletteJson(json(labels), json(options), json(pinned))));
}
