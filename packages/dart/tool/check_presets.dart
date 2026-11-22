import 'dart:convert';
import 'dart:io';
import 'package:texthue/texthue.dart';

void main() {
  final rows = jsonDecode(File.fromUri(
          Platform.script.resolve('../../../conformance/presets-v1.json'))
      .readAsStringSync()) as List;
  if (rows.length != 20) throw StateError('Unexpected preset corpus size');
  for (final row in rows) {
    final opts = row['options'];
    final renderer = Renderer(
        preset: Preset.values.byName(opts['preset']),
        contrastModel: ContrastModel.values.byName(opts['contrastModel']),
        contrastTarget: (opts['contrastTarget'] as num?)?.toDouble());
    final result = renderer.resolve(row['text']);
    for (final theme in {'light': result.light, 'dark': result.dark}.entries) {
      for (final role in (row[theme.key] as Map).entries) {
        if (theme.value[role.key]?.hex != role.value)
          throw StateError('Mismatch for $opts ${theme.key} ${role.key}');
      }
    }
  }
  print('Passed ${rows.length} two-theme preset cases');
}
