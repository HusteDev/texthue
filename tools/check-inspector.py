"""Exercise the staged Pages inspector using Playwright and an installed Chromium browser."""

import argparse
import functools
import json
import mimetypes
import runpy
import tempfile
import threading
import xml.etree.ElementTree as ET
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from playwright.sync_api import expect, sync_playwright

ROOT = Path(__file__).resolve().parents[1]


def check_markers(page):
    page.locator("#labels").fill("\n".join(map(str, range(128))))
    toggle = page.get_by_role("checkbox", name="Show identity shapes")
    toggle.check()
    page.get_by_role("button", name="Inspect palette").click()
    expect(page.get_by_role("status")).to_have_text("128 distinct labels")
    shapes = ("circle", "square", "triangle", "diamond", "star", "cross", "pentagon", "hexagon")
    pixels = set()
    for name in shapes:
        glyph = page.get_by_role("img", name=name, exact=True).first
        expect(glyph).to_be_visible()
        pixels.add(glyph.screenshot())
    assert len(pixels) == len(shapes), "Two displayed shapes have identical raster output"
    markers = page.locator("th [role=img]").evaluate_all(
        "(nodes) => nodes.map(n => [n.getAttribute('aria-label'), n.textContent])"
    )
    with page.expect_download() as event:
        page.get_by_role("button", name="Download swatch sheet").click()
    sheet = ET.parse(event.value.path())
    ns = {"svg": "http://www.w3.org/2000/svg"}
    exported = [[title.text, title.tail] for title in sheet.findall(".//svg:text/svg:title", ns)]
    assert exported == markers
    toggle.uncheck()


def exercise(page, url, clipboard):
    page.goto(url)
    status = page.get_by_role("status")
    expect(status).to_have_text("3 distinct labels")
    page.locator("#labels").fill("badge")
    page.locator("#options").fill(
        '{"overrides":{"badge":"#ffffff"},"backgrounds":{"dark":"#000000"}}'
    )
    for theme, ratio in (("light", "1.00:1"), ("dark", "21.00:1")):
        page.locator("#theme").select_option(theme)
        page.get_by_role("button", name="Inspect palette").click()
        expect(page.get_by_role("cell", name=ratio, exact=True)).to_be_visible()
    page.locator("#options").fill('{"gamut":"display-p3","overrides":{"badge":"#ff0000"}}')
    page.get_by_role("button", name="Inspect palette").click()
    chips = page.locator("#results td span[title^='color(display-p3']")
    expect(chips).to_have_count(3)
    for chip in chips.all():
        assert chip.evaluate("""el => {
            const probe = document.createElement('span');
            probe.style.color = el.title;
            document.body.append(probe);
            const expected = getComputedStyle(probe).color;
            probe.remove();
            return expected.startsWith('color(display-p3 ') && getComputedStyle(el).color === expected;
        }""")
    page.goto(url)
    expect(status).to_have_text("3 distinct labels")
    check_markers(page)
    page.locator("#labels").fill("item:33\nitem:633")
    page.locator("#vision").select_option("deutan")
    submit = page.get_by_role("button", name="Inspect palette")
    submit.click()
    expect(status).to_have_text("2 distinct labels")
    swatches = page.locator("tr td:nth-of-type(3)")
    before = swatches.all_text_contents()
    page.get_by_role("checkbox", name="Optimize new placements").check()
    submit.click()
    expect(swatches).not_to_have_text(before)
    expect(status).to_have_text("2 distinct labels")
    assert swatches.all_text_contents() != before
    page.get_by_role("checkbox", name="Optimize new placements").uncheck()
    # Two submissions in one event handler guarantee the first result is still pending.
    retained = page.evaluate("""() => {
            const previous = document.querySelector("#results table");
            const labels = document.querySelector('#labels');
            const form = labels.form;
            labels.value = Array.from({length:250}, (_, i) => 'item:' + i).join(String.fromCharCode(10));
            form.requestSubmit();
            const retained = previous.isConnected;
            labels.value = 'fresh';
            form.requestSubmit();
            return retained && previous.isConnected;
        }""")
    assert retained, "Last completed palette disappeared while replacement was pending"
    expect(status).to_have_text("1 distinct labels")
    expect(page.get_by_text("fresh", exact=True).first).to_be_visible()
    outputs = {}
    for title in ("configuration", "registry", "swatch sheet"):
        with page.expect_download() as event:
            page.get_by_role("button", name=f"Download {title}").click()
        outputs[title] = Path(event.value.path()).read_text(encoding="utf-8")
    assert "fresh" in json.loads(outputs["registry"])["assignments"]
    assert "fresh" in list(ET.fromstring(outputs["swatch sheet"]).itertext())
    for label, field, kind in (
        ("Load configuration file", "#options", "configuration"),
        ("Load registry file", "#registry", "registry"),
    ):
        page.get_by_label(label).set_input_files(
            {
                "name": f"{kind}.json",
                "mimeType": "application/json",
                "buffer": outputs[kind].encode(),
            }
        )
        expect(page.locator(field)).to_have_value(outputs[kind])
        expect(status).to_have_text("1 distinct labels")
    page.get_by_role("button", name="Inspect palette").press("Enter")
    expect(status).to_have_text("1 distinct labels")
    if not clipboard:
        # Exercise the documented manual-copy path without reading the OS clipboard.
        page.evaluate("Object.defineProperty(navigator, 'clipboard', {value: undefined})")
        page.get_by_role("button", name="Copy registry CSS").click()
        field = page.get_by_label("Select and copy registry CSS")
        expect(field).to_be_focused()
        assert "--texthue-fresh-" in field.input_value()
        return
    page.get_by_role("button", name="Copy registry CSS").click()
    expect(status).to_have_text("Registry CSS copied")
    assert "--texthue-fresh-" in page.evaluate("navigator.clipboard.readText()")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("browser")
    args = parser.parse_args()
    with tempfile.TemporaryDirectory() as temp:
        runpy.run_path(str(ROOT / "tools/stage-pages.py"))["stage"](Path(temp) / "texthue")
        mimetypes.add_type("text/javascript", ".mjs")
        handler = functools.partial(SimpleHTTPRequestHandler, directory=temp)
        with ThreadingHTTPServer(("127.0.0.1", 0), handler) as server:
            threading.Thread(target=server.serve_forever, daemon=True).start()
            try:
                with sync_playwright() as playwright:
                    clipboard = args.browser not in ("firefox", "webkit")
                    if clipboard:
                        browser = playwright.chromium.launch(executable_path=args.browser)
                        context = browser.new_context(
                            permissions=["clipboard-read", "clipboard-write"]
                        )
                    else:
                        browser = getattr(playwright, args.browser).launch()
                        context = browser.new_context()
                    exercise(
                        context.new_page(),
                        f"http://127.0.0.1:{server.server_port}/texthue/",
                        clipboard,
                    )
                    browser.close()
            finally:
                server.shutdown()
    copy_method = "clipboard readback" if clipboard else "manual CSS copy"
    print(
        f"PASS: {args.browser} native P3 styles, worker replacement, keyboard replay, downloads and {copy_method}"
    )


if __name__ == "__main__":
    main()
