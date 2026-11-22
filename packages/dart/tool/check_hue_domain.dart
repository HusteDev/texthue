import 'package:texthue/texthue.dart';

void main() {
  final cases = <(HueArc, List<HueArc>, double, String, String)>[
    ((300, 60), [(350, 10)], 341.06283164159765, '#e496c8', '#7e3668'),
    (
      (10, 220),
      [(30, 80), (70, 120), (190, 240)],
      181.9565484774379,
      '#6dbbae',
      '#2f5650'
    ),
    ((0, 360), [(120, 110)], 119.10628316415976, '#a4b566', '#4b532c'),
    ((35.125, 35.25), [], 35.238828539551996, '#e39d8b', '#7f3e2e'),
    ((0, 360), [(50, 50)], 327.8261939097516, '#e491e2', '#793778')
  ];
  for (final (allowed, excluded, hue, light, dark) in cases) {
    final p = Renderer(hueRange: allowed, excludeHues: excluded).resolve('a');
    if ((p.hue - hue).abs() > 1e-12 ||
        p.light['fill']?.hex != light ||
        p.dark['fill']?.hex != dark) {
      throw StateError('Hue assignment mismatch for $allowed $excluded');
    }
  }
  for (final (allowed, excluded) in <(HueArc, List<HueArc>)>[
    ((0, 0), []),
    ((360, 0), []),
    ((0, 360), [(0, 360)]),
    ((0, 360), List.filled(17, (0, 1))),
    ((0, 361), []),
    ((0, 360), [(double.nan, 2)])
  ]) {
    try {
      Renderer(hueRange: allowed, excludeHues: excluded);
    } on ArgumentError {
      continue;
    }
    throw StateError('Accepted invalid domain $allowed $excluded');
  }
  print('Passed five reference hue assignments and six invalid domains');
}
