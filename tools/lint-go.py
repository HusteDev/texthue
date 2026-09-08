"""Lint the Go module: gofmt, go vet, and golangci-lint.

Runs from any working directory. golangci-lint must be on PATH; the
pre-commit hook installs it into an isolated Go environment automatically.
The module directory comes from the "go" package's "dir" in
tools/packages.json.
"""

import json
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def go_module_dir():
    """Return the directory of the manifest package whose language is "go"."""
    manifest = json.loads((ROOT / "tools/packages.json").read_text(encoding="utf-8"))
    for package in manifest["packages"]:
        if package["language"] == "go":
            return ROOT / package["dir"]
    raise SystemExit('No package with "language": "go" in tools/packages.json')


MODULE = go_module_dir()


def run(command):
    """Run a command inside the Go module and return its stdout, exiting on failure."""
    result = subprocess.run(command, cwd=MODULE, text=True, capture_output=True)
    if result.returncode:
        sys.stdout.write(result.stdout)
        sys.stderr.write(result.stderr)
        raise SystemExit(f"FAILED: {' '.join(command)}")
    return result.stdout


def main():
    """Run every Go check and exit nonzero on the first failure."""
    if not shutil.which("go"):
        raise SystemExit("Go is required on PATH.")
    unformatted = run(["gofmt", "-l", "."]).strip()
    if unformatted:
        raise SystemExit("Go files need gofmt:\n" + unformatted)
    run(["go", "vet", "./..."])
    if not shutil.which("golangci-lint"):
        raise SystemExit("golangci-lint is required on PATH.")
    run(["golangci-lint", "run", "./..."])
    print("Go lint passed.")


if __name__ == "__main__":
    main()
