"""Install the core and adapter archives in clean React 18 and 19 client applications."""

import shutil
import subprocess
import tempfile
from pathlib import Path

from adapter_archives import adapter_archives

ROOT = Path(__file__).resolve().parents[1]


def main():
    npm = shutil.which("npm.cmd") or shutil.which("npm")
    with tempfile.TemporaryDirectory() as tmp:
        artifacts = Path(tmp)
        archives = adapter_archives(npm, "react", artifacts)
        for version, types in (("18.2.0", "18.3.12"), ("19.3.1", "19.0.12")):
            app = artifacts / version
            app.mkdir()
            (app / "package.json").write_text('{"private":true,"type":"module"}', encoding="utf-8")
            subprocess.run(
                [
                    npm,
                    "install",
                    "--ignore-scripts",
                    "--no-audit",
                    "--no-fund",
                    *archives,
                    f"react@{version}",
                    f"react-dom@{version}",
                    f"@types/react@{types}",
                    "jsdom@26.1.0",
                ],
                cwd=app,
                check=True,
            )
            shutil.copy2(ROOT / "tests/react-consumer.mjs", app)
            shutil.copy2(ROOT / "tests/react-consumer.tsx", app)
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
                    "--jsx",
                    "react-jsx",
                    "react-consumer.tsx",
                ],
                cwd=app,
                check=True,
            )
            subprocess.run(["node", "react-consumer.mjs"], cwd=app, check=True)
            print(f"PASS: packed React {version} consumer mount, update and unmount", flush=True)


if __name__ == "__main__":
    main()
