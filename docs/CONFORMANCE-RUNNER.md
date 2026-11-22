# Conformance runner contract

A port can register a conformance executable for testing:
it lets the cross-language parity test drive that implementation from a
single process without a language-specific test harness. It is not part of
the published library and carries no compatibility promise beyond this
document.

## Contract

- **Input**: a single JSON array on stdin, `[{ "text": string, "options"?:
  object }, ...]`. `options` follows the same JSON contract as the public
  API; an absent `options` means "use the library default" (equivalent to
  omitting the argument), not an empty object with every field defaulted by
  the runner itself.
- **Output**: on success, a single JSON array of `ColorSet` objects on
  stdout, in the same order as the input, using the exact field names and
  casing from `SPECIFICATION.md` (camelCase, matching the JSON options
  contract) regardless of the host language's normal naming convention.
- **Exit code**. Return zero when every request succeeds. For invalid input, report the error on stderr and exit nonzero. Reserve stdout for the result array.

## Registered runners

All eight runners accept sRGB and Display-P3 resolution requests. JavaScript, Python, and Go also accept requests containing `text` and an exported `config` for replay.

| Implementation | Command from the repository root |
| --- | --- |
| JavaScript | `node tools/conformance-js.mjs` |
| Python | `python tools/conformance-python.py` |
| Go | `go -C packages/go run ./cmd/conformance` |
| Kotlin | `packages/kotlin/gradlew -q -p packages/kotlin jsonConformance` |
| Swift | `swift run --package-path packages/swift --force-resolved-versions TextHueConformance` |
| Dart | `dart run packages/dart/tool/conformance.dart` |
| C# | `dotnet run --configuration Release --project packages/csharp/tools/JsonRunner` |
| Rust | `cargo run --quiet --locked --manifest-path packages/rust/Cargo.toml --example conformance` |

Build the npm package before testing. Kotlin needs a JDK and uses `gradlew.bat` on Windows. Dart needs its locked dependencies restored with `dart pub get --enforce-lockfile` in `packages/dart`. C# targets .NET 9.

## Comparing results

Run `python -m unittest discover -s tests -p test_text_to_color.py -k cross_language_generated_cases` from the repository root. JavaScript, Python, and Go are required. The test records skips for unavailable optional toolchains. A build failure or output mismatch from an available runner fails its subtest.

The generated direct-resolution cases compare each runner with JavaScript. The Display-P3 cases compare each runner, including JavaScript, with Python. Both comparisons cover complete palettes and contrast reports using the test suite's numerical tolerances. The replay check compares each supporting runner's direct and restored results for exact equality.

At commit `4c0acbe`, all eight implementations matched on 236 generated
resolution cases and 24 Display-P3 cases in local runs. JavaScript, Python,
and Go also reproduced their 236 direct results exactly from exported
configurations. Kotlin ran on the Windows JVM using Android Studio's JDK.
Swift ran on x86-64 Linux in Docker using Swift 6.1.3. The Windows Dart run
used the Flutter installation's `bin/cache/dart-sdk/bin/dart.exe` directly.
These comparisons exercise the JSON runner contract. The separate API 34
emulator test exercises the Kotlin fixtures on Android ART.

## Registering a runner

Set `conformanceRunner` in the package's entry in `tools/packages.json` to the argument list for its command. Set `conformanceReplay` to `true` if it accepts exported configurations. The parity test reads this manifest and sends the Display-P3 corpus to every registered runner.
