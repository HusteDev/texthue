import 'dart:convert';
import 'dart:io';
import 'package:texthue/texthue.dart';
import 'package:texthue/src/identity.dart';

void main() {
  final rows = jsonDecode(File.fromUri(
          Platform.script.resolve('../../../conformance/normalization-v1.json'))
      .readAsStringSync()) as List;
  if (rows.isEmpty) throw StateError('Empty normalization corpus');
  for (final row in rows) {
    final n = row['normalize'];
    final policy = Normalization(
        unicode: UnicodeForm.values.byName(n['unicode']),
        casing: LetterCase.values.byName(n['case']),
        whitespace: Whitespace.values.byName(n['whitespace']));
    final digest = identityDigest(policy.apply(row['text']),
        namespace: policy.apply(row['namespace']), seed: row['seed']);
    final hex = digest.map((v) => v.toRadixString(16).padLeft(2, '0')).join();
    final result = Renderer(
            namespace: row['namespace'],
            seed: row['seed'],
            normalization: policy)
        .resolve(row['text']);
    if (hex != row['digest'] || (result.hue - row['hue']).abs() > 1e-12)
      throw StateError('Mismatch for $row');
  }
  final batch =
      Renderer(normalization: const Normalization(unicode: UnicodeForm.NFC))
          .batch(['é', 'e\u0301']);
  if (!identical(batch.first.light, batch.last.light))
    throw StateError('Normalized aliases rendered separately');
  print(
      'Passed ${rows.length} normalization vectors and normalized batch reuse');
}
