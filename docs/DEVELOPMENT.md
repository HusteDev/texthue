# Repository and development

```text
packages/npm/       TypeScript implementation, ESM output, declarations, examples
packages/python/    Python implementation, typing marker, executable examples
packages/go/        Go module, executable examples, bundled conformance test data
conformance/        Frozen language-neutral valid and invalid vectors
tests/              JavaScript and cross-language Python tests
tools/              Verification, package builds, lint runners, shared-file synchronization
docs/               Versioned handbook, development and release procedures
SPECIFICATION.md    Canonical algorithm specification
```

Development requires Node.js 22+, Python 3.11+, and Go 1.23+. From this directory:

```powershell
npm ci
python -m venv .venv
.venv\Scripts\python -m pip install -r requirements-dev.txt
.venv\Scripts\python tools/verify.py
.venv\Scripts\python tools/build-packages.py
```

On macOS/Linux use `.venv/bin/python` instead. Verification compiles the npm package, checks TypeScript examples, runs the primary language suites and examples, compares available registered implementations on generated cases, runs static checks, validates documentation links and shared files, and checks the frozen vectors. The package build produces an npm tarball, a Python wheel and source distribution, and installs each into an isolated consumer. Build outputs go to the ignored `artifacts/` directory.

Linting uses Ruff and Black for Python, Biome for JavaScript and TypeScript, gofmt, go vet, and golangci-lint for Go, and zizmor for the GitHub Actions workflows. Run `pre-commit install` once to apply all of them as a Git pre-commit hook; `npm run lint`, `npm run lint:python`, and `npm run lint:go` run each set directly, and `npm run coverage`, `npm run coverage:python`, and `npm run coverage:go` write coverage reports to `coverage/`. Continuous integration runs the lint hooks, the full verification on Windows, Linux, and macOS, coverage upload to Codecov, and dependency review on pull requests. A separate security workflow runs CodeQL analysis for JavaScript/TypeScript, Python, Go, C#, Kotlin, Swift, and GitHub Actions, audits the workflows with zizmor, and publishes an OpenSSF Scorecard.

The specification and notices are shared files: edit the root copies and run `python tools/sync-shared.py` to refresh the copies distributed with each package. The conformance vectors are frozen and protected by a digest check; a change to v1 output is a new algorithm version, not a fixture update. See the [release procedure](RELEASING.md) for versioning and publication steps.

## Browser rendering evidence

On Windows, Chrome passed the linear-sRGB composite fixtures, fallback selection, Display P3 CSS selection, and exact native P3 canvas byte check. Playwright Firefox 148.0.2 and WebKit 26.4 passed the composites and both CSS selection checks, then failed native P3 readback. Both returned RGB bytes `104,174,255` for expected P3 bytes `120,172,255`; neither reported an ImageData color space. The test retains the exact-byte requirement and reports the observed values. Physical display output has separate verification requirements.

After building the npm package, install the Playwright test engines with `python -m playwright install firefox webkit`. Run `python tools/check-browser.py firefox` and `python tools/check-browser.py webkit` to repeat those checks.
