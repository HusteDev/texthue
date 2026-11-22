"""Exercise every option, fixed ranges, grayscale, and an unattainable contrast target."""

import json

from texthue import TextColorOptions, resolve_text_colors

options: TextColorOptions = {
    "namespace": "workspace:demo",
    "backgrounds": {"light": "#f5f0e8", "dark": "#20242b"},
    "contrastTarget": 7,
    "profiles": {
        "light": {
            "fill": {"lightness": [0.74, 0.84], "chromaScale": [0.08, 0.14]},
            "text": {"lightness": [0.40, 0.52], "chromaScale": [0.10, 0.16]},
        },
        "dark": {
            "fill": {"lightness": [0.38, 0.48], "chromaScale": [0.08, 0.14]},
            "text": {"lightness": [0.74, 0.86], "chromaScale": [0.10, 0.16]},
        },
    },
}
print(json.dumps(resolve_text_colors("project:atlas", options).to_dict(), indent=2))

gray = resolve_text_colors(
    "plain",
    {
        "profiles": {"light": {"fill": {"lightness": [0.75, 0.75], "chromaScale": [0, 0]}}},
    },
)
print("Fixed preferred lightness, grayscale:", gray.light.fill)

impossible = resolve_text_colors(
    "project:atlas",
    {
        "backgrounds": {"light": "#777777"},
        "contrastTarget": 7,
    },
)
status = impossible.light.contrast.text
if not status.meets_target:
    print(
        "Use the returned fallback or change the background/target:",
        impossible.light.text.hex,
        status,
    )
