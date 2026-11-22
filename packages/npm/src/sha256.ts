// SHA-256 round constants and initial hash words from FIPS 180-4.
const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

const wordAt = (words: ArrayLike<number>, index: number) => Number(words[index]);

const rotate = (word: number, bits: number) => (word >>> bits) | (word << (32 - bits));

/** Hash a sequence of byte strings without allocating a concatenated payload. */
export function sha256(...parts: Uint8Array[]): DataView {
  const state = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
  const words = new Uint32Array(64);
  const block = new Uint8Array(64);
  const input = new DataView(block.buffer);
  function compress() {
    for (let i = 0; i < 16; i++) words[i] = input.getUint32(i * 4);
    for (let i = 16; i < 64; i++) {
      const x = wordAt(words, i - 15), y = wordAt(words, i - 2);
      words[i] = wordAt(words, i - 16) + (rotate(x, 7) ^ rotate(x, 18) ^ (x >>> 3)) +
        wordAt(words, i - 7) + (rotate(y, 17) ^ rotate(y, 19) ^ (y >>> 10));
    }
    let [a,b,c,d,e,f,g,h] = state as unknown as [number,number,number,number,number,number,number,number];
    for (let i = 0; i < 64; i++) {
      const t1 = h + (rotate(e, 6) ^ rotate(e, 11) ^ rotate(e, 25)) +
        ((e & f) ^ (~e & g)) + wordAt(K, i) + wordAt(words, i);
      const t2 = (rotate(a, 2) ^ rotate(a, 13) ^ rotate(a, 22)) + ((a & b) ^ (a & c) ^ (b & c));
      h = g; g = f; f = e; e = (d + t1) >>> 0;
      d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    const result = [a,b,c,d,e,f,g,h];
    for (let i = 0; i < 8; i++) state[i] = wordAt(state, i) + wordAt(result, i);
  }
  let used = 0, length = 0;
  for (const part of parts) {
    length += part.length;
    for (let offset = 0; offset < part.length;) {
      const count = Math.min(64 - used, part.length - offset);
      block.set(part.subarray(offset, offset + count), used);
      offset += count;
      used += count;
      if (used === 64) { compress(); used = 0; }
    }
  }
  block[used++] = 0x80;
  block.fill(0, used);
  if (used > 56) { compress(); block.fill(0); }
  input.setBigUint64(56, BigInt(length) * 8n);
  compress();
  const digest = new DataView(new ArrayBuffer(32));
  state.forEach((word, i) => { digest.setUint32(i * 4, word); });
  return digest;
}
