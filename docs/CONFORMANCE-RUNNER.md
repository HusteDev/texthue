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
- **Exit code**: `0` if every case resolved successfully. Any resolution
  error (invalid text or options) is a bug in the *test's* input, not an
  expected outcome the runner should report per-item â€” the runner should
  print the error to stderr and exit non-zero. The generated-case test only
  ever sends valid input to this runner; invalid-input coverage is handled
  by each language's own test suite against the fixed vectors in
  `conformance/vectors.json`, not through this executable.
- No other output on stdout. Diagnostic logging goes to stderr.

## Registered runners

Kotlin supports direct sRGB resolution through the Gradle wrapper. With a JDK available, run `packages/kotlin/gradlew -q -p packages/kotlin jsonConformance` from the repository root (use `gradlew.bat` on Windows). JSON parsing uses Gradle's bundled Groovy library in a development-only source set.

Dart supports direct sRGB resolution. Restore the locked dependencies with `dart pub get --enforce-lockfile` in `packages/dart`, then run `dart run packages/dart/tool/conformance.dart` from the repository root. The runner compares complete palettes, including both contrast reports, through the generated parity suite.

C# supplies a .NET 9 runner for direct sRGB resolution. Run `dotnet run --configuration Release --project packages/csharp/tools/JsonRunner` from the repository root with the request array on stdin. The generated parity test includes C# when the .NET toolchain is available.

Rust supplies a Cargo example for direct resolution requests. Run
`cargo run --quiet --locked --manifest-path packages/rust/Cargo.toml --example conformance`
from the repository root with a JSON array on stdin. The runner uses the production
renderer and development-only JSON dependencies. The parity suite includes Rust
when Cargo is available.

`tools/conformance-js.mjs` runs the JavaScript reference. `packages/go/cmd/conformance/main.go` implements the Go runner. `tools/conformance-python.py` runs the Python implementation in a subprocess using the active Python interpreter. The Go runner’s README documents its invocation. Use it as the template for a new
language's runner: same stdin/stdout shapes, same exit-code rule.

## Registering a runner

Swift supplies the `TextHueConformance` executable. From the repository root, run
`swift run --package-path packages/swift --force-resolved-versions TextHueConformance`
with a JSON array on stdin. It accepts direct resolution requests. JavaScript,
Python and Go also support configuration replay.

To compare installed ports after building the npm package, run
`python -m unittest discover -s tests -p test_text_to_color.py -k cross_language_generated_cases`.
JavaScript, Python and Go are required. The test includes Swift when `swift` is
on PATH and records a skipped Swift subtest otherwise. A Swift build failure
or output mismatch fails the test when the toolchain is present.

Add the command to invoke it (and any build step it needs) to that
package's entry in `tools/packages.json` under `conformanceRunner`. The
cross-language test in `tests/` builds the manifest's runner list and
invokes each one; JavaScript (`packages/npm/dist/index.js`) is always the
reference implementation that every other runner's output is compared
against, not a peer.

Set `conformanceReplay` to `true` for runners that also accept inputs containing `text` and an exported `config`. The test replays every generated case through these runners and compares the returned results with their direct-resolution outputs.
