import 'package:texthue/texthue.dart';

void main() {
  final renderer = Renderer(namespace: 'project', seed: 42);
  final fill = renderer.hex('apple');
  final foreground = renderer.color('apple', dark: true, role: 'onFill');
  print('$fill ${foreground.hex}');
}
