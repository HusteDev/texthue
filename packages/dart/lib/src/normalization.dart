import 'package:unorm_dart/unorm_dart.dart' as unorm;
import 'identity.dart';

enum UnicodeForm { none, NFC, NFKC }

enum LetterCase { none, lower }

enum Whitespace { none, trim, collapse }

final class Normalization {
  final UnicodeForm unicode;
  final LetterCase casing;
  final Whitespace whitespace;
  const Normalization(
      {this.unicode = UnicodeForm.none,
      this.casing = LetterCase.none,
      this.whitespace = Whitespace.none});

  static final _edges =
      RegExp(r'^\p{White_Space}+|\p{White_Space}+$', unicode: true);
  static final _runs = RegExp(r'\p{White_Space}+', unicode: true);
  static final _finalSigma = RegExp(
      r'(?<=\p{Cased}\p{Case_Ignorable}*)Σ(?!\p{Case_Ignorable}*\p{Cased})',
      unicode: true);

  String apply(String input) {
    validateUtf16(input);
    var value = switch (unicode) {
      UnicodeForm.none => input,
      UnicodeForm.NFC => unorm.nfc(input),
      UnicodeForm.NFKC => unorm.nfkc(input),
    };
    if (casing == LetterCase.lower) {
      // Apply Unicode's contextual and expanding default lowercase mappings.
      value = value
          .replaceAll(_finalSigma, 'ς')
          .replaceAll('İ', 'i\u0307')
          .toLowerCase();
    }
    if (whitespace != Whitespace.none) value = value.replaceAll(_edges, '');
    return whitespace == Whitespace.collapse
        ? value.replaceAll(_runs, ' ')
        : value;
  }
}
