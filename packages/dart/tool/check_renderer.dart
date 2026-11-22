import 'dart:convert';
import 'dart:io';
import 'package:texthue/texthue.dart';

ThemeProfile profile(Map? theme) {
  RoleProfile? role(Map? value) {
    if (value == null) return null;
    (double, double)? range(List? pair) => pair == null
        ? null
        : ((pair[0] as num).toDouble(), (pair[1] as num).toDouble());
    return RoleProfile(
        lightness: range(value['lightness']),
        chromaScale: range(value['chromaScale']),
        chromaCap: (value['chromaCap'] as num?)?.toDouble());
  }

  return ThemeProfile(fill: role(theme?['fill']), text: role(theme?['text']));
}

void main() {
  final corpus = jsonDecode(
      File.fromUri(Platform.script.resolve('../../../conformance/vectors.json'))
          .readAsStringSync());
  var count = 0;
  for (final row in corpus['vectors']) {
    final opts = row['options'] as Map, expected = row['expected'];
    final renderer = Renderer(
        lightProfile: profile(opts['profiles']?['light']),
        darkProfile: profile(opts['profiles']?['dark']),
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
        if (renderer.hex(row['text'],
                    dark: theme.key == 'dark', role: role.key) !=
                role.value.hex ||
            renderer
                    .color(row['text'],
                        dark: theme.key == 'dark', role: role.key)
                    .oklch !=
                role.value.oklch ||
            role.value.hex != expected[theme.key][role.key]['hex'])
          throw StateError(
              'Mismatch for ${row["id"]} ${theme.key} ${role.key}');
      }
    }
    count++;
  }
  if (count != 32) throw StateError('Unexpected corpus size $count');
  print('Passed $count two-theme renderer cases');
}
