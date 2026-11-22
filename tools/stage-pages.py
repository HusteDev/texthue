"""Stage the static palette inspector for hosting under any repository prefix."""

import argparse
import functools
import mimetypes
import shutil
import tempfile
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
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
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("destination", type=Path, nargs="?")
    mode.add_argument("--serve", action="store_true", help="Preview the staged site on loopback")
    args = parser.parse_args()
    if args.serve:
        with tempfile.TemporaryDirectory() as temp:
            site = Path(temp) / "texthue"
            stage(site)
            mimetypes.add_type("text/javascript", ".mjs")
            handler = functools.partial(SimpleHTTPRequestHandler, directory=site)
            with ThreadingHTTPServer(("127.0.0.1", 8000), handler) as server:
                print("Palette inspector: http://127.0.0.1:8000/site/", flush=True)
                try:
                    server.serve_forever()
                except KeyboardInterrupt:
                    pass
    else:
        stage(args.destination)
