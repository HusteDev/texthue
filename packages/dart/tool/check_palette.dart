import 'package:texthue/texthue.dart';

void main() {
  const entries = [
    PaletteEntry('red', light: '#ab1234'),
    PaletteEntry('gray', dark: '#777777'),
    PaletteEntry('blue', light: '#1020ab', dark: '#2233cd'),
  ];
  for (final palette in [entries, entries.reversed.toList()]) {
    final results =
        Renderer(palette: palette).batch(['apple', 'pear', 'a', 'b', 'x', 'z']);
    final fills = results.map((p) => p.light['fill']!.hex).join(',');
    if (fills != '#1020ab,#ab1234,#1020ab,#1020ab,#ab1234,#777777' ||
        results.first.dark['fill']!.hex != '#2233cd' ||
        results.any((p) => p.source != 'palette'))
      throw StateError('Reference winners: $fills');
  }
  Renderer strict(List<PaletteEntry> entries) => Renderer(
      palette: entries,
      foregrounds: ['#ffffff'],
      contrastTargets: {'fill': 21});
  if (strict([
            const PaletteEntry('red', light: '#000000', dark: '#ffffff'),
            const PaletteEntry('gray', light: '#000000')
          ]).resolve('pear').dark['fill']!.hex !=
          '#000000' ||
      strict(entries).resolve('pear').light['fill']!.hex != '#ab1234')
    throw StateError('Contrast filtering');
  if (Renderer(
              palette: entries,
              overrides: {'apple': (light: '#ffeedd', dark: '#001122')})
          .resolve('apple')
          .source !=
      'override') throw StateError('Override precedence');
  for (final invalid in <List<PaletteEntry>>[
    [],
    [entries.first, entries.first],
    [const PaletteEntry('missing')]
  ]) {
    try {
      Renderer(palette: invalid);
    } on ArgumentError {
      continue;
    }
    throw StateError('Accepted invalid palette');
  }
  print(
      'Passed reference palette assignments, filtering, overrides and validation');
}
