"""Copy shared documents and fixtures into each package directory.

The root SPECIFICATION.md, LICENSE, and THIRD_PARTY_NOTICES.md are the
canonical copies for every package; the Python README is additionally
mirrored under ``texthue/_docs/`` so it ships in the wheel; and the
conformance vectors are mirrored into the Go module's testdata.
Run without arguments to refresh the copies, or with ``--check`` to fail if
any copy is stale.
"""

import argparse
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def main():
    """Build the source/destination pairs, then copy or verify them."""
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true", help="Verify without writing")
    args = parser.parse_args()
    pairs = [
        (ROOT / name, ROOT / "packages" / library / name)
        for library in ("npm", "python", "go")
        for name in ("SPECIFICATION.md", "LICENSE", "THIRD_PARTY_NOTICES.md")
    ]
    pairs.append((ROOT / "conformance/vectors.json", ROOT / "packages/go/testdata/vectors.json"))
    python_root = ROOT / "packages/python"
    for name in ("README.md", "SPECIFICATION.md", "LICENSE", "THIRD_PARTY_NOTICES.md"):
        source = python_root / name if name == "README.md" else ROOT / name
        pairs.append((source, python_root / "src/texthue/_docs" / name))
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
