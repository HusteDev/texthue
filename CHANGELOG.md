# Changelog

All notable changes to TextHue are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); this project uses
independent version numbers for each distribution (see
[Releasing](docs/RELEASING.md)) and a separate, explicitly versioned
`text-to-color-v1` algorithm identifier that changes only when the color
mapping itself changes.

## [Unreleased]

### Added
- `tools/packages.json`, a language-neutral manifest describing every
  distribution (directory, shared files, version files, build/test/lint
  commands). `tools/sync-shared.py`, `tools/check-version.py`,
  `tools/verify.py`, and `tools/build-packages.py` now read it instead of
  hardcoding each language.
- `CONTRIBUTING.md` and `SECURITY.md`.
- A conformance runner contract (`docs/CONFORMANCE-RUNNER.md`): every
  implementation ships an executable that reads `[{text, options}]` JSON on
  stdin and writes `[ColorSet]` JSON on stdout, used by the cross-language
  parity test.
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
