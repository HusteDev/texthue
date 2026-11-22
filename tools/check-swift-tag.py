"""Resolve the committed Swift library by version using a disposable local Git tag."""

import json
import subprocess
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def main():
    version = json.loads((ROOT / "packages/npm/package.json").read_text())["version"]
    with tempfile.TemporaryDirectory() as temp:
        workspace = Path(temp)
        repository = workspace / "texthue.git"
        subprocess.run(
            [
                "git",
                "clone",
                "--quiet",
                "--bare",
                "--no-tags",
                "--no-local",
                str(ROOT),
                str(repository),
            ],
            check=True,
        )
        commit = subprocess.check_output(
            ["git", "-C", str(repository), "rev-parse", "HEAD"], text=True
        ).strip()
        subprocess.run(["git", "-C", str(repository), "tag", f"v{version}", commit], check=True)
        app = workspace / "consumer"
        sources = app / "Sources/Consumer"
        sources.mkdir(parents=True)
        (app / "Package.swift").write_text(
            f"""// swift-tools-version: 6.0
import PackageDescription
let package = Package(name: "Consumer",
    platforms: [.macOS(.v10_15)],
    dependencies: [.package(url: "{repository.as_uri()}", exact: "{version}")],
    targets: [.executableTarget(name: "Consumer", dependencies: [
        .product(name: "TextHue", package: "texthue")
    ])])
""",
            encoding="utf-8",
        )
        (sources / "main.swift").write_bytes(
            (ROOT / "packages/swift/Examples/Labels/main.swift").read_bytes()
        )
        output = subprocess.check_output(
            ["swift", "run", "-j", "4", "Consumer", "apple"], cwd=app, text=True
        )
        if output.strip() != "apple #5ab95a #ffffff":
            raise ValueError(f"Unexpected tagged Swift consumer output: {output!r}")
        pins = json.loads((app / "Package.resolved").read_text())["pins"]
        [pin] = [entry for entry in pins if entry["identity"] == "texthue"]
        if pin["state"] != {"revision": commit, "version": version}:
            raise ValueError(f"Unexpected SwiftPM pin: {pin!r}")
        print(f"PASS: SwiftPM consumer resolved {version} at {commit}")


if __name__ == "__main__":
    main()
