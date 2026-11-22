import 'dart:convert';
import 'dart:io';
import 'package:texthue/texthue.dart';

void main() {
  final rows = jsonDecode(File.fromUri(
          Platform.script.resolve('../../../conformance/assign-vectors.json'))
      .readAsStringSync()) as List;
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
