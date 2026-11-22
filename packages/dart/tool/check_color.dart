import 'dart:convert';
import 'dart:io';
import 'package:texthue/src/color.dart';

void main() {
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
