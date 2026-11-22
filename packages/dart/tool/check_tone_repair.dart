import 'dart:io';
import 'package:texthue/src/contrast.dart';
import 'package:texthue/src/tone_repair.dart';

void main() {
  final rows = File.fromUri(
          Platform.script.resolve('../../../conformance/tone-repair-v1.tsv'))
      .readAsLinesSync();
  if (rows.length != 192) throw StateError('Unexpected corpus size');
  for (final row in rows) {
    final fields = row.split('\t');
    final gamut = Gamut.values
        .byName({'SRGB': 'sRGB', 'DISPLAY_P3': 'displayP3'}[fields[0]]!);
    final model = ContrastModel.values.byName(fields[1].toLowerCase());
    double number(int i) => double.parse(fields[i]);
    List<int> bytes(int i) => fields[i].split(',').map(int.parse).toList();
    final background = bytes(5);
    final tone = gamut.repair(
        number(2),
        number(3),
        number(4),
        number(6),
        (rgb) =>
            measureContrast(rgb, background, model: model, gamut: gamut).abs());
    bool close(double actual, int i) => (actual - number(i)).abs() <= 1e-12;
    if (tone.color.bytes.join(',') != fields[7] ||
        tone.color.lightness != number(8) ||
        !close(tone.color.chroma, 9) ||
        !close(tone.score, 10) ||
        (tone.fallback ?? '-') != fields[11]) {
      throw StateError('Repair mismatch for $row: $tone');
    }
  }
  final tie = Gamut.sRGB.repair(0.5, 0, 0, 1, (_) => 0);
  if (tie.color.bytes.join(',') != '0,0,0' ||
      tie.fallback != 'unattainable-contrast') {
    throw StateError('Incorrect fallback on tied endpoint scores');
  }
  print(
      'Passed ${rows.length} shared tone repairs and the tied fallback check');
}
