# Releasing TextHue

The repository contains three distribution units: one npm package for JavaScript and TypeScript, one Python distribution for PyPI, and one Go module. The root npm workspace is private. Build and check scripts never publish; releases go through the `Publish` GitHub Actions workflow, which uploads only after the tree is verified.

## Build and verify locally

Install Node.js 22+, Python 3.11+, and Go 1.23+. From the repository root:

```powershell
npm ci
python -m venv .venv
.venv\Scripts\python -m pip install -r requirements-dev.txt
.venv\Scripts\python tools/verify.py
.venv\Scripts\python tools/build-packages.py
```

Use `.venv/bin/python` on macOS/Linux. The package tool writes `artifacts/texthue-<version>.tgz`, `artifacts/texthue-<version>-py3-none-any.whl`, `artifacts/texthue-<version>.tar.gz`, and `artifacts/SHA256SUMS`. It installs the tarball and wheel into isolated temporary consumers, checks the frozen valid and invalid cases, compiles a consumer against the packed TypeScript declarations, rebuilds the Python source distribution, and runs a separate Go consumer with a local module replacement.

Inspect archive contents and rendered registry READMEs before releasing. The npm archive includes compiled ESM, declarations, source maps and source, examples, README, specification, and license notices. The Python wheel includes annotations, `py.typed`, documentation under `texthue/_docs/`, and distribution license metadata; its source distribution also includes the example scripts and build metadata. The Go subdirectory contains its own README, specification, notices, and test fixtures so its tests do not depend on the monorepo parent.

## Version and compatibility rules

- Update the root `package.json`, `packages/npm/package.json`, `packages/python/pyproject.toml`, and `packages/python/src/texthue/__init__.py` together. `python tools/check-version.py` confirms they agree, and the pre-commit hook and CI run it. Run `npm install --package-lock-only --ignore-scripts` to refresh lock metadata.
- Go's release version comes from its Git tag. A `v0`/`v1` module does not add a version suffix to the module path. A future `v2` needs a Go major-version path migration.
- The algorithm version is a separate contract. Do not change the `text-to-color-v1` prefix, matrices, defaults, validation, tie breaks, gamut search, or rounding under that identifier. Color-changing work needs a new explicitly versioned algorithm and its own vectors.
- `conformance/vectors.json` is frozen and protected by a SHA-256 check. Never replace expected output to make an implementation pass. `node tools/build-vectors.mjs --check` compares computed results without rewriting the fixture.
- After changing the specification, notices, or Python README, run `python tools/sync-shared.py` and commit all distributed copies. The pre-commit hook and `python tools/verify.py` reject stale copies.
- Once a registry release exists, treat its contents as immutable and publish a new version for corrections.

## One-time publishing setup

The `Publish` workflow (`.github/workflows/publish.yml`) needs the following configured once in the GitHub repository and the registries.

- **npm.** Either add an `NPM_TOKEN` repository secret containing a granular automation token with publish rights for `texthue`, or configure [npm trusted publishing](https://docs.npmjs.com/trusted-publishers) for the package with this repository, workflow file `publish.yml`, and environment `npm`. Trusted publishing needs the package to exist, so the first release uses the token; the token can be removed afterwards. Provenance attestations are generated either way.
- **PyPI.** Add a [trusted publisher](https://docs.pypi.org/trusted-publishers/) on pypi.org for project `texthue` with owner `HusteDev`, repository `texthue`, workflow `publish.yml`, and environment `pypi`. A pending publisher can be registered before the first release. No secret is needed.
- **Go.** Nothing. The module is released by pushing the tag `packages/go/v<version>`, which the workflow does with the repository's own token.
- **Environments.** Create the `npm` and `pypi` environments under repository settings and, optionally, add required reviewers so each upload waits for approval.
- **Codecov.** Add a `CODECOV_TOKEN` repository secret from codecov.io so the CI coverage job can upload reports.

## Publish a release

1. Bump the version in the four manifests, update the lock file, and merge the change to `main` with a green CI run.
2. Open the Actions tab, choose **Publish**, and run it from `main` with the version (for example `0.1.0`). Leave the npm, PyPI, Go, and GitHub release options enabled unless a target was already published.
3. The `build` job checks that every manifest declares the requested version, refuses to run if `v<version>` or `packages/go/v<version>` already exists, runs the full verification, builds the archives, and stores them as a workflow artifact. Nothing is uploaded if any step fails.
4. `publish-npm` uploads the exact tested tarball with `--provenance --access public`. `publish-pypi` uploads the wheel and source distribution through trusted publishing. `publish-go` creates and pushes the `packages/go/v<version>` tag and asks `proxy.golang.org` to index it. `github-release` creates a `v<version>` release with the archives, `SHA256SUMS`, and generated notes.
5. Approve the environment deployments if reviewers are required.

Do not use a root `v<version>` tag as the Go module tag; the nested module needs the `packages/go/` prefix. Consumers request `github.com/HusteDev/texthue/packages/go@v<version>`. See [Go's module source organization documentation](https://go.dev/doc/modules/managing-source).

## Manual fallback

If the workflow cannot be used, publish the locally built archives from the repository root after `python tools/verify.py` and `python tools/build-packages.py` pass:

```powershell
npm publish artifacts/texthue-<version>.tgz --access public
python -m pip install twine
python -m twine check artifacts/texthue-<version>-py3-none-any.whl artifacts/texthue-<version>.tar.gz
python -m twine upload artifacts/texthue-<version>-py3-none-any.whl artifacts/texthue-<version>.tar.gz
git tag -a packages/go/v<version> -m "TextHue Go v<version>"
git push origin packages/go/v<version>
```

Do not commit tokens or place them in package metadata.

## Post-publication verification

Install each registry version into a clean consumer, without local replacements, and verify the known `research` output (`#59b8d8` light fill, `#255464` dark fill). Check that the READMEs, licenses, declarations and typing markers, and source links render correctly. Record the registry URLs and the release commit.

For a partial publication, dispatch the same commit and version with **resume** enabled and select the remaining targets. The workflow downloads the original release assets and checks the commit, archive set and both digest records before forwarding them to publishers. A missing or inconsistent bundle stops recovery. Restore the original assets or select a new version.

## Dart publication validation

From the repository root, run `python tools/check-dart-publication.py` to inspect the pub archive and validate its publication metadata. The dry run accepts the two advisories about the deliberately pinned runtime dependencies. Other validation warnings or failures require review.
