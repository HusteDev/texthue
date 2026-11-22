import 'dart:convert';
import 'package:texthue/texthue.dart';

void main() {
  for (final (scenario, target, light) in [
    ('default', 4.5, '#ffffff'),
    ('aaa', 7.0, '#ffffff'),
    ('maximum', 21.0, '#ffffff'),
    ('gray', 4.5, '#777777'),
    ('impossible', 21.0, '#777777'),
    ('apca', 75.0, '#ffffff'),
    ('p3', 4.5, '#ffffff'),
  ]) {
    final renderer = Renderer(
        gamut: scenario == 'p3' ? Gamut.displayP3 : Gamut.sRGB,
        contrastModel:
            scenario == 'apca' ? ContrastModel.apca : ContrastModel.wcag2,
        contrastTarget: target,
        lightBackground: light);
    final timer = Stopwatch();
    final samples = <double>[];
    for (var i = -20; i < 100; i++) {
      final label = 'item:$i';
      timer.reset();
      timer.start();
      final palette = renderer.resolve(label);
      timer.stop();
      if (scenario == 'p3' &&
          (palette.light['fill']?.p3 == null ||
              palette.dark['fill']?.p3 == null)) {
        throw StateError('Missing Display-P3 channels for $label');
      }
      if (palette.light['fill'] == null || palette.dark['fill'] == null) {
        throw StateError('Missing fill for $label');
      }
      if (i >= 0) samples.add(timer.elapsedTicks * 1e6 / timer.frequency);
    }
    samples.sort();
    print(jsonEncode({
      'scenario': scenario,
      'medianUs': (samples[49] + samples[50]) / 2,
      'p95Us': samples[94],
    }));
  }
  final labels = List.generate(40, (i) => 'item:$i');
  final renderer = Renderer();
  final samples = <double>[];
  for (var i = -5; i < 20; i++) {
    final timer = Stopwatch()..start();
    final result = renderer.assign(labels);
    timer.stop();
    if (result.colors.length != labels.length)
      throw StateError('Incomplete assignment');
    if (i >= 0) samples.add(timer.elapsedTicks * 1e6 / timer.frequency);
  }
  samples.sort();
  print(jsonEncode({
    'scenario': 'assign40',
    'medianUs': (samples[9] + samples[10]) / 2,
    'p95Us': samples[18]
  }));
}
