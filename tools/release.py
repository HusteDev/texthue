"""Release-safety logic used by .github/workflows/publish.yml.

Extracted out of workflow YAML into a tested Python module so validation and
per-registry state checks can be unit tested (tests/test_release.py) without
simulating GitHub Actions or touching real registries.

Design principles (see docs/RELEASING.md and the P0 items in the project's
revision plan):

* A requested version is validated strictly. Validation either prints
  exactly the agreed version on stdout and exits 0, or prints nothing on
  stdout and exits nonzero. There is no way for a failure to look like a
  (possibly empty) success to a caller capturing stdout, unlike the
  previous ``echo "version=$(...)" >> "$GITHUB_OUTPUT"`` workflow step,
  where a failed ``check-version.py`` produced an empty but "successful"
  ``echo``.
* Each publish target's state is one of four values, never conflated:
  ABSENT (safe to publish), MATCHING (already published with the exact
  bytes we would publish; safe to skip), CONFLICTING (already published
  with different bytes; must not overwrite), or LOOKUP_FAILED (the
  registry could not be queried; must not be treated as ABSENT, or a
  transient network error would let a job silently re-publish and could
  overwrite a real conflicting release).
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import subprocess
import sys
import urllib.error
import urllib.request
from collections.abc import Callable
from dataclasses import dataclass, field
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

VERSION_PATTERN = re.compile(r"^[0-9]+\.[0-9]+\.[0-9]+$")

# Per-target state. LOOKUP_FAILED is distinct from ABSENT on purpose: see the
# module docstring and the *_target_state functions below.
ABSENT = "absent"
MATCHING = "matching"
CONFLICTING = "conflicting"
LOOKUP_FAILED = "lookup-failed"
STATES = (ABSENT, MATCHING, CONFLICTING, LOOKUP_FAILED)


class ReleaseError(Exception):
    """Raised for any invalid input or unsafe release condition."""


def validate_version(requested: str) -> str:
    """Validate a requested release version against strict ``X.Y.Z`` syntax.

    Raises ReleaseError for an empty, malformed, or shell-unsafe value.
    Never returns a partially validated or coerced value: the return value
    is always byte-identical to a value that already matched
    ``VERSION_PATTERN``, so it is always safe to interpolate into a tag name
    or file path built with simple string formatting downstream.
    """
    if requested is None:
        raise ReleaseError("Version must not be empty.")
    candidate = requested.strip()
    if candidate.startswith("v"):
        candidate = candidate[1:]
    if not candidate or not VERSION_PATTERN.fullmatch(candidate):
        raise ReleaseError(f"Version {requested!r} is not a well-formed X.Y.Z release version.")
    return candidate


def check_version(requested: str, manifests: dict[str, str]) -> str:
    """Validate that every package manifest agrees with the requested version.

    ``manifests`` is normally ``tools.check_version.versions()``'s result.
    Raises ReleaseError, with no partial output, if the requested version is
    malformed or does not match every manifest.
    """
    version = validate_version(requested)
    distinct = set(manifests.values())
    if len(distinct) != 1:
        lines = "\n".join(f"  {label}: {value}" for label, value in manifests.items())
        raise ReleaseError(f"Package versions differ:\n{lines}")
    (agreed,) = distinct
    if agreed != version:
        raise ReleaseError(f"Manifests declare {agreed}, requested {requested!r}.")
    return version


@dataclass(frozen=True)
class TargetState:
    """The result of checking one publish target's registry state."""

    state: str
    detail: str = ""

    def __post_init__(self):
        if self.state not in STATES:
            raise ReleaseError(f"Unknown target state: {self.state!r}")


Runner = Callable[[list[str]], subprocess.CompletedProcess]


def _default_runner(command: list[str]) -> subprocess.CompletedProcess:
    """Run a command, resolving Windows' .cmd shims (e.g. npm.cmd) the way a
    shell would, since subprocess with shell=False does not do this
    automatically. Production release jobs run on ubuntu-latest, where this
    resolves to a no-op; it matters for exercising this module locally on
    Windows and keeps the module portable.
    """
    import shutil

    resolved = shutil.which(command[0]) or command[0]
    return subprocess.run([resolved, *command[1:]], capture_output=True, text=True, timeout=60)


