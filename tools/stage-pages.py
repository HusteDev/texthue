"""Stage the static palette inspector for hosting under any repository prefix."""

import argparse
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def stage(destination):
    # Require a fresh destination so a previous build cannot leak unrelated files.
    destination.mkdir(parents=True, exist_ok=False)
    shutil.copytree(ROOT / "site", destination / "site")
    runtime = destination / "packages/npm/dist"
    runtime.mkdir(parents=True)
    compiled = ROOT / "packages/npm/dist"
    for entry in ("index.js", "diagnostics.js"):
        if not (compiled / entry).is_file():
            raise FileNotFoundError(f"Run npm run build before staging: missing {entry}")
    for module in compiled.glob("*.js"):
        shutil.copy2(module, runtime / module.name)
    (destination / "index.html").write_text(
        '<!doctype html><html lang="en"><meta charset="utf-8">'
        '<title>TextHue palette inspector</title><meta http-equiv="refresh" content="0;url=site/">'
        '<a href="site/">Open the TextHue palette inspector</a></html>\n',
        encoding="utf-8",
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("destination", type=Path)
    stage(parser.parse_args().destination)
