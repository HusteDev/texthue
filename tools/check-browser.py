"""Run the renderer's real CSS/pixel checks in an installed Chromium browser."""

import argparse
import contextlib
import functools
import shutil
import subprocess
import tarfile
import tempfile
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("browser", help="Chromium executable, or firefox/webkit via Playwright")
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument(
        "--css-only",
        action="store_true",
        help="Check sRGB pixels and CSS selection without native P3 readback",
    )
    mode.add_argument(
        "--wasm-package", type=Path, help="Test this npm tarball instead of the CSS renderer"
    )
    args = parser.parse_args()
    with tempfile.TemporaryDirectory() as directory:
        base = Path(directory)
        site = base / "site"
        if args.wasm_package:
            site.mkdir()
            with tarfile.open(args.wasm_package, "r:gz") as archive:
                archive.extractall(site, filter="data")
            shutil.copy(ROOT / "tests/browser-wasm.html", site / "index.html")
            shutil.copy(ROOT / "conformance/vectors.json", site)
        else:
            shutil.copytree(ROOT / "packages/npm/dist", site / "dist")
            shutil.copy(ROOT / "tests/browser-rendering.html", site / "index.html")
            shutil.copy(ROOT / "conformance/composite-v1.json", site)
        handler = functools.partial(SimpleHTTPRequestHandler, directory=site)
        with ThreadingHTTPServer(("127.0.0.1", 0), handler) as server:
            threading.Thread(target=server.serve_forever, daemon=True).start()
            try:
                url = f"http://127.0.0.1:{server.server_port}/"
                if args.css_only:
                    url += "?css-only"
                if args.browser in ("firefox", "webkit"):
                    from playwright.sync_api import sync_playwright

                    with sync_playwright() as playwright:
                        engine = getattr(playwright, args.browser)
                        with contextlib.closing(engine.launch()) as browser:
                            page = browser.new_page()
                            page.goto(url)
                            page.wait_for_function(
                                "document.querySelector('#result').textContent !== 'pending'"
                            )
                            result = page.locator("#result").inner_text()
                            if result != "PASS":
                                raise SystemExit(f"{args.browser} {browser.version}: {result}")
                            print(f"PASS: {args.browser} {browser.version}")
                    return
                run = subprocess.run(
                    [
                        args.browser,
                        "--headless",
                        "--disable-extensions",
                        "--no-first-run",
                        f"--user-data-dir={base / 'profile'}",
                        "--dump-dom",
                        "--virtual-time-budget=10000",
                        url,
                    ],
                    capture_output=True,
                    timeout=60,
                    check=True,
                )
            finally:
                server.shutdown()
        if b'<output id="result">PASS</output>' not in run.stdout:
            raise SystemExit(run.stdout.decode(errors="replace").split("<script")[0])
        if args.wasm_package:
            print("PASS: Chromium loaded the npm archive and matched 400 WebAssembly role colors")
            return
        print(
            "PASS: Chromium linear-sRGB pixels and CSS selection"
            + ("" if args.css_only else ", including native P3 bytes")
        )


if __name__ == "__main__":
    main()
