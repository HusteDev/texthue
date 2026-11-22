# Releasing TextHue

The Publish workflow supports npm, PyPI and Go. npm receives the core JavaScript package and optionally the React and Tailwind adapters, PyPI receives the Python distribution, and Go resolves the module through its subdirectory tag. The root npm workspace is private.

The [package manifest](../tools/packages.json) lists each package directory, version source, shared files, and verification commands. Only entries with a `publish` record are registry targets for the current workflow.

| Package | Distribution format | Local verification |
| --- | --- | --- |
| Kotlin | Maven library | `python tools/verify.py --port kotlin` |
| Swift | SwiftPM package | `python tools/verify.py --port swift` |
| Dart | Dart pub package | `python tools/verify.py --port dart` |
| C# | NuGet package | `python tools/verify.py --port csharp` |
| Rust | Cargo crate | `python tools/verify.py --port rust` |
| WebAssembly | npm package | `python tools/verify.py --port wasm` |
| React and Tailwind | npm adapters | After `npm ci` and `npm run build`, run `python tools/verify.py --port react` and `python tools/verify.py --port tailwind`. |

For Rust distribution testing, run `python tools/stage-rust.py .cache/rust-staging`. It tests the unpacked crate and executes its bundled consumer before copying the original Cargo archive into the destination. A conflicting archive at the same destination fails staging.

Run `python tools/release.py crate-state --version <version> --archive <staged-crate>`
to compare the archive with the crates.io sparse index. A matching version must
have the staged SHA-256 and be available for new consumers. A yanked version
or a checksum conflict stops recovery, as does an unreadable index.

Select `rust` to publish from the staged crate. Configure a crates.io publish
token as `CARGO_REGISTRY_TOKEN` in the `crates-io` GitHub environment.
`python tools/publish-crate.py <version> <staged-crate>` constructs the request
locally. The workflow adds `--upload` only after checking the registry. The request
contains the original compressed bytes and metadata read from that same archive.

Select `wasm` to publish the staged `@texthue/wasm` tarball. Configure the npm
environment for that scoped package. Its Node and browser checks run before
draft staging. A retry compares the staged archive with the registry, independently
of the core JavaScript package.

Select `npm_adapters` to publish both scoped packages. Configure npm publishing rights or trusted publishing for each package in the `npm` environment. The jobs require the staged core version to match the registry before uploading either adapter. On retry, each matching adapter is skipped independently.

New drafts retain the React and Tailwind tarballs tested against the staged core
tarball. To replay those consumer tests against a downloaded bundle, run
`python tools/check-react-consumers.py --archives artifacts` and
`python tools/check-tailwind-consumer.py --archives artifacts`.

New draft bundles also contain `TextHue.<version>.nupkg` and `texthue-<version>.crate`.
Select `nuget` to upload the staged .NET archive. Provide `NUGET_API_KEY` in
the `nuget` environment. A retry downloads the existing package and compares
NuGet content hashes, which account for repository signing. A different hash
or a failed lookup stops the job.
The build job exercises the NuGet consumer and runs the unpacked crate's tests
and example before recording the archive digests.
Resuming an older bundle preserves its original archive set.

The Kotlin draft asset, `texthue-<version>-maven.zip`, contains the binary JAR,
sources JAR, documentation JAR, POM and Gradle module metadata under their Maven coordinates.
The documentation artifact includes the Kotlin guide and algorithm specification.
The build tests a separate Kotlin consumer against the extracted ZIP before
staging it. Maven Central signing and publication remain separate steps.

Run `python tools/check-swift-tag.py` with Swift 6 and Git to verify version
resolution before releasing. It tags the current commit in a disposable local
clone, resolves the exact version from an independent SwiftPM application,
checks the resolved commit and runs the example. Selecting GitHub release
promotion also runs the root package tests and tagged consumer on macOS.
Promotion publishes the root version tag used by SwiftPM. A dry run with
GitHub release selected exercises this gate before any promotion.

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

