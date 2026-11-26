import 'errors.dart';
import 'dart:math' as math;
import 'contrast.dart';
import 'cube_root.dart';
import 'gamut_fit.dart';

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

List<double> srgbToLab(double r, double g, double b) =>
    _lab(r, g, b, Gamut.sRGB);

List<double> _lab(double r, double g, double b, Gamut gamut) {
  final xyz = multiply(gamut == Gamut.sRGB ? rgbToXYZ : p3ToXYZ,
      [linearChannel(r), linearChannel(g), linearChannel(b)]);
  final lms = multiply(_xyzToLMS, xyz);
  return multiply(_lmsToLab,
      [for (final x in lms) cubeRoot(x)]);
}

enum CssFormat { hex, rgb, hsl, oklch, displayP3 }

String _cssNumber(double value) =>
    value == value.truncate() ? value.toInt().toString() : value.toString();

String _displayP3Css(Iterable<double> channels) =>
    "color(display-p3 ${channels.map(_cssNumber).join(' ')})";

final class Color {
  final String hex;
  final ({int r, int g, int b}) rgb;
  final ({double h, double s, double l}) hsl;
  final ({double l, double c, double h}) oklch;

  final ({double r, double g, double b})? p3;
  final String? css;
  final bool? srgbClipped;

  const Color._(this.hex, this.rgb, this.hsl, this.oklch,
      [this.p3, this.css, this.srgbClipped]);

  @override
  bool operator ==(Object other) => other is Color &&
      (hex, rgb, hsl, oklch, p3, css, srgbClipped) ==
          (other.hex, other.rgb, other.hsl, other.oklch, other.p3, other.css, other.srgbClipped);

  @override
  int get hashCode => Object.hash(hex, rgb, hsl, oklch, p3, css, srgbClipped);

  /// Serialize this rendition in the selected CSS color notation.
  String toCss([CssFormat format = CssFormat.hex]) => switch (format) {
    CssFormat.hex => hex,
    CssFormat.rgb => 'rgb(${rgb.r} ${rgb.g} ${rgb.b})',
    CssFormat.hsl => 'hsl(${_cssNumber(hsl.h)} ${_cssNumber(hsl.s)}% ${_cssNumber(hsl.l)}%)',
    CssFormat.oklch => 'oklch(${_cssNumber(oklch.l)} ${_cssNumber(oklch.c)} ${_cssNumber(oklch.h)})',
    CssFormat.displayP3 => css ?? _displayP3Css(
        canonicalChannels([rgb.r, rgb.g, rgb.b], Gamut.displayP3)
            .map((v) => _round6(v / 255))),
  };

  /// Composite this sRGB color over an opaque backdrop in linear light.
  Color compositeOver(double alpha, Color backdrop) {
    if (!(alpha >= 0 && alpha <= 1)) {
      throw OptionRangeError.value(
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
      OptionRangeError.check(byte, 0, 255, 'channel');
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
    return Color._(
        hex,
        (r: red, g: green, b: blue),
        (
          h: _round6(60 * hue) % 360,
          s: _round6(100 * saturation),
          l: _round6(100 * light)
        ),
        _oklch(r, g, b, Gamut.sRGB));
  }

  static ({double l, double c, double h}) _oklch(
      double r, double g, double b, Gamut gamut) {
    final lab = _lab(r, g, b, gamut);
    final neutral = r == g && g == b;
    final degrees = (math.atan2(lab[2], lab[1]) * 180 / math.pi + 360) % 360;
    return (
      l: _round6(lab[0]),
      c: neutral ? 0 : _round6(math.sqrt(lab[1] * lab[1] + lab[2] * lab[2])),
      h: neutral ? 0 : _round6(degrees) % 360
    );
  }

  factory Color.fromDisplayP3(double red, double green, double blue) {
    final channels = [red, green, blue];
    for (final channel in channels) {
      if (!(channel >= 0 && channel <= 1))
        throw OptionRangeError.range(channel, 0, 1, 'channel');
    }
    final fallback =
        p3Fallback([for (final channel in channels) channel * 255]);
    final bytes = fallback.bytes;
    final base = Color.fromRgb(bytes[0], bytes[1], bytes[2]);
    final values = channels.map(_round6).toList();
    return Color._(
        base.hex,
        base.rgb,
        base.hsl,
        _oklch(red, green, blue, Gamut.displayP3),
        (r: values[0], g: values[1], b: values[2]),
        _displayP3Css(values),
        fallback.clipped);
  }
}
