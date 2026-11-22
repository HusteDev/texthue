"""Verify that every package manifest declares the same release version.

Usage: python tools/check-version.py [EXPECTED]

Reads each package's ``versionFiles`` from tools/packages.json (a JSON
field, a TOML field, or a ``__version__ = "..."`` regex match), requires
they all agree, and, with EXPECTED, that the shared version also equals it.
Prints the version on success. A package with no ``versionFiles`` (Go, whose
release version comes from its Git tag; see docs/RELEASING.md) is skipped.
"""

import json
import re
import sys
import tomllib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def load_packages():
    """Return the package list from tools/packages.json."""
    manifest = json.loads((ROOT / "tools/packages.json").read_text(encoding="utf-8"))
    return manifest["packages"]


def read_version(spec):
    """Read one version value from a versionFiles entry."""
    path = ROOT / spec["path"]
    if spec["kind"] == "json":
        return json.loads(path.read_text(encoding="utf-8"))[spec["field"]]
    if spec["kind"] == "toml":
        document = tomllib.loads(path.read_text(encoding="utf-8"))
        value = document
        for key in spec["field"]:
            value = value[key]
        return value
    if spec["kind"] == "pyRegex":
        match = re.search(spec["pattern"], path.read_text(encoding="utf-8"), re.MULTILINE)
        if not match:
            raise SystemExit(f"{spec['pattern']!r} not found in {spec['path']}")
        return match.group(1)
    raise SystemExit(f"Unknown versionFiles kind: {spec['kind']!r}")


def versions():
    """Return {path: version} for every version file declared by every package."""
    found = {}
    for package in load_packages():
        for spec in package.get("versionFiles", []):
            found[spec["path"]] = read_version(spec)
    return found


def main():
    """Compare every manifest version, and the optional expected version, then print it."""
    from release import ReleaseError, check_version

    if len(sys.argv) > 2:
        raise SystemExit("Usage: python tools/check-version.py [EXPECTED]")
    found = versions()
    if not found:
        raise SystemExit("No versionFiles declared in tools/packages.json")
    requested = sys.argv[1] if len(sys.argv) == 2 else next(iter(found.values()))
    try:
        version = check_version(requested, found)
    except ReleaseError as error:
        raise SystemExit(str(error)) from error
    print(version)


if __name__ == "__main__":
    main()
