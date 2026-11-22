import 'dart:convert';
import 'dart:io';
import 'package:texthue/texthue.dart';

Color color(String hex) {
  int channel(int start) =>
      int.parse(hex.substring(start, start + 2), radix: 16);
  return Color.fromRgb(channel(1), channel(3), channel(5));
}

void main() {
  final file = File.fromUri(
      Platform.script.resolve('../../../conformance/composite-v1.json'));
  final rows = jsonDecode(file.readAsStringSync()) as List;
  if (rows.length != 6) throw StateError('Unexpected composite corpus size');
  for (final row in rows) {
    final result = color(row['source']).compositeOver(
        (row['alpha'] as num).toDouble(), color(row['backdrop']));
    if (result.hex != row['expected'])
      throw StateError('$row produced ${result.hex}');
  }
  final black = Color.fromRgb(0, 0, 0);
  for (final alpha in [
    -0.1,
    1.1,
    double.nan,
    double.infinity,
    double.negativeInfinity
  ]) {
    try {
      black.compositeOver(alpha, black);
    } on RangeError {
      continue;
    }
    throw StateError('Accepted invalid alpha $alpha');
  }
  print('Passed six sRGB composites and invalid alpha checks.');
}
