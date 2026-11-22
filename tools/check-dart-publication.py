"""Validate the Dart publication without uploading. Account for the required exact pins."""

import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

PACKAGE = Path(__file__).resolve().parents[1] / "packages/dart"


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


def check_consumer(dart):
    """Exercise the public library with no monorepo fixtures or package-local tool state."""
    with tempfile.TemporaryDirectory() as temp:
        root = Path(temp)
        library = root / "library"
        shutil.copytree(PACKAGE / "lib", library / "lib")
        shutil.copy2(PACKAGE / "pubspec.yaml", library)
        app = root / "consumer"
        app.mkdir()
        (app / "pubspec.yaml").write_text(
            "name: texthue_consumer\nenvironment:\n  sdk: '>=3.5.0 <4.0.0'\n"
            "dependencies:\n  texthue:\n    path: ../library\n",
            encoding="utf-8",
        )
        shutil.copy2(PACKAGE / "example/texthue_example.dart", app / "main.dart")
        subprocess.run([dart, "pub", "get", "--offline"], cwd=app, check=True)
        output = subprocess.check_output([dart, "run", "main.dart"], cwd=app, text=True)
        if output.strip() != "#5ab95a #ffffff":
            raise ValueError(f"Unexpected standalone consumer output: {output!r}")
        print("PASS: standalone Dart path consumer")


def main():
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
    check_consumer(dart)


if __name__ == "__main__":
    main()