def npm_target_state(
    package: str, version: str, local_digest: str | None, *, run: Runner = _default_runner
) -> TargetState:
    """Check whether ``package@version`` already exists on the npm registry.

    ``local_digest`` is the sha1 shasum of the tarball this run built, if
    known (``npm view dist.shasum`` reports sha1, not sha256). npm reports a
    missing version as a nonzero exit whose stderr names an "E404"; any
    other nonzero exit (auth, network, registry outage) is a lookup
    failure, never treated as absence.
    """
    result = run(["npm", "view", f"{package}@{version}", "dist.shasum", "--json"])
    if result.returncode != 0:
        if "E404" in (result.stderr or ""):
            return TargetState(ABSENT)
        return TargetState(LOOKUP_FAILED, result.stderr.strip())
    try:
        published_shasum = json.loads(result.stdout)
    except json.JSONDecodeError:
        return TargetState(LOOKUP_FAILED, "unparseable npm view output")
    if local_digest is None:
        return TargetState(LOOKUP_FAILED, "no local digest to compare")
    return TargetState(MATCHING if published_shasum == local_digest else CONFLICTING)


class _NotFound(Exception):
    """Raised by the default PyPI fetcher for a 404 response."""


def _default_fetch(url: str) -> bytes:
    try:
        with urllib.request.urlopen(url, timeout=30) as response:  # noqa: S310
            return response.read()
    except urllib.error.HTTPError as error:
        if error.code == 404:
            raise _NotFound from error
        raise


def pypi_target_state(
    package: str,
    version: str,
    local_digests: dict[str, str] | None,
    *,
    fetch: Callable[[str], bytes] | None = None,
) -> TargetState:
    """Check whether ``package==version`` already exists on PyPI.

    ``local_digests`` maps built filename to its sha256, if known. A 404
    from the PyPI JSON API means absent; any other HTTP error or network
    failure is a lookup failure, never treated as absence.
    """
    fetch = fetch or _default_fetch
    try:
        body = fetch(f"https://pypi.org/pypi/{package}/{version}/json")
    except _NotFound:
        return TargetState(ABSENT)
    except Exception as error:  # noqa: BLE001 - any transport failure is a lookup failure
        return TargetState(LOOKUP_FAILED, str(error))
    try:
        payload = json.loads(body)
    except json.JSONDecodeError:
        return TargetState(LOOKUP_FAILED, "unparseable PyPI JSON response")
    if local_digests is None:
        return TargetState(LOOKUP_FAILED, "no local digests to compare")
    published = {item["filename"]: item["digests"]["sha256"] for item in payload.get("urls", [])}
    if published.keys() != local_digests.keys():
        return TargetState(CONFLICTING, "different file set published")
    if all(published[name] == digest for name, digest in local_digests.items()):
        return TargetState(MATCHING)
    return TargetState(CONFLICTING)


def go_target_state(
    module_path: str, version: str, expected_commit: str, *, run: Runner = _default_runner
) -> TargetState:
    """Check whether the Go module tag ``packages/go/v<version>`` already exists.

    An empty ``git ls-remote`` result means absent; a nonzero exit is a
    lookup failure, never treated as absence. A tag that resolves to a
    different commit than ``expected_commit`` is conflicting and must not
    be reused or moved.
    """
    remote = f"https://{module_path.split('/packages/go')[0]}.git"
    tag = f"refs/tags/packages/go/v{version}"
    return tag_state(remote, tag, expected_commit, run=run)


def tag_state(remote: str, tag: str, expected_commit: str, *, run: Runner = _default_runner):
    peeled = tag + "^{}"
    result = run(["git", "ls-remote", remote, tag, peeled])
    if result.returncode != 0:
        return TargetState(LOOKUP_FAILED, result.stderr.strip())
    line = result.stdout.strip()
    if not line:
        return TargetState(ABSENT)
    refs = {}
    for record in line.splitlines():
        fields = record.split()
        if len(fields) != 2 or fields[1] not in (tag, peeled) or fields[1] in refs:
            return TargetState(LOOKUP_FAILED, "unexpected git ls-remote response")
        refs[fields[1]] = fields[0]
    if tag not in refs:
        return TargetState(LOOKUP_FAILED, "missing tag object")
    commit = refs.get(peeled, refs[tag])
    return TargetState(MATCHING if commit == expected_commit else CONFLICTING)


