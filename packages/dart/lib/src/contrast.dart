import 'dart:math' as math;

enum Gamut { sRGB, displayP3 }

enum ContrastModel { wcag2, apca }

double linearChannel(double encoded) => encoded <= 0.04045
    ? encoded / 12.92
    : math.pow((encoded + 0.055) / 1.055, 2.4).toDouble();

double measureContrast(List<int> text, List<int> background,
    {ContrastModel model = ContrastModel.wcag2, Gamut gamut = Gamut.sRGB}) {
  final weights = switch ((gamut, model)) {
    (Gamut.sRGB, ContrastModel.wcag2) => const [0.2126, 0.7152, 0.0722],
    (Gamut.sRGB, ContrastModel.apca) => const [0.2126729, 0.7151522, 0.0721750],
    (Gamut.displayP3, ContrastModel.wcag2) => const [
        35783 / 156275,
        247089 / 357200,
        198249 / 2500400
      ],
    (Gamut.displayP3, ContrastModel.apca) => const [
        0.2289829594805780,
        0.6917492625852380,
        0.0792677779341829
      ],
  };
  double luminance(List<int> rgb) {
    if (rgb.length != 3)
      throw ArgumentError.value(rgb, 'rgb', 'Expected three channels');
    var sum = 0.0;
    for (var i = 0; i < 3; i++) {
      final x =
          RangeError.checkValueInInterval(rgb[i], 0, 255, 'channel') / 255;
      sum += weights[i] *
          (model == ContrastModel.apca ? math.pow(x, 2.4) : linearChannel(x));
    }
    return model == ContrastModel.apca && sum < 0.022
        ? sum + math.pow(0.022 - sum, 1.414)
        : sum;
  }

  final fg = luminance(text), bg = luminance(background);
  if (model == ContrastModel.wcag2) {
    return (math.max(fg, bg) + 0.05) / (math.min(fg, bg) + 0.05);
  }
  if ((fg - bg).abs() < 0.0005) return 0;
  final positive = bg > fg;
  final raw = 1.14 *
      (math.pow(bg, positive ? 0.56 : 0.65) -
          math.pow(fg, positive ? 0.57 : 0.62));
  return raw.abs() < 0.1 ? 0 : 100 * (raw - (positive ? 0.027 : -0.027));
}
