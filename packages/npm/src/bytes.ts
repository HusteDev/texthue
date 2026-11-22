export function compareBytes(left: Uint8Array, right: Uint8Array): number {
  for (let i = 0; i < Math.min(left.length, right.length); i++) {
    const diff = Number(left[i]) - Number(right[i]);
    if (diff) return diff;
  }
  return left.length - right.length;
}
