import { compareBytes } from './bytes.js';
import { fail } from './errors.js';
import { sha256 } from './sha256.js';

const utf8 = new TextEncoder();

function length(value: number): Uint8Array {
  if (value > 0xffffffff) fail('INVALID_OPTIONS', 'Configuration field exceeds uint32 length');
  const bytes = new DataView(new ArrayBuffer(4));
  bytes.setUint32(0, value);
  return new Uint8Array(bytes.buffer);
}

// Called only on validated and expanded configuration values.
export function fingerprint(value: unknown, domain = 'texthue-config-v1'): string {
  const parts: Uint8Array[] = [utf8.encode(domain + '\0')];
  const tag = (n: number) => parts.push(Uint8Array.of(n));
  const write = (item: unknown): void => {
    if (typeof item === 'number' && Number.isFinite(item)) {
      tag(1);
      const bytes = new DataView(new ArrayBuffer(8));
      bytes.setFloat64(0, item === 0 ? 0 : item);
      parts.push(new Uint8Array(bytes.buffer));
    } else if (typeof item === 'string') {
      tag(2);
      const bytes = utf8.encode(item);
      parts.push(length(bytes.length), bytes);
    } else if (Array.isArray(item)) {
      tag(3);
      parts.push(length(item.length));
      for (const child of item) write(child);
    } else if (item !== null && typeof item === 'object') {
      tag(4);
      const entries = Object.entries(item).map(([key, child]) => ({
        key,
        child,
        bytes: utf8.encode(key),
      }));
      entries.sort((a, b) => compareBytes(a.bytes, b.bytes));
      parts.push(length(entries.length));
      for (const { key, child } of entries) {
        write(key);
        write(child);
      }
    } else {
      fail('INVALID_OPTIONS', 'Unsupported configuration value');
    }
  };
  write(value);
  // Spread is bounded by the argument limit in JavaScript; pack into one input.
  const input = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    input.set(part, offset);
    offset += part.length;
  }
  return Array.from(new Uint8Array(sha256(input).buffer), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
}

// Only changes to rendering behavior belong in this versioned descriptor.
// Replay options may acquire new fields with defaults without changing it.
export function behaviorFingerprint(
  algorithm: string,
  options: Record<string, unknown>,
  identity: (name: string) => string,
  segments: readonly (readonly number[])[],
  exclusions: readonly (readonly [number, number])[],
): string {
  const merged: [number, number][] = [];
  for (const [lo, hi] of [...exclusions].sort(([a], [b]) => a - b)) {
    const last = merged.at(-1);
    if (last && lo <= last[1]) last[1] = Math.max(last[1], hi);
    else merged.push([lo, hi]);
  }
  const fields = [
    'seed',
    'normalize',
    'contrastTarget',
    'contrastTargets',
    'profiles',
    'backgrounds',
    'foregroundPolicy',
    'foregrounds',
    'gamut',
    'contrastModel',
    'palette',
    'paletteMode',
  ];
  const behavior = Object.fromEntries(
    fields.filter((key) => Object.hasOwn(options, key)).map((key) => [key, options[key]]),
  );
  const foregrounds = [...new Set(options.foregrounds as string[])];
  behavior.foregrounds = foregrounds;
  if (foregrounds.length === 1) behavior.foregroundPolicy = 'best';
  if (!Object.hasOwn(options, 'palette')) delete behavior.paletteMode;
  behavior.namespace = identity(options.namespace as string);
  behavior.overrides = Object.fromEntries(
    Object.entries(options.overrides as Record<string, unknown>).map(([key, pair]) => [
      identity(key),
      pair,
    ]),
  );
  behavior.hueSegments = segments;
  behavior.excludeHues = merged;
  return fingerprint({ algorithm, behavior }, 'texthue-behavior-v1');
}
