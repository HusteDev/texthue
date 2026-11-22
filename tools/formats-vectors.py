"""Feed the frozen sRGB role renditions to native formatting tests."""

import json
from pathlib import Path


def main():
    path = Path(__file__).resolve().parents[1] / "conformance/vectors.json"
    for case in json.loads(path.read_text(encoding="utf-8"))["vectors"]:
        for theme in ("light", "dark"):
            for role, color in case["expected"][theme].items():
                if role == "contrast":
                    continue
                print(
                    role,
                    color["hex"],
                    *color["rgb"].values(),
                    *color["hsl"].values(),
                    *color["oklch"].values(),
                    sep="\t",
                )


if __name__ == "__main__":
    main()
