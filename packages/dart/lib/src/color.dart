import 'dart:math' as math;
import 'contrast.dart';
import 'gamut_fit.dart';

const _rgbToXYZ = <List<double>>[
  [506752 / 1228815, 87881 / 245763, 12673 / 70218],
  [87098 / 409605, 175762 / 245763, 12673 / 175545],
  [7918 / 409605, 87881 / 737289, 1001167 / 1053270],
];
const _xyzToLMS = <List<double>>[
  [0.819022437996703, 0.3619062600528904, -0.1288737815209879],
  [0.0329836539323885, 0.9292868615863434, 0.0361446663506424],
  [0.0481771893596242, 0.2642395317527308, 0.6335478284694309],
];
const _lmsToLab = <List<double>>[
  [0.210454268309314, 0.7936177747023054, -0.0040720430116193],
  [1.9779985324311684, -2.42859224204858, 0.450593709617411],
  [0.0259040424655478, 0.7827717124575296, -0.8086757549230774],
];

String rgbHex(List<int> bytes) =>
    '#' + bytes.map((v) => v.toRadixString(16).padLeft(2, '0')).join();

double _round6(double value) => (value * 1e6 + 0.5).floor() / 1e6;

final class Color {
  final String hex;
  final ({int r, int g, int b}) rgb;
  final ({double h, double s, double l}) hsl;
  final ({double l, double c, double h}) oklch;

  const Color._(this.hex, this.rgb, this.hsl, this.oklch);

  /// Composite this sRGB color over an opaque backdrop in linear light.
  Color compositeOver(double alpha, Color backdrop) {
    if (!(alpha >= 0 && alpha <= 1)) {
      throw RangeError.value(
          alpha, 'alpha', 'Expected a value between zero and one');
    }
    int blend(int front, int back) =>
        channelByte(alpha * linearChannel(front / 255) +
            (1 - alpha) * linearChannel(back / 255));
    return Color.fromRgb(blend(rgb.r, backdrop.rgb.r),
        blend(rgb.g, backdrop.rgb.g), blend(rgb.b, backdrop.rgb.b));
  }

  factory Color.fromRgb(int red, int green, int blue) {
    final bytes = [red, green, blue];
    for (final byte in bytes) {
      RangeError.checkValueInInterval(byte, 0, 255, 'channel');
    }
    final hex = rgbHex(bytes);
    final r = red / 255, g = green / 255, b = blue / 255;
    final hi = math.max(r, math.max(g, b)), lo = math.min(r, math.min(g, b));
    final delta = hi - lo, light = (hi + lo) / 2;
    var hue = 0.0, saturation = 0.0;
    if (delta != 0) {
      saturation = (hi - light) / math.min(light, 1 - light);
      if (hi == r) {
        hue = (g - b) / delta + (g < b ? 6 : 0);
      } else if (hi == g) {
        hue = (b - r) / delta + 2;
      } else {
        hue = (r - g) / delta + 4;
      }
    }
    final xyz = multiply(
        _rgbToXYZ, [linearChannel(r), linearChannel(g), linearChannel(b)]);
    final lms = multiply(_xyzToLMS, xyz);
    final lab = multiply(_lmsToLab,
        [for (final x in lms) x.sign * math.pow(x.abs(), 1 / 3).toDouble()]);
    final neutral = red == green && green == blue;
    final degrees = (math.atan2(lab[2], lab[1]) * 180 / math.pi + 360) % 360;
    return Color._(hex, (
      r: red,
      g: green,
      b: blue
    ), (
      h: _round6(60 * hue) % 360,
      s: _round6(100 * saturation),
      l: _round6(100 * light)
    ), (
      l: _round6(lab[0]),
      c: neutral ? 0 : _round6(math.sqrt(lab[1] * lab[1] + lab[2] * lab[2])),
      h: neutral ? 0 : _round6(degrees) % 360
    ));
  }
}
