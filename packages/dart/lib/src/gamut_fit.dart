import 'dart:math' as math;
import 'contrast.dart';
import 'work_counts.dart' as work;

const rgbToXYZ = <List<double>>[
  [506752 / 1228815, 87881 / 245763, 12673 / 70218],
  [87098 / 409605, 175762 / 245763, 12673 / 175545],
  [7918 / 409605, 87881 / 737289, 1001167 / 1053270],
];
const _labToLMS = <List<double>>[
  [1, 0.3963377773761749, 0.2158037573099136],
  [1, -0.1055613458156586, -0.0638541728258133],
  [1, -0.0894841775298119, -1.2914855480194092],
];
const _lmsToXYZ = <List<double>>[
  [1.2268798758459243, -0.5578149944602171, 0.2813910456659647],
  [-0.0405757452148008, 1.112286803280317, -0.0717110580655164],
  [-0.0763729366746601, -0.4214933324022432, 1.5869240198367816],
];
const _xyzToRGB = <List<double>>[
  [12831 / 3959, -329 / 214, -1974 / 3959],
  [-851781 / 878810, 1648619 / 878810, 36519 / 878810],
  [705 / 12673, -2585 / 12673, 705 / 667],
];
const _xyzToP3 = <List<double>>[
  [446124 / 178915, -333277 / 357830, -72051 / 178915],
  [-14852 / 17905, 63121 / 35810, 423 / 17905],
  [11844 / 330415, -50337 / 660830, 316169 / 330415],
];
const p3ToXYZ = <List<double>>[
  [608311 / 1250200, 189793 / 714400, 198249 / 1000160],
  [35783 / 156275, 247089 / 357200, 198249 / 2500400],
  [0, 32229 / 714400, 5220557 / 5000800],
];

List<double> multiply(List<List<double>> matrix, List<double> v) =>
    [for (final row in matrix) (row[0] * v[0] + row[1] * v[1]) + row[2] * v[2]];

double encodedChannel(double linear) {
  final x = linear.clamp(0.0, 1.0);
  final encoded =
      x <= 0.0031308 ? x * 12.92 : 1.055 * math.pow(x, 1 / 2.4) - 0.055;
  return encoded.toDouble();
}

int channelByte(double linear) => (encodedChannel(linear) * 255 + 0.5).floor();

List<num> canonicalChannels(List<int> srgb, Gamut gamut) {
  if (gamut == Gamut.sRGB) return srgb;
  final xyz =
      multiply(rgbToXYZ, [for (final byte in srgb) linearChannel(byte / 255)]);
  return [
    for (final channel in multiply(_xyzToP3, xyz)) encodedChannel(channel) * 255
  ];
}

bool _inside(List<double> channels) =>
    channels.every((x) => x >= -1e-12 && x <= 1 + 1e-12);

({List<int> bytes, bool clipped}) p3Fallback(List<num> bytes) {
  final linear = [for (final byte in bytes) linearChannel(byte / 255)];
  final rgb = multiply(_xyzToRGB, multiply(p3ToXYZ, linear));
  return (bytes: rgb.map(channelByte).toList(), clipped: !_inside(rgb));
}

typedef FittedColor = ({List<int> bytes, double lightness, double chroma});

extension GamutFit on Gamut {
  List<double> _linear(double l, double c, double h) {
    final angle = h * math.pi / 180;
    final lms =
        multiply(_labToLMS, [l, c * math.cos(angle), c * math.sin(angle)]);
    final xyz = multiply(_lmsToXYZ, [for (final x in lms) x * x * x]);
    return multiply(this == Gamut.sRGB ? _xyzToRGB : _xyzToP3, xyz);
  }

  double _limit(double l, double c, double h, int steps) {
    var low = 0.0, high = c;
    for (var i = 0; i < steps; i++) {
      final mid = (low + high) / 2;
      if (_inside(_linear(l, mid, h))) {
        low = mid;
      } else {
        high = mid;
      }
    }
    return low;
  }

  double cusp(double l, double h) {
    if (work.enabled) work.cusps++;
    return l == 0 || l == 1 ? 0 : _limit(l, 0.4, h, 20);
  }

  FittedColor fit(double l, double c, double h) {
    if (work.enabled) work.fits++;
    if (l == 0 || l == 1) {
      return (
        bytes: List<int>.filled(3, (l * 255).toInt()),
        lightness: l,
        chroma: 0
      );
    }
    var channels = _linear(l, c, h);
    var retained = c;
    if (!_inside(channels)) {
      retained = _limit(l, c, h, 24);
      channels = _linear(l, retained, h);
    }
    return (
      bytes: channels.map(channelByte).toList(),
      lightness: l,
      chroma: retained
    );
  }
}