@dataclass
class ReleaseManifest:
    """The durable record attached to the draft release before any registry upload."""

    version: str
    commit: str
    algorithm_version: str
    archives: dict[str, str] = field(default_factory=dict)  # filename -> sha256

    def to_json(self) -> str:
        return json.dumps(
            {
                "version": self.version,
                "commit": self.commit,
                "algorithmVersion": self.algorithm_version,
                "archives": self.archives,
            },
            indent=2,
            sort_keys=True,
        )

    @staticmethod
    def from_artifacts(
        version: str, commit: str, algorithm_version: str, artifacts_dir: Path
    ) -> ReleaseManifest:
        archives = {
            path.name: hashlib.sha256(path.read_bytes()).hexdigest()
            for path in sorted(artifacts_dir.glob("*"))
            if path.is_file() and path.name not in {"SHA256SUMS", "release-manifest.json"}
        }
        return ReleaseManifest(version, commit, algorithm_version, archives)


def _load_check_version_module():
    """Load tools/check-version.py by path.

    Its filename has a hyphen, so it is not importable as ``import
    check_version`` through the normal import system; that name is also
    already used above for this module's own check_version() function, so
    binding it to the imported module would shadow that function too.
    importlib.util loads it by file path under a private module name
    instead, avoiding both problems.
    """
    import importlib.util

    spec = importlib.util.spec_from_file_location(
        "_texthue_check_version", ROOT / "tools" / "check-version.py"
    )
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _cmd_check_version(args: argparse.Namespace) -> int:
    manifests = _load_check_version_module().versions()
    try:
        version = check_version(args.requested, manifests)
    except ReleaseError as error:
        print(str(error), file=sys.stderr)
        return 1
    print(version)
    return 0


def verify_bundle(version: str, commit: str, directory: Path) -> None:
    """Check the complete consumer archive set and both digest records."""
    names = {f"texthue-{version}{suffix}" for suffix in (".tgz", ".tar.gz", "-py3-none-any.whl")}
    # Older staged releases predate the native archives. Both digest records still have to
    # agree with the exact set of files present in either bundle.
    for archive in (
        f"TextHue.{version}.nupkg",
        f"texthue-{version}.crate",
        f"texthue-{version}-maven.zip",
        f"texthue-react-{version}.tgz",
        f"texthue-tailwind-{version}.tgz",
        f"texthue-wasm-{version}.tgz",
    ):
        if (directory / archive).exists():
            names.add(archive)
    entries = list(directory.iterdir())
    if any(p.is_symlink() or not p.is_file() for p in entries):
        raise ReleaseError("Release assets must be regular files.")
    if {p.name for p in entries} != names | {"SHA256SUMS", "release-manifest.json"}:
        raise ReleaseError("Incomplete or unexpected release assets.")
    expected = ReleaseManifest.from_artifacts(version, commit, "text-to-color-v1", directory)
    saved = json.loads((directory / "release-manifest.json").read_text(encoding="utf-8"))
    if saved != json.loads(expected.to_json()):
        raise ReleaseError("Release metadata or archive digest mismatch.")
    sums = (directory / "SHA256SUMS").read_text(encoding="utf-8").splitlines()
    if sorted(sums) != sorted(f"{digest}  {name}" for name, digest in expected.archives.items()):
        raise ReleaseError("Release checksum list mismatch.")


def _cmd_verify_bundle(args: argparse.Namespace) -> int:
    verify_bundle(args.version, args.commit, Path(args.directory))
    return 0


def _cmd_manifest(args: argparse.Namespace) -> int:
    manifest = ReleaseManifest.from_artifacts(
        args.version, args.commit, args.algorithm_version, Path(args.artifacts)
    )
    Path(args.out).write_text(manifest.to_json() + "\n", encoding="utf-8")
    print(f"Wrote {args.out}")
    return 0


def _print_state_and_exit_code(state: TargetState) -> int:
    """Print a target's state word to stdout and return the exit code the
    caller (a GitHub Actions step) should propagate: 0 only for a state
    that is safe to act on programmatically (ABSENT: publish; MATCHING:
    skip), nonzero for a state a job must stop and surface to a human
    (CONFLICTING: never overwrite; LOOKUP_FAILED: never guess).
    """
    print(state.state)
    if state.detail:
        print(state.detail, file=sys.stderr)
    return 0 if state.state in (ABSENT, MATCHING) else 1


