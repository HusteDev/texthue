import 'dart:convert';
import 'package:texthue/texthue.dart';
import 'package:texthue/src/work_counts.dart' as work;

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
    if (work.enabled) {
      const fitLimits = {
        'default': 1600,
        'aaa': 5732,
        'maximum': 13325,
        'gray': 3068,
        'impossible': 12252,
        'apca': 11133,
        'p3': 1600,
      };
      work.fits = work.cusps = work.hashes = 0;
      for (var i = 0; i < 100; i++) {
        renderer.resolve('item:$i');
      }
      if (work.fits < 1600 ||
          work.fits > fitLimits[scenario]! ||
          work.cusps != 1600 ||
          work.hashes != 100) {
        throw StateError(
            '$scenario used ${work.fits} fits, ${work.cusps} cusps, and ${work.hashes} hashes');
      }
      print(jsonEncode({
        'scenario': scenario,
        'fits': work.fits,
        'cusps': work.cusps,
        'hashes': work.hashes
      }));
      continue;
    }
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
  if (work.enabled) return;
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
