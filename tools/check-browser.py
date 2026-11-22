"""Run the renderer's real CSS/pixel checks in an installed Chromium browser."""

import argparse
import functools
import shutil
import subprocess
import tempfile
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("browser", help="Path or command name of a Chromium browser")
    browser = parser.parse_args().browser
    with tempfile.TemporaryDirectory() as directory:
        base = Path(directory)
        site = base / "site"
        shutil.copytree(ROOT / "packages/npm/dist", site / "dist")
        shutil.copy(ROOT / "tests/browser-rendering.html", site / "index.html")
        shutil.copy(ROOT / "conformance/composite-v1.json", site)
        handler = functools.partial(SimpleHTTPRequestHandler, directory=site)
        with ThreadingHTTPServer(("127.0.0.1", 0), handler) as server:
            threading.Thread(target=server.serve_forever, daemon=True).start()
            try:
                run = subprocess.run(
                    [
                        browser,
                        "--headless",
                        "--disable-extensions",
                        "--no-first-run",
                        f"--user-data-dir={base / 'profile'}",
                        "--dump-dom",
                        "--virtual-time-budget=10000",
                        f"http://127.0.0.1:{server.server_port}/",
                    ],
                    capture_output=True,
                    timeout=60,
                    check=True,
                )
            finally:
                server.shutdown()
        if b'<output id="result">PASS</output>' not in run.stdout:
            raise SystemExit(run.stdout.decode(errors="replace").split("<script")[0])
        print("PASS: Chromium linear-sRGB composite pixels, CSS fallback and native P3 bytes")


if __name__ == "__main__":
    main()