def _sha1_file(path: Path) -> str:
    return hashlib.sha1(path.read_bytes()).hexdigest()  # noqa: S324 - matches npm's own dist.shasum


def _cmd_npm_state(args: argparse.Namespace) -> int:
    tarball = Path(args.tarball)
    if tarball.is_symlink() or not tarball.is_file():
        raise ReleaseError(f"Missing or invalid npm release tarball: {tarball.name}")
    local_digest = _sha1_file(tarball)
    state = npm_target_state(args.package, args.version, local_digest)
    return _print_state_and_exit_code(state)


def _cmd_pypi_state(args: argparse.Namespace) -> int:
    dist_dir = Path(args.dist)
    stem = f"{args.package}-{args.version}"
    files = [dist_dir / (stem + suffix) for suffix in ("-py3-none-any.whl", ".tar.gz")]
    if any(not path.is_file() or path.is_symlink() for path in files):
        raise ReleaseError("Missing or invalid Python release archive.")
    local_digests = {path.name: hashlib.sha256(path.read_bytes()).hexdigest() for path in files}
    state = pypi_target_state(args.package, args.version, local_digests)
    return _print_state_and_exit_code(state)


def _cmd_go_state(args: argparse.Namespace) -> int:
    state = go_target_state(args.module_path, args.version, args.commit)
    return _print_state_and_exit_code(state)


def _cmd_root_tag_state(args: argparse.Namespace) -> int:
    version = validate_version(args.version)
    return _print_state_and_exit_code(tag_state(args.remote, f"refs/tags/v{version}", args.commit))


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest="command", required=True)

    check_version_parser = subparsers.add_parser(
        "check-version", help="Validate a requested version against every package manifest."
    )
    check_version_parser.add_argument("requested")
    check_version_parser.set_defaults(func=_cmd_check_version)

    verify_parser = subparsers.add_parser("verify-bundle")
    for argument in ("version", "commit", "directory"):
        verify_parser.add_argument(argument)
    verify_parser.set_defaults(func=_cmd_verify_bundle)

    manifest_parser = subparsers.add_parser(
        "manifest", help="Write release-manifest.json from the built artifacts."
    )
    manifest_parser.add_argument("--version", required=True)
    manifest_parser.add_argument("--commit", required=True)
    manifest_parser.add_argument("--algorithm-version", required=True)
    manifest_parser.add_argument("--artifacts", required=True)
    manifest_parser.add_argument("--out", required=True)
    manifest_parser.set_defaults(func=_cmd_manifest)

    npm_state_parser = subparsers.add_parser(
        "npm-state",
        help="Print the npm registry state for package@version: absent/matching/conflicting/lookup-failed.",
    )
    npm_state_parser.add_argument("--package", required=True)
    npm_state_parser.add_argument("--version", required=True)
    npm_state_parser.add_argument(
        "--tarball", required=True, help="Path to the locally built tarball"
    )
    npm_state_parser.set_defaults(func=_cmd_npm_state)

    pypi_state_parser = subparsers.add_parser(
        "pypi-state", help="Print the PyPI registry state for package==version."
    )
    pypi_state_parser.add_argument("--package", required=True)
    pypi_state_parser.add_argument("--version", required=True)
    pypi_state_parser.add_argument(
        "--dist", required=True, help="Directory containing the built wheel and sdist"
    )
    pypi_state_parser.set_defaults(func=_cmd_pypi_state)

    go_state_parser = subparsers.add_parser(
        "go-state", help="Print the state of the packages/go/v<version> module tag."
    )
    go_state_parser.add_argument("--module-path", required=True)
    go_state_parser.add_argument("--version", required=True)
    go_state_parser.add_argument(
        "--commit", required=True, help="Commit SHA this release is built from"
    )
    go_state_parser.set_defaults(func=_cmd_go_state)

    root = subparsers.add_parser("root-tag-state", help="Verify the release tag's commit.")
    root.add_argument("--remote", default="origin")
    root.add_argument("--version", required=True)
    root.add_argument("--commit", required=True)
    root.set_defaults(func=_cmd_root_tag_state)

    args = parser.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
