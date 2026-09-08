"""Verify that every package manifest declares the same release version.

Usage: python tools/check-version.py [EXPECTED]

Checks the root package.json, the npm package.json, the Python pyproject.toml,
and the Python package's ``__version__``. With EXPECTED, also requires that
shared version to equal it. Prints the version on success.
"""

import json
import re
import sys
import tomllib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def versions():
    """Return {label: version} for every manifest that carries the release version."""
    found = {}
    for label, path in (
        ("package.json", "package.json"),
        ("packages/npm/package.json", "packages/npm/package.json"),
    ):
        found[label] = json.loads((ROOT / path).read_text(encoding="utf-8"))["version"]
    pyproject = ROOT / "packages/python/pyproject.toml"
    found["packages/python/pyproject.toml"] = tomllib.loads(pyproject.read_text(encoding="utf-8"))[
        "project"
    ]["version"]
    init = (ROOT / "packages/python/src/texthue/__init__.py").read_text(encoding="utf-8")
    match = re.search(r'^__version__ = "([^"]+)"$', init, re.MULTILINE)
    if not match:
        raise SystemExit("__version__ not found in packages/python/src/texthue/__init__.py")
    found["packages/python/src/texthue/__init__.py"] = match.group(1)
    return found


def main():
    """Compare every manifest version, and the optional expected version, then print it."""
    found = versions()
    distinct = set(found.values())
    if len(distinct) != 1:
        lines = "\n".join(f"  {label}: {version}" for label, version in found.items())
        raise SystemExit("Package versions differ:\n" + lines)
    version = distinct.pop()
    if len(sys.argv) > 1 and sys.argv[1].lstrip("v") != version:
        raise SystemExit(f"Manifests declare {version}, expected {sys.argv[1]}")
    print(version)


if __name__ == "__main__":
    main()
