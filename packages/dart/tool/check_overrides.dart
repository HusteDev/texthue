import 'package:texthue/texthue.dart';

void main() {
  const normalization = Normalization(casing: LetterCase.lower);
  const brand = (light: '#ab1234', dark: '#777777');
  final options = {'TEAM': brand};
  final renderer = Renderer(normalization: normalization, overrides: options);
  options.clear();
  final result = renderer.batch(['Team', 'team', 'other']);
  final p = result.first;
  if (p != result[1] ||
      result[2].source != 'hash' ||
      p.source != 'override' ||
      p.hue != 17.6767578125 ||
      p.hueFraction != 0.01669445425766595 ||
      p.light['fill']!.hex != brand.light ||
      p.light['fillHover']!.hex != '#8e313b' ||
      p.dark['fill']!.hex != brand.dark ||
      p.dark['fillActive']!.hex != '#868686') {
    throw StateError('Normalized override diverged from reference');
  }
  final fixed = Renderer(
      contrastModel: ContrastModel.apca,
      contrastTarget: 106,
      foregrounds: ['#777777'],
      overrides: {'fixed': brand}).resolve('fixed');
  if (fixed.dark['fill']!.hex != brand.dark)
    throw StateError('Fixed fill was repaired');
  try {
    Renderer(
        normalization: normalization,
        overrides: {'TEAM': brand, 'team': brand});
  } on ArgumentError {
    print(
        'Passed normalized brand overrides, fixed fills and collision rejection');
    return;
  }
  throw StateError('Accepted duplicate normalized keys');
}
