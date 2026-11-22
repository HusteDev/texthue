import 'package:texthue/texthue.dart';

void main() {
  final renderer = Renderer(namespace: 'scope', seed: 42);
  final labels = ['é', '', 'e\u0301', 'é', '\u0000', 'e\u0301'];
  final palettes = renderer.batch(labels.where((_) => true));
  if (palettes.length != labels.length || renderer.batch([]).isNotEmpty) {
    throw StateError('Incorrect batch length');
  }
  for (final (i, label) in labels.indexed) {
    final single = renderer.resolve(label);
    final item = palettes[i];
    if (item.hue != single.hue ||
        item.hueFraction != single.hueFraction ||
        item.version != single.version ||
        item.source != single.source) {
      throw StateError('Identity mismatch at $i');
    }
    for (final (actual, expected) in [
      (item.light, single.light),
      (item.dark, single.dark)
    ]) {
      for (final role in expected.entries) {
        if (actual[role.key]?.hex != role.value.hex)
          throw StateError('Color mismatch at $i');
      }
    }
  }
  if (!identical(palettes[0].light, palettes[3].light) ||
      !identical(palettes[2].dark, palettes[5].dark) ||
      palettes[0].hue == palettes[2].hue) {
    throw StateError('Incorrect duplicate or Unicode handling');
  }
  try {
    renderer.batch(['ok', '\ud800']);
  } on FormatException {
    if (renderer.batch(['ok']).single.hue != renderer.resolve('ok').hue) {
      throw StateError('Failed batch affected later resolution');
    }
    print('Passed ordered batch, duplicate, Unicode and failure checks');
    return;
  }
  throw StateError('Batch accepted malformed input');
}
