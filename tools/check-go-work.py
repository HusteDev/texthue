"""Count renderer function entries using Go's standard count-mode coverage profiles."""

import json
import re
import subprocess
import tempfile
from pathlib import Path

GO = Path(__file__).resolve().parents[1] / "packages/go"


def entry(file, declaration):
    lines = (GO / file).read_text(encoding="utf-8").splitlines()
    (number,) = [i for i, line in enumerate(lines, 1) if line.startswith(declaration)]
    return file, number


def main():
    sites = {
        "fits": entry("color.go", "func fitIn("),
        "cusps": entry("color.go", "func cuspIn("),
        "hashes": entry("resolve.go", "func (r *Resolver) digest("),
    }
    with tempfile.TemporaryDirectory() as temp:
        profile = Path(temp) / "work.cover"
        for name, fit_limit in (
            ("default", 1600),
            ("aaa", 5732),
            ("maximum", 12725),
            ("gray", 2868),
            ("impossible", 11452),
        ):
            subprocess.run(
                [
                    "go",
                    "test",
                    "-count=1",
                    "-run",
                    f"^TestContrastWorkCorpus$/{name}$",
                    "-covermode=count",
                    f"-coverprofile={profile}",
                    ".",
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
            counts = {key: blocks[site] for key, site in sites.items()}
            print(json.dumps({"scenario": name, **counts}), flush=True)
            if not (
                0 < counts["fits"] <= fit_limit
                and 0 < counts["cusps"] <= 1600
                and counts["hashes"] == 100
            ):
                raise SystemExit(f"Go renderer work outside budget for {name}")


if __name__ == "__main__":
    main()
