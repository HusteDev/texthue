"""Emit shared gamut-fitting vectors as tab-separated input for native test runners."""

import json
from pathlib import Path

CORPUS = Path(__file__).resolve().parents[1] / "conformance"


def main():
    for row in json.loads((CORPUS / "p3-fit-v1.json").read_text()):
        print(row["l"], row["c"], row["h"], "DISPLAY_P3", ",".join(map(str, row["rgb"])), sep="\t")
    for case in json.loads((CORPUS / "renderer-v1.json").read_text())["vectors"]:
        for theme in case["themes"].values():
            color = theme["color"]
            if "trace" not in color:
                continue
            wide = "p3" in color
            rgb = [round(v * 255) for v in color["p3"].values()] if wide else color["rgb"].values()
            repaired = color["trace"]["repaired"]
            print(
                repaired["l"],
                repaired["c"],
                repaired["h"],
                "DISPLAY_P3" if wide else "SRGB",
                ",".join(map(str, rgb)),
                color["trace"]["fitted"]["c"],
                sep="\t",
            )


if __name__ == "__main__":
    main()
