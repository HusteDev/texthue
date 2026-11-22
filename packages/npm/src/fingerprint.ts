import {sha256} from './sha256.js';

const utf8 = new TextEncoder();

function length(value: number): Uint8Array {
  if (value > 0xffffffff) throw new RangeError('Configuration field exceeds uint32 length');
  const bytes = new DataView(new ArrayBuffer(4));
  bytes.setUint32(0, value);
  return new Uint8Array(bytes.buffer);
}

export function compareBytes(left: Uint8Array, right: Uint8Array): number {
  for (let i = 0; i < Math.min(left.length, right.length); i++) {
    const diff = Number(left[i]) - Number(right[i]);
    if (diff) return diff;
  }
  return left.length - right.length;
}

// Called only on validated and expanded configuration values.
export function fingerprint(value: unknown): string {
  const parts: Uint8Array[] = [utf8.encode('texthue-config-v1\0')];
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
      const entries = Object.entries(item).map(([key, child]) => ({key, child, bytes:utf8.encode(key)}));
      entries.sort((a,b) => compareBytes(a.bytes,b.bytes));
      parts.push(length(entries.length));
      for (const {key, child} of entries) { write(key); write(child); }
    } else {
      throw new TypeError('Unsupported configuration value');
    }
  };
  write(value);
  // Spread is bounded by the argument limit in JavaScript; pack into one input.
  const input = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) { input.set(part, offset); offset += part.length; }
  return Array.from(new Uint8Array(sha256(input).buffer), byte => byte.toString(16).padStart(2,'0')).join('');
}
