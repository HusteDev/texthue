"""Build and test a Rust distribution, then stage its original archive bytes."""

import argparse
import json
import shutil
import subprocess
import tomllib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CRATE = ROOT / "packages/rust"


def cargo(*args):
    return subprocess.check_output(["cargo", *args], cwd=CRATE, text=True, encoding="utf-8")


def stage(destination):
    package = tomllib.loads((CRATE / "Cargo.toml").read_text(encoding="utf-8"))["package"]
    stem = f"{package['name']}-{package['version']}"
    metadata = json.loads(cargo("metadata", "--format-version", "1", "--no-deps", "--locked"))
    directory = Path(metadata["target_directory"]) / "package"
    cargo("package", "--locked")
    manifest = str(directory / stem / "Cargo.toml")
    cargo("test", "--manifest-path", manifest, "--locked")
    output = cargo("run", "--manifest-path", manifest, "--locked", "--example", "labels")
    if output.strip() != "#5ab95a #ffffff":
        raise ValueError(f"Unexpected packaged Rust consumer output: {output!r}")
    archive = directory / f"{stem}.crate"
    destination.mkdir(parents=True, exist_ok=True)
    staged = destination / archive.name
    if staged.exists():
        if staged.read_bytes() != archive.read_bytes():
            raise ValueError(f"Conflicting staged crate: {staged}")
    else:
        shutil.copyfile(archive, staged)
    return staged


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("destination", type=Path)
    print(stage(parser.parse_args().destination))
