# Changelog

All notable changes to TextHue are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); this project uses
a shared release version for manifest-versioned distributions (see
[Releasing](docs/RELEASING.md)) and a separate, explicitly versioned
`text-to-color-v1` algorithm identifier that changes only when the color
mapping itself changes.

## [Unreleased]

### Renderer and integration changes

- The redesigned renderer derives coordinated roles for both themes, fits colors to gamut, and repairs contrast. JavaScript, Python, and Go share frozen reference vectors.
- Configured resolvers support collection assignment, saved registries, brand colors, and configuration replay. Projection can select individual themes, roles, and formats.
- Display P3 output includes an sRGB fallback. Contrast options include WCAG ratios and APCA measurements.
- Kotlin, Swift, Dart, C#, Rust, and WebAssembly have package-specific verification commands. The release guide lists their distribution formats and verification paths.
- The palette inspector compares hash, collection, and registry colors. The React and Tailwind adapters integrate those colors into component rendering and stylesheet builds. Performance checks bound renderer work across five contrast scenarios.

- Applications that resolve individual labels can import `texthue/single`. Its runtime import graph excludes collection assignment, vision diagnostics, registry fingerprinting, migration, and CSS exports.
- Rust, C#, Kotlin, Swift, and Dart support collection assignment and replay of pinned placements. Their strict hex helpers report a failed contrast target for the selected role.
- JavaScript, Python, and Go batch calls share rendering work for labels that normalize to the same identity and return results in input order.
- The inspector can open saved configuration and registry JSON files. The last completed palette stays visible while the next calculation runs.
- All eight implementations have measured median and p95 latency for assigning 40 labels. [Performance results](docs/PERFORMANCE.md)

### Added
- `tools/packages.json`, a language-neutral manifest describing every
  distribution (directory, shared files, version files, build/test/lint
  commands). `tools/sync-shared.py`, `tools/check-version.py`,
  `tools/verify.py`, and `tools/build-packages.py` now read it instead of
  hardcoding each language.
- `CONTRIBUTING.md` and `SECURITY.md`.
- JavaScript, Python, Go, Rust, Swift, C#, and Dart register JSON conformance runners.
  They read resolution requests from stdin and return palettes in input order.
  JavaScript, Python, and Go also accept exported configurations for replay.
  [Runner contract](docs/CONFORMANCE-RUNNER.md)
- `tools/release.py`, extracted from `.github/workflows/publish.yml`, with
  its own unit tests: strict version validation, and per-registry release
  state (not-requested / absent / matching / conflicting / lookup-failed)
  used to make publication resumable.

### Changed
- `.github/workflows/publish.yml` no longer swallows a failed version check
  through `echo "version=$(...)"`; the check runs as its own step and fails
  the job before anything downstream reads its output.
- Publication now uploads the verified build and a `release-manifest.json`
  (commit SHA, versions, algorithm identifier, archive digests) as assets on
  a draft GitHub release before any registry upload, and each registry job
  checks its own target's state before publishing so a completed npm
  publish no longer blocks retrying a failed PyPI publish, and vice versa.

## [0.1.0] - Unreleased

Initial implementation: `text-to-color-v1` across JavaScript/TypeScript,
Python, and Go, with a shared specification, frozen conformance vectors, and
CI/release tooling. Not yet published to any registry.
