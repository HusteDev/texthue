/// Machine-readable validation and contrast failures.
abstract interface class TextHueError {
  String get code;
}

class OptionError extends ArgumentError implements TextHueError {
  @override
  String get code => 'INVALID_OPTIONS';
  OptionError(super.message);
  OptionError.value(super.value, [super.name, super.message]) : super.value();
}

class OptionRangeError extends RangeError implements TextHueError {
  @override
  String get code => 'INVALID_OPTIONS';
  OptionRangeError.range(super.value, super.minValue, super.maxValue, [super.name]) : super.range();
  OptionRangeError.value(super.value, [super.name, super.message]) : super.value();

  static void check(int value, int low, int high, String name) {
    if (value < low || value > high) throw OptionRangeError.range(value, low, high, name);
  }
}

class TextHueFormatError extends FormatException implements TextHueError {
  @override
  final String code;
  TextHueFormatError(this.code, super.message, [super.source, super.offset]);
}

class ContrastConstraintError extends StateError implements TextHueError {
  @override
  String get code => 'UNMET_CONSTRAINT';
  ContrastConstraintError(super.message);
}
