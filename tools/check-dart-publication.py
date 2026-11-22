"""Validate the Dart publication without uploading. Account for the required exact pins."""

import argparse
import gzip
import re
import shutil
import subprocess
import sys
import tarfile
import tempfile
from pathlib import Path

PACKAGE = Path(__file__).resolve().parents[1] / "packages/dart"


def check_archive_listing(output):
    """Compare pub's reported archive tree with the intended consumer files."""
    expected = {
        "CHANGELOG.md",
        "LICENSE",
        "README.md",
        "SPECIFICATION.md",
        "THIRD_PARTY_NOTICES.md",
        "pubspec.yaml",
        "example/texthue_example.dart",
    }
    expected.update(
        path.relative_to(PACKAGE).as_posix() for path in (PACKAGE / "lib").rglob("*.dart")
    )
    files = []
    parents = []
    for line in output.splitlines():
        entry = re.fullmatch(r"((?:│   |    )*)[├└]── (.+)", line)
        if entry is None:
            continue
        depth = len(entry[1]) // 4
        if depth > len(parents):
            raise ValueError(f"Invalid pub archive tree depth: {line}")
        parents = parents[:depth]
        leaf = re.fullmatch(r"(.+) \([^)]+\)", entry[2])
        if leaf:
            files.append("/".join([*parents, leaf[1]]))
        else:
            parents.append(entry[2])
    if sorted(files) != sorted(expected):
        raise ValueError(
            f"Unexpected pub archive inventory: {sorted(files)}; expected {sorted(expected)}"
        )
    return sorted(files)


def accepted_pin_warnings(output):
    """Only accept pub's exact-version advisory for the two manifest dependencies."""
    warnings = re.findall(r"^\* (.*)$", output, re.MULTILINE)
    expected = {
        f'Your dependency on "{name}" should allow more than one version. For example:'
        for name in ("crypto", "unorm_dart")
    }
    return (
        len(warnings) == 2
        and set(warnings) == expected
        and output.rstrip().endswith("Package has 2 warnings.")
        and "Package validation found the following 2 potential issues:" in output
        and "Package validation found the following errors:" not in output
    )


def check_consumer(dart, archive):
    """Exercise the public library with no monorepo fixtures or package-local tool state."""
    with tempfile.TemporaryDirectory() as temp:
        root = Path(temp)
        library = root / "library"
        with tarfile.open(archive) as staged:
            staged.extractall(library, filter="data")
        app = root / "consumer"
        app.mkdir()
        (app / "pubspec.yaml").write_text(
            "name: texthue_consumer\nenvironment:\n  sdk: '>=3.5.0 <4.0.0'\n"
            "dependencies:\n  texthue:\n    path: ../library\n",
            encoding="utf-8",
        )
        shutil.copy2(library / "example/texthue_example.dart", app / "main.dart")
        subprocess.run([dart, "pub", "get", "--offline"], cwd=app, check=True)
        output = subprocess.check_output([dart, "run", "main.dart"], cwd=app, text=True)
        if output.strip() != "#5ab95a #ffffff":
            raise ValueError(f"Unexpected standalone consumer output: {output!r}")
        print("PASS: standalone Dart path consumer")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--stage", type=Path, help="Save the verified tar.gz at this new path")
    args = parser.parse_args()
    dart = shutil.which("dart.exe") or shutil.which("dart")
    if not dart:
        raise SystemExit("Dart is required")
    result = subprocess.run(
        [dart, "pub", "publish", "--dry-run"],
        cwd=PACKAGE,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        encoding="utf-8",
        errors="replace",
    )
    print(
        result.stdout.encode(sys.stdout.encoding or "utf-8", errors="backslashreplace").decode(
            sys.stdout.encoding or "utf-8"
        )
    )
    if result.returncode and not (result.returncode == 65 and accepted_pin_warnings(result.stdout)):
        raise SystemExit(result.returncode)
    files = check_archive_listing(result.stdout)
    with tempfile.TemporaryDirectory() as directory:
        archive = Path(directory) / "package.tar.gz"
        with (
            archive.open("wb") as raw,
            gzip.GzipFile(filename="", fileobj=raw, mode="wb", mtime=0) as compressed,
        ):
            with tarfile.open(fileobj=compressed, mode="w|") as staged:
                for name in files:
                    path = PACKAGE / name
                    info = tarfile.TarInfo(name)
                    info.size = path.stat().st_size
                    with path.open("rb") as source:
                        staged.addfile(info, source)
        check_consumer(dart, archive)
        if args.stage:
            with args.stage.open("xb") as output, archive.open("rb") as source:
                shutil.copyfileobj(source, output)


if __name__ == "__main__":
    main()
