"""Copy shared documents and fixtures into each package directory.

The root SPECIFICATION.md, LICENSE, and THIRD_PARTY_NOTICES.md are the
canonical copies for every package; some packages additionally mirror other
root or package files (see ``extraSyncTargets`` in tools/packages.json), such
as the Python README under ``texthue/_docs/`` so it ships in the wheel, and
the conformance vectors mirrored into the Go module's testdata.

The set of copies is driven by tools/packages.json so that adding a new
package there is enough to have its shared files synced and checked; this
script has no per-language special-casing itself.

Run without arguments to refresh the copies, or with ``--check`` to fail if
any copy is stale.
"""

import argparse
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def load_packages():
    """Return the package list from tools/packages.json."""
    manifest = json.loads((ROOT / "tools/packages.json").read_text(encoding="utf-8"))
    return manifest["packages"]


def resolve_source(spec, package_dir):
    """Resolve an ``extraSyncTargets`` source spec like ``root:X`` or ``package:X`` to an absolute path."""
    kind, _, name = spec.partition(":")
    if kind == "root":
        return ROOT / name
    if kind == "package":
        return package_dir / name
    raise SystemExit(f"Unknown sync source kind: {spec!r}")


def build_pairs(packages):
    """Build the (source, destination) copy pairs described by the manifest."""
    pairs = []
    for package in packages:
        package_dir = ROOT / package["dir"]
        for name in package.get("sharedFiles", []):
            pairs.append((ROOT / name, package_dir / name))
        for extra in package.get("extraSyncTargets", []):
            pairs.append(
                (resolve_source(extra["source"], package_dir), package_dir / extra["dest"])
            )
    return pairs


def main():
    """Build the source/destination pairs, then copy or verify them."""
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true", help="Verify without writing")
    args = parser.parse_args()
    pairs = build_pairs(load_packages())
    failed = []
    for source, destination in pairs:
        expected = source.read_bytes()
        if args.check:
            if not destination.exists() or destination.read_bytes() != expected:
                failed.append(str(destination.relative_to(ROOT)))
        else:
            destination.parent.mkdir(parents=True, exist_ok=True)
            destination.write_bytes(expected)
    if failed:
        raise SystemExit("Shared copies are stale: " + ", ".join(failed))
    print(f"{'Verified' if args.check else 'Updated'} {len(pairs)} shared package files.")


if __name__ == "__main__":
    main()
