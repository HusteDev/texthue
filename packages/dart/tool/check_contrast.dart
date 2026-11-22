import 'dart:convert';
import 'dart:io';
import 'package:texthue/src/contrast.dart';

List<dynamic> fixture(String name) => jsonDecode(
    File.fromUri(Platform.script.resolve('../../../conformance/$name'))
        .readAsStringSync());

void main() {
  var measurements = 0;
  void check(List<int> fg, List<int> bg, ContrastModel model, Gamut gamut,
      num expected) {
    final actual = measureContrast(fg, bg, model: model, gamut: gamut);
    if (!actual.isFinite || (actual - expected).abs() > 1e-12) {
      throw StateError(
          '$model $gamut $fg on $bg gave $actual, expected $expected');
    }
    measurements++;
  }

  final srgb = fixture('apca-srgb-v1.json'),
      p3 = fixture('p3-contrast-v1.json');
  if (srgb.isEmpty || p3.isEmpty) throw StateError('Empty contrast corpus');
  for (final row in srgb.cast<List>()) {
    check(row.sublist(0, 3).cast<int>(), row.sublist(3, 6).cast<int>(),
        ContrastModel.apca, Gamut.sRGB, row[6]);
  }
  for (final row in p3) {
    final fg = (row['text'] as List).cast<int>(),
        bg = (row['background'] as List).cast<int>();
    check(fg, bg, ContrastModel.apca, Gamut.displayP3, row['lc']);
    check(fg, bg, ContrastModel.wcag2, Gamut.displayP3, row['ratio']);
  }
  check([0, 0, 0], [255, 255, 255], ContrastModel.wcag2, Gamut.sRGB, 21);
  check([255, 0, 0], [0, 0, 0], ContrastModel.wcag2, Gamut.sRGB, 5.252);
  print('Passed $measurements contrast measurements');
}
