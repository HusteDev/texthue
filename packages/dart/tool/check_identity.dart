import 'dart:convert';
import 'dart:io';

import 'package:texthue/src/identity.dart';

void main() {
  final file = File.fromUri(
      Platform.script.resolve('../../../conformance/vectors.json'));
  final rows = jsonDecode(file.readAsStringSync())['vectors'] as List;
  if (rows.isEmpty) throw StateError('Empty identity corpus');
  for (final row in rows) {
    final options = row['options'];
    final digest = identityDigest(row['text'],
        namespace: options['namespace'] ?? '', seed: options['seed'] ?? 0);
    final hex = digest.map((v) => v.toRadixString(16).padLeft(2, '0')).join();
    final fractions = identityFractions(digest);
    if (hex != row['encoding']['sha256'] ||
        jsonEncode(fractions) !=
            jsonEncode((row['fractions'] as List)
                .cast<num>()
                .map((v) => v.toDouble())
                .toList())) {
      throw StateError('Identity mismatch for ${row["id"]}');
    }
  }
  for (final bad in ['\ud800', '\udc00', '\ud800x']) {
    for (final run in [
      () => identityDigest(bad),
      () => identityDigest('', namespace: bad)
    ]) {
      try {
        run();
      } on FormatException {
        continue;
      }
      throw StateError('Accepted malformed UTF-16');
    }
  }
  print(
      'Passed ${rows.length} shared identity vectors and malformed UTF-16 checks');
}
