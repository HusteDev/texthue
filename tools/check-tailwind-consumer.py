"""Compile CSS in an isolated application using the packed TextHue packages."""

import shutil
import subprocess
import tempfile
from pathlib import Path

from adapter_archives import adapter_archives

ROOT = Path(__file__).resolve().parents[1]


def main():
    npm = shutil.which("npm.cmd") or shutil.which("npm")
    with tempfile.TemporaryDirectory() as tmp:
        app = Path(tmp)
        archives = adapter_archives(npm, "tailwind", app)
        (app / "package.json").write_text('{"private":true,"type":"module"}', encoding="utf-8")
        subprocess.run(
            [
                npm,
                "install",
                "--ignore-scripts",
                "--no-audit",
                "--no-fund",
                *archives,
                "tailwindcss@3.4.17",
                "postcss@8.5.6",
            ],
            cwd=app,
            check=True,
        )
        shutil.copy2(ROOT / "tests/tailwind-consumer.mjs", app)
        shutil.copy2(ROOT / "tests/tailwind-consumer.ts", app)
        subprocess.run(
            [
                "node",
                str(ROOT / "node_modules/typescript/bin/tsc"),
                "--strict",
                "--noEmit",
                "--module",
                "NodeNext",
                "--target",
                "ES2022",
                "tailwind-consumer.ts",
            ],
            cwd=app,
            check=True,
        )
        subprocess.run(["node", "tailwind-consumer.mjs"], cwd=app, check=True)
        print("PASS: packed Tailwind adapter compiled light and dark utilities")


if __name__ == "__main__":
    main()
