"""Feed shared normal- and wide-gamut contrast measurements to native runners."""

import json
from pathlib import Path

CORPUS = Path(__file__).resolve().parents[1] / "conformance"


def emit(model, gamut, text, background, value):
    print(model, gamut, ",".join(map(str, text)), ",".join(map(str, background)), value, sep="\t")


def main():
    for row in json.loads((CORPUS / "apca-srgb-v1.json").read_text()):
        emit("APCA", "SRGB", row[:3], row[3:6], row[6])
    for row in json.loads((CORPUS / "p3-contrast-v1.json").read_text()):
        for model, key in (("WCAG2", "ratio"), ("APCA", "lc")):
            emit(model, "DISPLAY_P3", row["text"], row["background"], row[key])
    pairs = {
        "fill": ("onFill", "fill"),
        "fillHover": ("onFill", "fillHover"),
        "fillActive": ("onFill", "fillActive"),
        "text": ("text", "background"),
        "textOnSubtle": ("text", "subtle"),
        "border": ("border", "background"),
        "strong": ("strong", "background"),
    }
    for case in json.loads((CORPUS / "vectors.json").read_text(encoding="utf-8"))["vectors"]:
        for theme in ("light", "dark"):
            colors = case["expected"][theme]
            for key, (front, back) in pairs.items():
                emit(
                    "WCAG2",
                    "SRGB",
                    colors[front]["rgb"].values(),
                    colors[back]["rgb"].values(),
                    colors["contrast"][key]["ratio"],
                )


if __name__ == "__main__":
    main()
