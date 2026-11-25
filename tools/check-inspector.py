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
from urllib.parse import urljoin

from playwright.sync_api import expect, sync_playwright

ROOT = Path(__file__).resolve().parents[1]


def check_review_labels(page, labels):
    page.locator("#labels").fill("\n".join(labels))
    for theme in ("light", "dark"):
        page.locator("#theme").select_option(theme)
        for profile in ("normal", "deutan", "protan", "tritan"):
            page.locator("#vision").select_option(profile)
            previous = page.locator("table").first.element_handle()
            page.get_by_role("button", name="Generate Palette").click()
            page.wait_for_function("table => !table.isConnected", arg=previous)
            previous.dispose()
            expect(page.get_by_role("status")).to_have_text(f"{len(labels)} distinct labels")
            assigned = page.locator("tr td:nth-of-type(2) span").evaluate_all(
                "(chips) => chips.map(chip => getComputedStyle(chip).color)"
            )
            assert len(set(assigned)) == len(labels), (theme, profile, assigned)


def check_markers(page):
    page.locator("#labels").fill("\n".join(map(str, range(128))))
    toggle = page.get_by_role("checkbox", name="Show identity shapes")
    toggle.check()
    page.get_by_role("button", name="Generate Palette").click()
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
    page.goto(urljoin(url, "site/?preset=mono&brand=studio&vision=deutan"))
    expect(page.get_by_role("status")).to_have_text("6 distinct labels")
    options = json.loads(page.locator("#options").input_value())
    assert options["preset"] == "mono" and len(options["palette"]) == 4
    expect(page.locator("#vision")).to_have_value("deutan")
    page.locator("#labels").fill("Mira #1\n研究 & QA")
    page.locator("#theme").select_option("dark")
    page.locator("#markers").check()
    page.get_by_role("button", name="Generate Palette").click()
    expect(page.get_by_role("status")).to_have_text("2 distinct labels")
    swatches = page.locator("td").all_text_contents()
    page.get_by_role("button", name="Copy link to this palette").click()
    if clipboard:
        expect(page.get_by_role("status")).to_have_text("Palette link copied")
        shared = page.evaluate("navigator.clipboard.readText()")
    else:
        manual = page.get_by_label("Select and copy palette link")
        if not manual.count():
            page.evaluate("Object.defineProperty(navigator, 'clipboard', {value: undefined, configurable: true})")
            page.get_by_role("button", name="Copy link to this palette").click()
        shared = manual.input_value()
    page.goto("about:blank")
    page.goto(shared)
    expect(page.get_by_role("status")).to_have_text("2 distinct labels")
    expect(page.locator("#theme")).to_have_value("dark")
    expect(page.locator("#markers")).to_be_checked()
    expect(page.locator("#vision")).to_have_value("deutan")
    assert page.locator("td").all_text_contents() == swatches
    page.goto(url)
    status = page.get_by_role("status")
    expect(status).to_have_text("3 distinct labels")
    for term in ("Role defaults", "Brand example", "Vision profile", "Registry"):
        button = page.get_by_role("button", name=f"Help for {term}", exact=True)
        button.focus()
        button.press("Enter")
        dialog = page.get_by_role("dialog", name=term)
        expect(dialog).to_be_visible()
        assert dialog.evaluate("el => el.matches(':modal')")
        page.keyboard.press("Escape")
        expect(button).to_be_focused()
    for example, count in (("duo", 2), ("studio", 4), ("market", 8), ("none", 0)):
        page.locator("#brand-example").select_option(example)
        expect(status).to_have_text("3 distinct labels")
        assert len(json.loads(page.locator("#options").input_value()).get("palette", [])) == count
    for cell in page.locator("table tr").nth(1).locator("td").all()[:3]:
        disclosure = cell.locator("details").last
        assert not disclosure.evaluate("el => el.open")
        disclosure.locator("summary").click()
        value = json.loads(disclosure.locator("pre").inner_text())
        for theme in ("light", "dark"):
            assert value[theme]["fill"]["hex"].startswith("#")
    check_review_labels(
        page,
        (
            "bug",
            "documentation",
            "duplicate",
            "enhancement",
            "good first issue",
            "help wanted",
            "invalid",
            "question",
            "wontfix",
        ),
    )
    check_review_labels(
        page,
        (
            "Alice",
            "Bob",
            "Carol",
            "Dave",
            "Eve",
            "Frank",
            "Grace",
            "Heidi",
            "Ivan",
            "Judy",
            "Mallory",
            "Oscar",
        ),
    )
    page.goto(url)
    expect(status).to_have_text("3 distinct labels")
    page.locator("#labels").fill("badge")
    page.locator("#options").fill(
        '{"overrides":{"badge":"#ffffff"},"backgrounds":{"dark":"#000000"}}'
    )
    for theme, ratio in (("light", "1.00:1"), ("dark", "21.00:1")):
        page.locator("#theme").select_option(theme)
        page.get_by_role("button", name="Generate Palette").click()
        expect(page.get_by_role("cell", name=ratio, exact=True)).to_be_visible()
    expect(
        page.get_by_role("columnheader", name="Registry fill / background (Display-P3)")
    ).to_have_count(0)
    page.get_by_role("button", name="Use this palette as comparison baseline").click()
    page.locator("#options").fill('{"gamut":"display-p3","backgrounds":{"dark":"#000000"}}')
    page.get_by_role("button", name="Generate Palette").click()
    expect(
        page.get_by_role("columnheader", name="Registry fill / background (Display-P3)")
    ).to_be_visible()
    expect(page.get_by_role("cell", name="3.22:1", exact=True)).to_be_visible()
    expect(page.get_by_role("cell", name="3.21:1", exact=True)).to_be_visible()
    chips = page.locator("#results td span[title^='color(display-p3']")
    expect(chips).to_have_count(3)
    comparison = page.get_by_text("Changes from comparison baseline", exact=True)
    comparison.click()
    report = json.loads(comparison.locator("..").locator("pre").inner_text())
    change = next(c for c in report["colors"] if c["theme"] == "dark" and c["role"] == "fill")
    assert change["before"] == "#ffffff" and change["afterP3"] == chips.last.get_attribute("title")
    for chip in chips.all():
        assert chip.evaluate("""el => {
            const probe = document.createElement('span');
            probe.style.color = el.title;
            document.body.append(probe);
            const expected = getComputedStyle(probe).color;
            probe.remove();
            return expected.startsWith('color(display-p3 ') && getComputedStyle(el).color === expected;
        }""")
    if clipboard:
        page.get_by_role("button", name="Copy registry CSS").click()
        expect(status).to_have_text("Registry CSS copied")
        assert chips.last.evaluate("""async el => {
            const sheet = document.createElement('style');
            sheet.textContent = await navigator.clipboard.readText();
            document.head.append(sheet);
            const key = [...sheet.sheet.cssRules[0].style].find(name => name.endsWith('-fill'));
            const actual = getComputedStyle(document.documentElement).getPropertyValue(key).trim();
            sheet.remove();
            return actual === el.title;
        }""")
    page.get_by_role("button", name="Clear comparison baseline").click()
    expect(comparison).to_have_count(0)
    page.goto(url)
    expect(status).to_have_text("3 distinct labels")
    check_markers(page)
    page.locator("#labels").fill("item:33\nitem:633")
    page.locator("#vision").select_option("deutan")
    submit = page.get_by_role("button", name="Generate Palette")
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
        page.get_by_label(label, exact=True).set_input_files(
            {
                "name": f"{kind}.json",
                "mimeType": "application/json",
                "buffer": outputs[kind].encode(),
            }
        )
        expect(page.locator(field)).to_have_value(outputs[kind])
        expect(status).to_have_text("1 distinct labels")
    page.get_by_role("button", name="Generate Palette").press("Enter")
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
