# TextHue for Python

`texthue` maps exact text to repeatable light/dark colors with Hex, RGB, HSL, and OKLCH output. This is a synchronous native Python implementation with no runtime dependencies. It supports Python 3.11+ and includes frozen dataclass results and typed option mappings and a `py.typed` marker. Its results match the JavaScript/TypeScript and Go libraries.

```bash
python -m pip install texthue
```

## Basic usage

```python
from texthue import Resolver

resolver = Resolver(namespace="projects", contrast_target=7)
colors = resolver.resolve("research")
print(colors.light.fill.hex, colors.light.on_fill.hex)
print(colors.light.contrast.fill.meets_target)
document = colors.to_dict()
assert document["light"]["onFill"]["hex"] == colors.light.on_fill.hex
```

## API, types, and serialization

`resolve_text_colors(text: str, options: TextColorOptions)` returns a frozen `ColorSet` dataclass. Omit `options` for defaults; an explicit empty dictionary also uses defaults. **`None` is invalid.** The function performs no I/O and needs no `await`. Inputs are not mutated and results are fresh dictionaries.

```python
import json
from texthue import ColorSet, TextColorOptions, VERSION, resolve_text_colors

options: TextColorOptions = {"namespace": "projects", "contrastTarget": 4.5}
colors: ColorSet = resolve_text_colors("project-id:42", options)
print(VERSION)  # text-to-color-v1
print(json.dumps(colors, ensure_ascii=False, indent=2))
```

The returned structure is JSON-compatible and uses the same camelCase field names as the other libraries, including `onFill`, `contrastTarget`, and `meetsTarget`. Do not convert option keys to snake_case. Public types are `Backgrounds`, `Color`, `ColorProfile`, `ColorSet`, `ContrastResult`, `HSL`, `OKLCH`, `Profiles`, `Range`, `RGB`, `TextColorOptions`, `ThemeColors`, `ThemeContrast`, and `ThemeProfiles`. `__version__` is the package version; `VERSION` is the independent, frozen algorithm identifier. Range values are **two-item lists**, not tuples. Type annotations help callers but runtime validation remains authoritative.

## Every tuning parameter

```python
from texthue import TextColorOptions, resolve_text_colors

options: TextColorOptions = {
    "namespace": "workspace:demo",
    "backgrounds": {"light": "#f5f0e8", "dark": "#20242b"},
    "contrastTarget": 7,
    "profiles": {
        "light": {
            "fill": {"lightness": [0.74, 0.84], "chromaScale": [0.08, 0.14]},
            "text": {"lightness": [0.40, 0.52], "chromaScale": [0.60, 0.80]},
        },
        "dark": {
            "fill": {"lightness": [0.38, 0.48], "chromaScale": [0.08, 0.14]},
            "text": {"lightness": [0.74, 0.86], "chromaScale": [0.60, 0.80]},
        },
    },
}
colors = resolve_text_colors("project:atlas", options)
print(colors["light"]["contrast"], colors["dark"]["contrast"])
```

| Option | Default | Validation and effect |
| --- | --- | --- |
| `namespace` | `""` | Exact Unicode string; separates domains and changes the hash |
| `backgrounds.light` | `"#ffffff"` | Opaque six-digit hex color |
| `backgrounds.dark` | `"#121212"` | Opaque six-digit hex color |
| `contrastTarget` | `4.5` | Finite number in 1–21 inclusive; booleans are rejected |
| `profiles.light.fill.lightness` | `[0.72, 0.82]` | Ordered two-item list, values 0–1 |
| `profiles.light.text.lightness` | `[0.43, 0.53]` | Ordered two-item list, values 0–1 |
| `profiles.dark.fill.lightness` | `[0.40, 0.50]` | Ordered two-item list, values 0–1 |
| `profiles.dark.text.lightness` | `[0.72, 0.82]` | Ordered two-item list, values 0–1 |
| Every role's `chroma` | `[0.60, 0.80]` | Ordered two-item list, values 0–0.4 |

