import 'package:test/test.dart';
import 'package:texthue/src/cube_root.dart';
import 'package:texthue/texthue.dart';

void main() {
  test('cube roots round to the nearest binary64 across the exponent range', () {
    final samples = <double, double>{
      0: 0, 1: 1, 2: 1.2599210498948732, 3: 1.4422495703074083,
      7: 1.9129311827723892, 27: 3, double.minPositive: 1.7031839360032603e-108,
    };
    for (final entry in samples.entries) {
      expect(cubeRoot(entry.key), entry.value);
      expect(cubeRoot(-entry.key), -entry.value);
    }
    expect(cubeRoot(-0.0).isNegative, isTrue);
  });

  test('invalid text and options expose stable codes', () {
    expect(() => Renderer().resolve(String.fromCharCode(0xd800)),
        throwsA(isA<TextHueError>().having((error) => error.code, 'code', 'INVALID_TEXT')));
    expect(() => Renderer(namespace: String.fromCharCode(0xd800)),
        throwsA(isA<TextHueError>().having((error) => error.code, 'code', 'INVALID_OPTIONS')));
  });

  test('independent resolvers return value-equal colors', () {
    final first = Renderer().resolve('research');
    final second = Renderer().resolve('research');
    expect(first, second);
    expect({first, second}, hasLength(1));
  });
}
