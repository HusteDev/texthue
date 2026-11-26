import 'dart:math' as math;
import 'dart:typed_data';

// Split the magnitude into an integer significand and a power of two. Reading
// two 32-bit words also works when Dart is compiled to JavaScript.
(BigInt, int) _dyadic(double value, ByteData bytes) {
  bytes.setFloat64(0, value);
  final hi = bytes.getUint32(0);
  final lo = bytes.getUint32(4);
  final exponent = hi ~/ 0x100000;
  var significand = (BigInt.from(hi % 0x100000) << 32) | BigInt.from(lo);
  if (exponent != 0) significand += BigInt.one << 52;
  return (significand, exponent == 0 ? -1074 : exponent - 1075);
}

// Compare the exact input with the cube of a rounding boundary. Keeping
// the midpoint and its cube as integers avoids a second floating-point rounding.
int _compareCube(BigInt input, int exponent, BigInt midpoint, int scale) {
  final cube = midpoint * midpoint * midpoint;
  final shift = exponent - 3 * scale;
  return shift >= 0
      ? (input << shift).compareTo(cube)
      : input.compareTo(cube << -shift);
}

/// Nearest binary64 cube root, with ties rounded to an even significand.
double cubeRoot(double value) {
  if (value == 0 || !value.isFinite) return value;
  final x = value.abs();
  final bytes = ByteData(8);
  final (input, exponent) = _dyadic(x, bytes);
  var root = math.pow(x, 1 / 3).toDouble();
  root += (x / root / root - root) / 3;
  while (true) {
    final (m, e) = _dyadic(root, bytes);
    final boundary = m == BigInt.one << 52;
    final lowerScale = boundary ? e - 2 : e - 1;
    final lower = (m << (boundary ? 2 : 1)) - BigInt.one;
    final lowComparison = _compareCube(input, exponent, lower, lowerScale);
    if (lowComparison < 0 || (lowComparison == 0 && m.isOdd)) {
      root -= math.pow(2, lowerScale + 1).toDouble();
      continue;
    }
    final highComparison = _compareCube(input, exponent, (m << 1) + BigInt.one, e - 1);
    if (highComparison > 0 || (highComparison == 0 && m.isOdd)) {
      root += math.pow(2, e).toDouble();
      continue;
    }
    return value.isNegative ? -root : root;
  }
}
