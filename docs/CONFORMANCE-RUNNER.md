# Conformance runner contract

Every TextHue implementation ships a small executable used only for testing:
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
  expected outcome the runner should report per-item — the runner should
  print the error to stderr and exit non-zero. The generated-case test only
  ever sends valid input to this runner; invalid-input coverage is handled
  by each language's own test suite against the fixed vectors in
  `conformance/vectors.json`, not through this executable.
- No other output on stdout. Diagnostic logging goes to stderr.

## Existing runner

`packages/go/cmd/conformance/main.go` implements this contract for Go. Its
`README.md` documents how it is invoked. Use it as the template for a new
language's runner: same stdin/stdout shapes, same exit-code rule.

## Registering a runner

Add the command to invoke it (and any build step it needs) to that
package's entry in `tools/packages.json` under `conformanceRunner`. The
cross-language test in `tests/` builds the manifest's runner list and
invokes each one; JavaScript (`packages/npm/dist/index.js`) is always the
reference implementation that every other runner's output is compared
against, not a peer.
