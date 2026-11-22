import 'dart:convert';
import 'dart:io';
import 'package:texthue/texthue.dart';

void main() {
  final corpus = jsonDecode(
      File.fromUri(Platform.script.resolve('../../../conformance/vectors.json'))
          .readAsStringSync());
  var count = 0;
  for (final row in corpus['vectors']) {
    final opts = row['options'] as Map, expected = row['expected'];
    if (opts.containsKey('profiles')) continue;
    final renderer = Renderer(
        namespace: opts['namespace'] ?? '',
        seed: opts['seed'] ?? 0,
        contrastTarget: (opts['contrastTarget'] as num?)?.toDouble() ?? 4.5,
        contrastTargets: {
          for (final entry in (opts['contrastTargets'] as Map? ?? {}).entries)
            entry.key: (entry.value as num).toDouble()
        },
        lightBackground: opts['backgrounds']?['light'] ?? '#ffffff',
        darkBackground: opts['backgrounds']?['dark'] ?? '#121212');
    final p = renderer.resolve(row['text']);
    if (p.hue != expected['hue'] ||
        p.hueFraction != expected['hueFraction'] ||
        p.source != expected['source'] ||
        p.version != expected['version'])
      throw StateError('Identity mismatch for ${row["id"]}');
    for (final theme in {'light': p.light, 'dark': p.dark}.entries) {
      if (theme.value.length != 10) throw StateError('Missing roles');
      for (final role in theme.value.entries) {
        if (role.value.hex != expected[theme.key][role.key]['hex'])
          throw StateError(
              'Mismatch for ${row["id"]} ${theme.key} ${role.key}');
      }
    }
    count++;
  }
  if (count != 26) throw StateError('Unexpected corpus size $count');
  print('Passed $count two-theme renderer cases');
}