- Update every version source listed in the manifest together. When changing the core npm version, also update the adapters’ exact `texthue` dependencies. `python tools/check-version.py` confirms they agree, and the pre-commit hook and CI run it. Run `npm install --package-lock-only --ignore-scripts` to refresh lock metadata.
- Go's release version comes from its Git tag. A `v0`/`v1` module does not add a version suffix to the module path. A future `v2` needs a Go major-version path migration.
- The algorithm version is a separate contract. Do not change the `text-to-color-v1` prefix, matrices, defaults, validation, tie breaks, gamut search, or rounding under that identifier. Color-changing work needs a new explicitly versioned algorithm and its own vectors.
- `conformance/vectors.json` is frozen and protected by a SHA-256 check. Never replace expected output to make an implementation pass. `node tools/build-vectors.mjs --check` compares computed results without rewriting the fixture.
- After changing the specification, notices, or Python README, run `python tools/sync-shared.py` and commit all distributed copies. The pre-commit hook and `python tools/verify.py` reject stale copies.
- Once a registry release exists, treat its contents as immutable and publish a new version for corrections.

## Rehearse draft staging

Set `dry_run` to true on the Publish workflow to verify the version and stage the original tested archives in a draft GitHub release. This writes draft release assets in the repository. Registry jobs, the Go module tag, and release promotion are skipped regardless of the individual target selections. For a later release from the same commit, set `resume` to true and `dry_run` to false to reuse the verified bundle.

## One-time publishing setup

The `Publish` workflow (`.github/workflows/publish.yml`) needs the following configured once in the GitHub repository and the registries.

- **npm.** Either add an `NPM_TOKEN` repository secret containing a granular automation token with publish rights for `texthue`, or configure [npm trusted publishing](https://docs.npmjs.com/trusted-publishers) for the package with this repository, workflow file `publish.yml`, and environment `npm`. Trusted publishing needs the package to exist, so the first release uses the token; the token can be removed afterwards. Provenance attestations are generated either way.
- **PyPI.** Add a [trusted publisher](https://docs.pypi.org/trusted-publishers/) on pypi.org for project `texthue` with owner `HusteDev`, repository `texthue`, workflow `publish.yml`, and environment `pypi`. A pending publisher can be registered before the first release. No secret is needed.
- **Go.** Nothing. The module is released by pushing the tag `packages/go/v<version>`, which the workflow does with the repository's own token.
- **Environments.** Create the `npm` and `pypi` environments under repository settings and, optionally, add required reviewers so each upload waits for approval.
- **Codecov.** Add a `CODECOV_TOKEN` repository secret from codecov.io so the CI coverage job can upload reports.

## Publish a release

1. Update the manifest version sources and lock metadata together. Merge the tested commit to `main`.
2. Dispatch **Publish** from that commit with its version and the desired targets. For recovery, select **resume** and the remaining targets.
3. The build job checks the manifest versions and verifies that any existing root version tag resolves to the workflow commit. For a new version it verifies and builds the archives, records their digests, and stages the original bytes in a draft GitHub release. For an existing bundle it downloads and verifies the staged assets. A resume request requires that original bundle.
4. Each selected registry job checks its own target. Matching archives or a matching Go tag are skipped. Conflicts and lookup failures stop the affected job. Once selected jobs succeed, the GitHub release job rechecks the root tag and promotes the draft if promotion was requested.
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

The release workflow runs Dart conformance, the pub dry run and the standalone
consumer check before staging a new draft. The staging helper builds a tar.gz
from the file inventory reported by pub and runs the consumer against its
extracted contents. The draft stores these tested bytes and their SHA-256 digest.
The archive is assembled by TextHue because pub's dry run only prints the inventory.

The optional Dart publish job uses the `pub-dev` environment's `PUB_TOKEN`
secret, which must grant upload access for texthue. It compares the staged
archive digest with pub.dev and uploads an absent version using Dart 3.12.2's
`--from-archive` option. Selecting Dart on a retry reuses the draft archive.

From the repository root, run `python tools/check-dart-publication.py` to inspect the pub archive and validate its publication metadata. The dry run accepts the two advisories about the deliberately pinned runtime dependencies. Other validation warnings or failures require review.

## Signing the staged Kotlin bundle

With the release key available to GnuPG, run the following from the repository root.
Supply the full key fingerprint and a new destination filename.

```sh
python tools/sign-maven.py artifacts/texthue-0.1.0-maven.zip texthue-0.1.0-signed.zip 0.1.0 "$SIGNING_FINGERPRINT"
```

The helper preserves the five staged artifacts, verifies each detached signature,
and includes MD5, SHA-1, SHA-256 and SHA-512 checksums for each original file.
Retain the resulting signed ZIP for publication retries.
