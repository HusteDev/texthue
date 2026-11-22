"""Count renderer function entries using Go's standard count-mode coverage profiles."""

import json
import os
import re
import subprocess
import tempfile
from pathlib import Path

GO = Path(__file__).resolve().parents[1] / "packages/go"


def entry(file, declaration):
    lines = (GO / file).read_text(encoding="utf-8").splitlines()
    (number,) = [i for i, line in enumerate(lines, 1) if line.startswith(declaration)]
    return file, number


def measure(binary, profile, sites, test):
    subprocess.run(
        [
            binary,
            f"-test.run={test}",
            f"-test.coverprofile={profile}",
        ],
        cwd=GO,
        check=True,
    )
    blocks = {}
    for line in profile.read_text().splitlines()[1:]:
        match = re.fullmatch(r".*/([^/:]+):(\d+)\.\d+,\d+\.\d+ \d+ (\d+)", line)
        if match:
            file, start, count = match.groups()
            blocks.setdefault((file, int(start)), int(count))
    return {key: blocks[site] for key, site in sites.items()}


def main():
    sites = {
        "fits": entry("color.go", "func fitIn("),
        "cusps": entry("color.go", "func cuspIn("),
        "hashes": entry("resolve.go", "func (r *Resolver) digest("),
    }
    with tempfile.TemporaryDirectory() as temp:
        profile = Path(temp) / "work.cover"
        binary = Path(temp) / ("work.test.exe" if os.name == "nt" else "work.test")
        subprocess.run(
            ["go", "test", "-c", "-covermode=count", "-o", binary, "."], cwd=GO, check=True
        )
        for name, fit_limit in (
            ("default", 1600),
            ("aaa", 5732),
            ("maximum", 12725),
            ("gray", 2868),
            ("impossible", 11452),
        ):
            counts = measure(binary, profile, sites, f"^TestContrastWorkCorpus$/{name}$")
            print(json.dumps({"scenario": name, **counts}), flush=True)
            if not (
                0 < counts["fits"] <= fit_limit
                and 0 < counts["cusps"] <= 1600
                and counts["hashes"] == 100
            ):
                raise SystemExit(f"Go renderer work outside budget for {name}")

        sites["formats"] = entry("color.go", "func formats(")
        baseline = measure(binary, profile, sites, "^TestHexWorkCorpus$/background$")
        if any(baseline[key] for key in ("fits", "cusps", "hashes")):
            raise SystemExit(f"Background lookup performed identity or tone work: {baseline}")
        for role, tones in (("fill", 1), ("fillHover", 2), ("text", 2)):
            counts = measure(binary, profile, sites, f"^TestHexWorkCorpus$/{role}$")
            print(json.dumps({"hexRole": role, **counts}), flush=True)
            if (
                counts["hashes"] != 100
                or counts["cusps"] != 100 * tones
                or counts["formats"] != baseline["formats"]
            ):
                raise SystemExit(f"Go hex lookup performed unexpected work for {role}")


if __name__ == "__main__":
    main()
