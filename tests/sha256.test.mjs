import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { sha256 } from '../packages/npm/dist/sha256.js';

const hex = (...parts) => Buffer.from(sha256(...parts).buffer).toString('hex');

test('incremental SHA-256 matches native hashing across block and padding boundaries', () => {
  for (const length of [0, 1, 55, 56, 63, 64, 65, 119, 120, 128, 129, 1048576]) {
    const bytes = Uint8Array.from({ length }, (_, i) => (i * 17 + 11) % 256);
    const expected = createHash('sha256').update(bytes).digest('hex');
    for (const split of [0, 7, 55, 64, length]) {
      assert.equal(hex(bytes.subarray(0, split), bytes.subarray(split)), expected);
    }
  }
});

test('every frozen payload has its specified SHA-256 digest', () => {
  const fixture = JSON.parse(readFileSync(new URL('../conformance/vectors.json', import.meta.url)));
  for (const { encoding } of fixture.vectors) {
    assert.equal(hex(Buffer.from(encoding.payloadHex, 'hex')), encoding.sha256);
  }
});
