import 'dart:convert';
import 'dart:io';
import 'package:texthue/texthue.dart';
import 'check_renderer.dart' show profile;

Renderer compile(Map o) {
  HueArc arc(dynamic pair) =>
      ((pair[0] as num).toDouble(), (pair[1] as num).toDouble());
  final n = o['normalize'];

  return Renderer(
      gamut: switch (o['gamut']) {
        null || 'srgb' => Gamut.sRGB,
        'display-p3' => Gamut.displayP3,
        _ => throw ArgumentError('Unknown gamut')
      },
      namespace: o['namespace'] ?? '',
      seed: o['seed'] ?? 0,
      normalization: Normalization(
          unicode: UnicodeForm.values.byName(n?['unicode'] ?? 'none'),
          casing: LetterCase.values.byName(n?['case'] ?? 'none'),
          whitespace: Whitespace.values.byName(n?['whitespace'] ?? 'none')),
      lightProfile: profile(o['profiles']?['light']),
      darkProfile: profile(o['profiles']?['dark']),
      lightBackground: o['backgrounds']?['light'] ?? '#ffffff',
      darkBackground: o['backgrounds']?['dark'] ?? '#121212',
      preset: Preset.values.byName(o['preset'] ?? 'labels'),
      contrastModel: ContrastModel.values.byName(o['contrastModel'] ?? 'wcag2'),
      contrastTarget: (o['contrastTarget'] as num?)?.toDouble(),
      contrastTargets: {
        for (final e in (o['contrastTargets'] as Map? ?? {}).entries)
          e.key: (e.value as num).toDouble()
      },
      hueRange: o['hueRange'] == null ? (0, 360) : arc(o['hueRange']),
      excludeHues: [for (final pair in o['excludeHues'] ?? []) arc(pair)],
      foregroundPolicy: switch (o['foregroundPolicy']) {
        null || 'best' => ForegroundPolicy.best,
        'first-passing' => ForegroundPolicy.firstPassing,
        _ => throw FormatException('Unknown foreground policy')
      },
      foregrounds:
          List<String>.from(o['foregrounds'] ?? ['#000000', '#ffffff']),
      palette: o['palette'] == null
          ? null
          : [
              for (final e in o['palette'])
                PaletteEntry(e['id'], light: e['light'], dark: e['dark'])
            ],
      overrides: {
        for (final e in (o['overrides'] as Map? ?? {}).entries)
          e.key: e.value is String
              ? (light: e.value as String, dark: e.value as String)
              : (light: e.value['light'], dark: e.value['dark'])
      });
}

Map color(Color c) => {
      'hex': c.hex,
      if (c.p3 case final p?) 'p3': {'r': p.r, 'g': p.g, 'b': p.b},
      if (c.css != null) 'css': c.css,
      if (c.srgbClipped != null) 'srgbClipped': c.srgbClipped,
      'rgb': {'r': c.rgb.r, 'g': c.rgb.g, 'b': c.rgb.b},
      'hsl': {'h': c.hsl.h, 's': c.hsl.s, 'l': c.hsl.l},
      'oklch': {'l': c.oklch.l, 'c': c.oklch.c, 'h': c.oklch.h}
    };

Map relationship(ContrastRelationship r) => {
      'ratio': r.ratio,
      'meetsTarget': r.meetsTarget,
      'lightnessAdjusted': r.lightnessAdjusted,
      'chromaCapped': r.chromaCapped,
      'chromaReduced': r.chromaReduced,
      'fallback': r.fallback,
      if (r.model == ContrastModel.apca) ...{'model': 'apca', 'value': r.value}
    };

Map resolve(Map request) {
  if (request.containsKey('config') || request['exportConfig'] == true)
    throw UnsupportedError('Configuration replay');
  final renderer = compile(request['options'] ?? {});
  final p = renderer.resolve(request['text']);
  Map theme(
          Map<String, Color> colors, Map<String, ContrastRelationship> pairs) =>
      {
        for (final e in colors.entries) e.key: color(e.value),
        'contrast': {
          'target': renderer.contrastTarget,
          for (final e in pairs.entries) e.key: relationship(e.value)
        }
      };
  return {
    'version': p.version,
    'source': p.source,
    'hue': p.hue,
    'hueFraction': p.hueFraction,
    'light': theme(p.light, p.lightContrast),
    'dark': theme(p.dark, p.darkContrast)
  };
}

Future<void> main() async {
  try {
    final requests =
        jsonDecode(await stdin.transform(utf8.decoder).join()) as List;
    stdout
        .write(jsonEncode([for (final request in requests) resolve(request)]));
  } catch (error) {
    stderr.writeln(error);
    exitCode = 1;
  }
}
