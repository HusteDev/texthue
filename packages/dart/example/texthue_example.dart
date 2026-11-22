import 'package:texthue/texthue.dart';

void main() {
  final renderer = Renderer(namespace: 'project', seed: 42);
  final palettes = renderer.batch(['apple', 'pear', 'apple']);
  final apple = palettes.first;
  print('${apple.light['fill']!.hex} ${apple.dark['onFill']!.hex}');
}
