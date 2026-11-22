"""Compile Kotlin production and test sources, then execute all shared JVM checks."""

import argparse
import os
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--kotlinc", default="kotlinc.bat" if os.name == "nt" else "kotlinc")
    parser.add_argument("--java", default="java")
    args = parser.parse_args()
    sources = sorted((ROOT / "packages/kotlin/src").rglob("*.kt"))
    cache = ROOT / ".cache"
    cache.mkdir(exist_ok=True)
    with tempfile.TemporaryDirectory(dir=cache) as directory:
        jar = Path(directory) / "conformance.jar"
        subprocess.run([args.kotlinc, *sources, "-include-runtime", "-d", jar], check=True)
        for corpus, entry in (
            ("identity", "IdentityTestKt"),
            ("gamut", "ColorMathTestKt"),
            ("contrast", "ContrastTestKt"),
        ):
            rows = subprocess.check_output([sys.executable, ROOT / f"tools/{corpus}-vectors.py"])
            subprocess.run(
                [args.java, "-cp", jar, f"com.hustedev.texthue.{entry}"], input=rows, check=True
            )


if __name__ == "__main__":
    main()
