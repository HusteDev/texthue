import 'dart:convert';
import 'dart:io';
import 'package:texthue/texthue.dart';

void main(List<String> args) {
  try {
    Renderer().assign(['a'], pinned: {
      'a': (hueFraction: 0.5, ring: 1 << 53, moved: false)
    });
    throw StateError('Accepted a non-replayable ring');
  } on ArgumentError {
    // Oversized placements must fail before rendering.
  }
  final rows = jsonDecode(File.fromUri(
          Platform.script.resolve('../../../conformance/assign-vectors.json'))
      .readAsStringSync()) as List;
  if (args.isNotEmpty) {
    final corpus = jsonDecode(File(args.single).readAsStringSync()) as List;
    if (corpus.length != 300) throw StateError('Expected 300 separation cases');
    for (final c in corpus) {
      final labels = List<String>.from(c['labels']);
      rows.add({
        'texts': labels,
        'assignments': c['assignments'],
        'report': c['report'],
        'lightFills': {
          for (var i = 0; i < labels.length; i++) labels[i]: c['fills'][i][0]
        },
        'darkFills': {
          for (var i = 0; i < labels.length; i++) labels[i]: c['fills'][i][1]
        },
      });
    }
  }
  Map<String, Placement> placements(Map values) => {
        for (final e in values.entries)
          e.key: (
            hueFraction: e.value['hueFraction'],
            ring: e.value['ring'],
            moved: e.value['moved']
          )
      };
  for (final row in rows) {
    final options = row['options'];
    final renderer = Renderer(
        normalization: Normalization(
            casing: options?['normalize']?['case'] == 'lower'
                ? LetterCase.lower
                : LetterCase.none),
        overrides: {
          for (final e in (options?['overrides'] as Map? ?? {}).entries)
            e.key: e.value is String
                ? (light: e.value as String, dark: e.value as String)
                : (light: e.value['light'], dark: e.value['dark'])
        });
    final result = renderer.assign(List<String>.from(row['texts']),
        pinned: placements(row['pinned'] ?? {}));
    final expected = placements(row['assignments']);
    final report = row['report'];
    if (result.assignments.length != expected.length ||
        expected.entries.any((e) => result.assignments[e.key] != e.value) ||
        (row['lightFills'] as Map)
            .entries
            .any((e) => result.colors[e.key]?.light['fill']?.hex != e.value) ||
        (row['darkFills'] as Map? ?? {})
            .entries
            .any((e) => result.colors[e.key]?.dark['fill']?.hex != e.value) ||
        result.report.distinctFills != report['distinctFills'] ||
        result.report.withinRingCapacity != report['withinRingCapacity'] ||
        (result.report.minDistance! - report['minDistance']).abs() > 1e-12 ||
        jsonEncode(
                result.report.closestPairs.map((p) => [p.$1, p.$2]).toList()) !=
            jsonEncode(report['closestPairs'])) {
      throw StateError('Assignment mismatch for ${row["texts"]}');
    }
  }
  print('Passed ${rows.length} shared assignment vectors');
}
