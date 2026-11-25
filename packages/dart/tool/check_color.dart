import 'dart:convert';
import 'dart:io';
import 'package:texthue/texthue.dart';

void main() {
  final red = Color.fromRgb(255, 0, 0);
  final expectedCss = {
    CssFormat.hex: '#ff0000',
    CssFormat.rgb: 'rgb(255 0 0)',
    CssFormat.hsl: 'hsl(0 100% 50%)',
    CssFormat.oklch: 'oklch(0.627955 0.257683 29.23388)',
    CssFormat.displayP3: 'color(display-p3 0.917488 0.200287 0.138561)',
  };
  for (final entry in expectedCss.entries) {
    if (red.toCss(entry.key) != entry.value) {
      throw StateError('Incorrect CSS for ${entry.key}');
    }
  }
  if (Color.fromDisplayP3(1, 0, 0).toCss(CssFormat.displayP3) !=
      'color(display-p3 1 0 0)') throw StateError('Lost native P3 channels');
  final corpus = jsonDecode(
      File.fromUri(Platform.script.resolve('../../../conformance/vectors.json'))
          .readAsStringSync());
  final tolerance = corpus['numericTolerance'] as double;
  var count = 0;
  for (final vector in corpus['vectors']) {
    for (final theme in ['light', 'dark']) {
      for (final role in [
        'background',
        'subtle',
        'muted',
        'fill',
        'onFill',
        'fillHover',
        'fillActive',
        'border',
        'text',
        'strong'
      ]) {
        final expected = vector['expected'][theme][role];
        final rgb = expected['rgb'],
            hsl = expected['hsl'],
            lch = expected['oklch'];
        final color = Color.fromRgb(rgb['r'], rgb['g'], rgb['b']);
        final values = [
          color.hsl.h,
          color.hsl.s,
          color.hsl.l,
          color.oklch.l,
          color.oklch.c,
          color.oklch.h
        ];
        final reference = [
          hsl['h'],
          hsl['s'],
          hsl['l'],
          lch['l'],
          lch['c'],
          lch['h']
        ];
        if (color.hex != expected['hex'] ||
            color.rgb != (r: rgb['r'], g: rgb['g'], b: rgb['b']) ||
            values.indexed.any((pair) =>
                (pair.$2 - reference[pair.$1]).abs() > tolerance + 1e-12)) {
          throw StateError('Color mismatch for ${vector["id"]} $theme $role');
        }
        count++;
      }
    }
  }
  if (count != 640) throw StateError('Unexpected role count $count');
  print('Passed $count shared role color formats');
}