Omitted nested fields use defaults. A supplied range replaces both endpoints. Equal endpoints request a fixed value; `[0, 0]` chroma requests grayscale. Lightness is a preference that contrast enforcement can override; gamut fitting can lower chroma. A full resolution returns both themes and all standard formats. For a subset, call `Resolver().project("research", themes=["dark"], roles=["fill"], formats=["hex"])`.

```python
gray = resolve_text_colors("plain", {
    "profiles": {"light": {"fill": {"lightness": [0.75, 0.75], "chromaScale": [0, 0]}}},
})
assert gray["light"]["fill"]["oklch"]["c"] == 0

impossible = resolve_text_colors("project:atlas", {
    "backgrounds": {"light": "#777777"}, "contrastTarget": 7,
})
status = impossible["light"]["contrast"]["text"]
assert status["meetsTarget"] is False
assert status["fallback"] == "unattainable-contrast"
```

Both `contrast.fill` and `contrast.text` contain `ratio`, `meetsTarget`, `lightnessAdjusted`, `chromaReduced`, and `fallback` (`None` or `"unattainable-contrast"`). Fill contrast is against its selected black/white `onFill`; text contrast is against the theme's `background`. An impossible text target returns the better black/white endpoint and reports failure. Color-pair contrast is not an assessment of an entire interface.

## Exact identity and error handling

```python
import unicodedata
from texthue import TextColorError, resolve_text_colors

stable = resolve_text_colors("project-id:42", {"namespace": "projects"})
normalized = resolve_text_colors(unicodedata.normalize("NFC", "e\u0301"))
print(stable["light"]["fill"]["hex"], normalized["light"]["fill"]["hex"])

try:
    resolve_text_colors("research", {"contrastTarget": 22})
except TextColorError as error:
    print(error.code)  # INVALID_OPTIONS
```

`TextColorError` has code `INVALID_TEXT` or `INVALID_OPTIONS`. Non-string text, surrogate code points, unknown keys, `None`, non-finite numbers, booleans used as numbers, invalid ranges, and shorthand/alpha hex colors are rejected. Empty strings and embedded NUL are accepted. The function never trims, normalizes, or case-folds text; do any desired canonicalization consistently before calling it. Namespace is a domain separator, not a secret. Stable non-secret identifiers are preferable to rotating tokens, and colors are neither unique IDs nor anonymization.

## Algorithm and cross-language contract

The renderer hashes a seeded UTF-8 payload, interpolates between pinned hue anchors and samples gamut-relative chroma. Each theme returns ten roles. Contrast repair bisects a 1/4096 lightness grid and measures the final RGB bytes. See [the specification](SPECIFICATION.md) for tables, defaults and tie rules.

The [full included specification](SPECIFICATION.md) provides formulas, matrices, validation, bounds, tie breaks, and fallback behavior. The algorithm identifier `text-to-color-v1` is part of the hashed payload and is independent of the package version; it changes only when the color mapping changes. Hex/RGB are exact across supported implementations; derived HSL/OKLCH values permit a one-unit tolerance in the sixth decimal place.

## Executable examples and development

| File | Coverage |
| --- | --- |
| [basic.py](examples/basic.py) | Both themes and all formats |
| [tuning.py](examples/tuning.py) | Every option, fixed values, grayscale and impossible contrast |
| [identity.py](examples/identity.py) | Stable IDs, exact text, namespace and NFC normalization |
| [errors.py](examples/errors.py) | Invalid inputs and stable error codes |

Run any example with the interpreter where `texthue` is installed. To work from a repository checkout, install the package in editable mode with `python -m pip install -e ./packages/python`. From the repository root, `python tools/verify.py` runs every example and checks Python/JavaScript/Go parity. Installed wheels also contain this README, the specification, and notices under `texthue/_docs/`; the example scripts ship in the source distribution and the repository only.

[MIT license](LICENSE). Adapted color conversions also carry the [W3C notice](THIRD_PARTY_NOTICES.md).
