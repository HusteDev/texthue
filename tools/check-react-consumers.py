"""Install the core and adapter archives in clean React 18 and 19 client applications."""

import json
import shutil
import subprocess
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def main():
    npm = shutil.which("npm.cmd") or shutil.which("npm")
    with tempfile.TemporaryDirectory() as tmp:
        artifacts = Path(tmp)
        archives = []
        for package in ("npm", "react"):
            packed = subprocess.check_output(
                [npm, "pack", "--json", "--pack-destination", tmp],
                cwd=ROOT / "packages" / package,
                text=True,
            )
            archives.append(str(artifacts / json.loads(packed)[0]["filename"]))
        for version in ("18.2.0", "19.3.1"):
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
                    "jsdom@26.1.0",
                ],
                cwd=app,
                check=True,
            )
            shutil.copy2(ROOT / "tests/react-consumer.mjs", app)
            subprocess.run(["node", "react-consumer.mjs"], cwd=app, check=True)
            print(f"PASS: packed React {version} consumer mount, update and unmount", flush=True)


if __name__ == "__main__":
    main()
