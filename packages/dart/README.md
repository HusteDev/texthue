# Dart

**Experimental source port.** See the [package capability table](https://github.com/HusteDev/texthue/blob/main/docs/PACKAGES.md).

Resolve a label into ten color [roles](https://github.com/HusteDev/texthue/blob/main/docs/GLOSSARY.md#theme-and-role) for each of two themes. The default [gamut](https://github.com/HusteDev/texthue/blob/main/docs/GLOSSARY.md#gamut-and-display-p3) is sRGB. To render in Display-P3, use `Renderer(gamut: Gamut.displayP3)`. Read the native channels from `renderer.resolve('apple').light['fill']!.p3!` and use the role’s hex value for its sRGB fallback. A [namespace](https://github.com/HusteDev/texthue/blob/main/docs/GLOSSARY.md#identity-and-normalization) separates independent sets of labels, and a seed gives each set a reproducible assignment.

Call `color.toCss(CssFormat.hsl)` for HSL with percentage units. Use `CssFormat.displayP3` to preserve a native Display P3 rendition or convert an sRGB color to Display P3. The default `color.toCss()` returns hex.

## Use the checkout

Add a path dependency to the consuming application's `pubspec.yaml`, adjusting the relative path to the checkout.

```yaml
dependencies:
  texthue:
    path: ../texthue/packages/dart
```

Run `dart pub get`, then import `package:texthue/texthue.dart`. The [runnable example](https://github.com/HusteDev/texthue/blob/main/packages/dart/example/texthue_example.dart) uses `renderer.hex('apple')` for the light fill and `renderer.color('apple', dark: true, role: 'onFill')` for the dark foreground. Each call renders only the selected [role](https://github.com/HusteDev/texthue/blob/main/docs/GLOSSARY.md#theme-and-role) and its dependencies.

From the Dart package directory, run:

```sh
dart pub get --enforce-lockfile
dart run example/texthue_example.dart
```

Expected output is `#5ab95a #ffffff`. For a single label use `renderer.resolve('apple')`. Batch results follow input order and share work for duplicate normalized labels within that call. Exact text is the default. Pass `normalization: const Normalization(unicode: UnicodeForm.NFC)` to treat canonically equivalent spellings as one label.

## Dependencies and verification

The package [pins](https://github.com/HusteDev/texthue/blob/main/docs/GLOSSARY.md#pinned-placements) `crypto` 3.0.8 for SHA-256 and `unorm_dart` 0.3.3 for Unicode [normalization](https://github.com/HusteDev/texthue/blob/main/docs/GLOSSARY.md#identity-and-normalization). Run `dart analyze --fatal-infos` and `dart run tool/check_renderer.dart` from the package directory. The renderer check compares both [themes](https://github.com/HusteDev/texthue/blob/main/docs/GLOSSARY.md#theme-and-role) with the repository's shared reference vectors.

From the repository root, `python tools/check-dart-publication.py` runs pub’s publication dry run, then installs a temporary path consumer from a copy of the public library and manifest. The consumer resolves dependencies from the local pub cache and verifies the example output. Run `dart pub get --enforce-lockfile` in the package directory first to populate that cache.

Read `palette.lightContrast` and `palette.darkContrast` for the seven measured relationships in each theme. Each entry reports the [WCAG](https://github.com/HusteDev/texthue/blob/main/docs/GLOSSARY.md#contrast-models) ratio, selected model measurement, target status, adjustments and fallback reason.

Pass `strict: true` to `renderer.hex` to raise a `StateError` when the selected role misses a [contrast](https://github.com/HusteDev/texthue/blob/main/docs/GLOSSARY.md#distance-and-contrast) target. Text is checked against both the background and subtle surface.

Use `renderer.assign(labels)` to assign a collection together. Pass
`pinned: previous.assignments` on a later call to retain the original
placements. The result includes palettes for the requested normalized labels
and a report of the closest pairs by rendered light-fill OKLab distance.

Run `dart pub get` followed by `dart test` for behavioral tests. Public validation failures implement `TextHueError` with a stable `code`. Compare resolved colors and palettes with `==`.
