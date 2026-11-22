# TextHue for Dart

Resolve a label into ten sRGB color roles for each of two themes. Each role exposes hex, RGB, HSL and OKLCH. A namespace separates independent sets of labels, and a seed gives each set a reproducible assignment.

## Use the checkout

Add a path dependency to the consuming application's `pubspec.yaml`, adjusting the relative path to the checkout.

```yaml
dependencies:
  texthue:
    path: ../texthue/packages/dart
```

Run `dart pub get`, then import `package:texthue/texthue.dart`. The [runnable example](example/texthue_example.dart) uses namespace `project` and seed `42` to resolve a batch and print the light fill and dark foreground for `apple`.

From the Dart package directory, run:

```sh
dart pub get --enforce-lockfile
dart run example/texthue_example.dart
```

Expected output is `#5ab95a #ffffff`. For a single label use `renderer.resolve('apple')`. Batch results follow input order and share work for duplicate normalized labels within that call. Exact text is the default. Pass `normalization: const Normalization(unicode: UnicodeForm.NFC)` to treat canonically equivalent spellings as one label.

## Dependencies and verification

The package pins `crypto` 3.0.6 for SHA-256 and `unorm_dart` 0.3.3 for Unicode normalization. Run `dart analyze --fatal-infos` and `dart run tool/check_renderer.dart` from the package directory. The renderer check compares both themes with the repository's shared reference vectors.
