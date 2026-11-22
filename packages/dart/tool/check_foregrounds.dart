import 'package:texthue/texthue.dart';

void main() {
  for (final model in ContrastModel.values) {
    for (final policy in ForegroundPolicy.values) {
      for (final high in [false, true]) {
        final renderer = Renderer(
            contrastModel: model,
            foregroundPolicy: policy,
            foregrounds: ['#556677', '#000000', '#ffffff'],
            contrastTarget: model == ContrastModel.apca
                ? (high ? 106 : 0)
                : (high ? 21 : 1));
        final palette = renderer.resolve('foreground');
        final actual = [
          for (final theme in [palette.light, palette.dark])
            for (final key in ['fill', 'onFill', 'fillHover']) theme[key]!.hex
        ];
        final darkFill = model == ContrastModel.apca ? '#002206' : '#000000';
        final expected = high
            ? ['#ffffff', '#000000', '#ffffff', darkFill, '#ffffff', darkFill]
            : [
                '#72da7e',
                policy == ForegroundPolicy.best ? '#000000' : '#556677',
                '#6ad277',
                '#2e7137',
                policy == ForegroundPolicy.best ? '#ffffff' : '#556677',
                '#32793c'
              ];
        if (actual.join() != expected.join())
          throw StateError('$model $policy $high: $actual');
      }
    }
  }
  for (final candidates in <List<String>>[
    [],
    ['#abc'],
    ['#123456', '#zzzzzz']
  ]) {
    try {
      Renderer(foregrounds: candidates);
    } on ArgumentError {
      continue;
    } on FormatException {
      continue;
    }
    throw StateError('Accepted invalid foregrounds $candidates');
  }
  print(
      'Passed eight foreground selection cases and three invalid configurations');
}
