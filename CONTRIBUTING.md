# Contributing to TextHue

TextHue ships the same `text-to-color-v1` algorithm as independent, native
implementations in JavaScript/TypeScript, Python, and Go (more languages are
in progress; see the [plan](README.md)). Every change must keep those
implementations in agreement.

## Setup

Node.js 22+, Python 3.11+, and Go 1.23+ are required. From the repository
root:

```powershell
npm ci
python -m venv .venv
.venv\Scripts\python -m pip install -r requirements-dev.txt
.venv\Scripts\python tools/verify.py
```

Use `.venv/bin/python` on macOS/Linux. `pre-commit install` applies the same
lint and format checks as a Git pre-commit hook. The default verifier builds and tests the JavaScript,
Python, and Go libraries, compares conformance vectors, and checks lint,
shared files, and documentation links.

For an additional port, run `python tools/verify.py --port NAME` with its
toolchain installed. The supported names are `rust`, `csharp`, `kotlin`,
`swift`, `dart`, and `wasm`. Kotlin uses the built JavaScript reference.
See each package README for toolchain prerequisites. CI runs these commands
in the corresponding port jobs.

## Cross-language conformance rules

1. **The algorithm is frozen under its identifier.** `text-to-color-v1`
   fixes the hash framing, sampling, gamut fitting, contrast repair,
   rounding, and every tie-break. A change to any of those is a new,
   explicitly versioned algorithm with its own conformance vectors, never a
   silent edit under the same identifier. See
   [SPECIFICATION.md](SPECIFICATION.md) and
   [`docs/RELEASING.md`](docs/RELEASING.md#version-and-compatibility-rules).
2. **`conformance/vectors.json` is generated, not hand-edited.** It is
   produced from the compiled npm package by `tools/build-vectors.mjs`,
   which is the reference implementation. To add a case, add it to the
   `cases` or `invalid` array in that file and run
   `node tools/build-vectors.mjs --write`; never hand-edit the JSON. Run
   `node tools/build-vectors.mjs --check` (part of `tools/verify.py`) to
   confirm the checked-in file still matches. If your change alters any
   existing vector's expected output, it changed the v1 mapping and needs a
   new algorithm version, not a fixture update.
3. **The specification, license, and third-party notices are shared
   files.** Edit only the root `SPECIFICATION.md`, `LICENSE`, and
   `THIRD_PARTY_NOTICES.md`; each package directory holds a synced copy.
   After editing, run `python tools/sync-shared.py` and commit every updated
   copy. `tools/sync-shared.py --check` (part of `tools/verify.py`) rejects
   a stale copy.
4. **Every implementation is validated the same way.** Each language ships
   a conformance-runner executable that reads `[{text, options}]` JSON on
   stdin and writes `[ColorSet]` JSON on stdout (see
   [`docs/CONFORMANCE-RUNNER.md`](docs/CONFORMANCE-RUNNER.md)). The
   cross-language test in `tests/` generates random and tuned option
   combinations, runs every registered runner, and compares results to the
   JavaScript implementation within the tolerances stated in
   `SPECIFICATION.md`.

## Adding a new distribution (package/language)

1. Add an entry to `tools/packages.json`: its directory, language, version
   file(s), shared-file destinations, and build/test/lint/conformance
   commands. `tools/sync-shared.py`, `tools/check-version.py`,
   `tools/verify.py`, and `tools/build-packages.py` read this manifest, so a
   correct entry is normally the only tooling change needed.
2. Port the algorithm directly from `packages/npm/src/color-math.ts`,
   matching the specification's exact operation order, iteration counts,
   and tie-breaks. Do not port from another port; the npm package is the
   reference implementation.
3. Add a conformance-runner executable following
   [`docs/CONFORMANCE-RUNNER.md`](docs/CONFORMANCE-RUNNER.md), a README
   modeled on an existing package README, and copies of the shared files
   produced by `tools/sync-shared.py`.
4. Run `python tools/verify.py`; it now includes the new package.

## Pull requests

- Keep the algorithm and the tooling/documentation changes in separate
  commits where practical.
- Describe what `tools/verify.py` you ran and its result.
- Do not increase a numerical tolerance to make a failing comparison pass;
  investigate the discrepancy against the pinned specification instead.

## Reporting a security issue

See [SECURITY.md](SECURITY.md).

After changing package paths, version files, or shared fixtures in `tools/packages.json`, run `python tools/render-config.py` and commit the generated configuration. The primary verifier checks for drift.
