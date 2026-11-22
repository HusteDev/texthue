"""Regenerate manifest-owned sections of repository tooling configuration."""

import argparse
import json
import re
import runpy
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SYNC = runpy.run_path(str(ROOT / "tools/sync-shared.py"))


def path_pattern(paths):
    return "^(" + "|".join(re.escape(path) for path in sorted(set(paths))) + ")$"


def replace_section(text, pattern, value):
    updated, count = re.subn(pattern, lambda _: value, text, flags=re.MULTILINE)
    if count != 1:
        raise ValueError(f"Expected one configuration section matching {pattern}")
    return updated


def generated(packages):
    dirs = {p["id"]: p["dir"] for p in packages}
    pairs = SYNC["build_pairs"](packages)
    shared = {p.relative_to(ROOT).as_posix() for pair in pairs for p in pair}
    versions = {f["path"] for p in packages for f in p["versionFiles"]}
    manifest = "tools/packages.json"
    path = ROOT / ".pre-commit-config.yaml"
    config = path.read_text(encoding="utf-8")
    hooks = {
        "tsc": "^" + re.escape(dirs["npm"]) + r"/(src/.*\.ts|tsconfig\.json)$",
        "go-lint": "^" + re.escape(dirs["go"]) + "/",
        "shared-files": path_pattern(shared | {manifest}),
        "package-versions": path_pattern(versions | {manifest}),
    }
    for hook, pattern in hooks.items():
        start = config.index(f"      - id: {hook}\n")
        end = config.find("\n      - id:", start + 1)
        end = len(config) if end == -1 else end
        block = replace_section(
            config[start:end], r"^        files: .*", "        files: " + pattern
        )
        config = config[:start] + block + config[end:]
    yield path, config

    path = ROOT / "codecov.yml"
    flags = ["flags:"]
    for p in packages:
        if "coverageFlag" in p:
            directory = p["dir"] + ("/src/" if p["language"] in ("javascript", "python") else "/")
            flags.extend([f"  {p['coverageFlag']}:", "    paths:", f"      - {directory}"])
    yield path, replace_section(
        path.read_text(encoding="utf-8"), r"^flags:\n[^\n]*(?:\n [^\n]*)*", "\n".join(flags)
    )

    path = ROOT / "biome.json"
    config = path.read_text(encoding="utf-8")
    vectors = sorted(
        {
            p.relative_to(ROOT).as_posix()
            for pair in pairs
            if pair[0] == ROOT / "conformance/vectors.json"
            for p in pair
        }
    )
    lines = ",\n".join("      " + json.dumps("!" + name) for name in vectors)
    yield path, replace_section(
        config, r'^      "!conformance/vectors\.json"[^\]]*?(?=\n    \])', lines
    )

    path = ROOT / ".github/dependabot.yml"
    updates = [("github-actions", "/"), ("npm", "/"), ("pip", "/")]
    ecosystems = {
        "go": "gomod",
        "rust": "cargo",
        "kotlin": "gradle",
        "dart": "pub",
        "swift": "swift",
        "csharp": "nuget",
    }
    for p in packages:
        if p["language"] in ecosystems:
            updates.append((ecosystems[p["language"]], "/" + p["dir"]))
    updates.append(("swift", "/"))
    blocks = [
        f"  - package-ecosystem: {eco}\n    directory: {directory}\n    schedule:\n      interval: weekly\n    cooldown:\n      default-days: 7"
        for eco, directory in dict.fromkeys(updates)
    ]
    yield path, "version: 2\nupdates:\n" + "\n".join(blocks) + "\n"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    stale = []
    for path, expected in generated(SYNC["load_packages"]()):
        if path.read_text(encoding="utf-8") != expected:
            stale.append(path.relative_to(ROOT).as_posix())
            if not args.check:
                path.write_text(expected, encoding="utf-8")
    if args.check and stale:
        raise SystemExit("Run python tools/render-config.py to update " + ", ".join(stale))


if __name__ == "__main__":
    main()
