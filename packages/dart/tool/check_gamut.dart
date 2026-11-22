import 'dart:convert';
import 'dart:io';
import 'package:texthue/texthue.dart' show Color;
import 'package:texthue/src/contrast.dart';
import 'package:texthue/src/gamut_fit.dart';

dynamic fixture(String name) => jsonDecode(
    File.fromUri(Platform.script.resolve('../../../conformance/$name'))
        .readAsStringSync());

void main() {
  final rows = fixture('p3-fit-v1.json') as List;
  if (rows.isEmpty) throw StateError('Empty gamut corpus');
  for (final row in rows) {
    final fit = Gamut.displayP3
        .fit(row['l'].toDouble(), row['c'].toDouble(), row['h'].toDouble());
    final fallback = p3Fallback(fit.bytes);
    final color = Color.fromDisplayP3(
        fit.bytes[0] / 255, fit.bytes[1] / 255, fit.bytes[2] / 255);
    final channels = color.p3!;
    final expected =
        fit.bytes.map((v) => (v / 255 * 1e6).round() / 1e6).toList();
    if (jsonEncode([channels.r, channels.g, channels.b]) !=
            jsonEncode(expected) ||
        jsonEncode([color.rgb.r, color.rgb.g, color.rgb.b]) !=
            jsonEncode(row['fallback']) ||
        color.srgbClipped != row['clipped']) {
      throw StateError('Display-P3 rendition mismatch for $row');
    }
    if (jsonEncode(fit.bytes) != jsonEncode(row['rgb']) ||
        jsonEncode(fallback.bytes) != jsonEncode(row['fallback']) ||
        fallback.clipped != row['clipped']) {
      throw StateError('Display-P3 fit or fallback mismatch for $row');
    }
  }
  var traces = 0;
  for (final vector in fixture('renderer-v1.json')['vectors']) {
    for (final theme in vector['themes'].values) {
      final color = theme['color'], trace = color['trace'];
      if (trace == null) continue;
      final p3 = color['p3'] != null, p = trace['repaired'];
      final fit = (p3 ? Gamut.displayP3 : Gamut.sRGB)
          .fit(p['l'].toDouble(), p['c'].toDouble(), p['h'].toDouble());
      final channels = color['p3'] ?? color['rgb'];
      final expected = [
        for (final key in ['r', 'g', 'b'])
          (channels[key] * (p3 ? 255 : 1)).round()
      ];
      if (jsonEncode(expected) != jsonEncode(fit.bytes) ||
          (fit.chroma - trace['fitted']['c']).abs() > 1e-12) {
        throw StateError('Trace mismatch for $trace');
      }
      traces++;
    }
  }
  if (traces != 4) throw StateError('Expected four renderer traces');
  print(
      'Passed ${rows.length} Display-P3 fits and fallbacks and $traces renderer traces');
}
