import 'errors.dart';
import 'dart:convert';
import 'dart:typed_data';

import 'package:crypto/crypto.dart';
import 'work_counts.dart' as work;

void validateUtf16(String value, {String code = 'INVALID_TEXT'}) {
  for (var i = 0; i < value.length; i++) {
    final unit = value.codeUnitAt(i);
    if (unit < 0xd800 || unit > 0xdfff) continue;
    if (unit > 0xdbff || i + 1 == value.length) {
      throw TextHueFormatError(code, 'Unpaired surrogate', value, i);
    }
    final next = value.codeUnitAt(++i);
    if (next < 0xdc00 || next > 0xdfff) {
      throw TextHueFormatError(code, 'Unpaired surrogate', value, i - 1);
    }
  }
}

List<int> _strictUtf8(String value, {String code = 'INVALID_TEXT'}) {
  validateUtf16(value, code: code);
  return utf8.encode(value);
}

Uint8List identityDigest(String text, {String namespace = '', int seed = 0}) {
  OptionRangeError.check(seed, 0, 0xffffffff, 'seed');
  final scope = _strictUtf8(namespace, code: 'INVALID_OPTIONS');
  OptionRangeError.check(
      scope.length, 0, 0xffffffff, 'namespace length');
  final header = ByteData(8)
    ..setUint32(0, seed)
    ..setUint32(4, scope.length);
  final frame = BytesBuilder(copy: false)
    ..add(utf8.encode('text-to-color-v1\x00'))
    ..add(header.buffer.asUint8List())
    ..add(scope)
    ..add(_strictUtf8(text));
  if (work.enabled) work.hashes++;
  return Uint8List.fromList(sha256.convert(frame.takeBytes()).bytes);
}

List<double> identityFractions(Uint8List digest) {
  final words = ByteData.sublistView(digest);
  return [
    for (final offset in [0, 4, 8]) words.getUint32(offset) / 4294967296
  ];
}
