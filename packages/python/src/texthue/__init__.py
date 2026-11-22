"""TextHue: deterministic colors for exact text.

Maps any well-formed Unicode string to coordinated light and dark theme
colors using the ``text-to-color-v1`` algorithm. Results match the TextHue
JavaScript/TypeScript and Go libraries for identical inputs and options.

Example::

    from texthue import resolve_text_colors

    colors = resolve_text_colors("research")
    colors.light.fill.hex  # '#59b8d8'
    colors.dark.fill.hex   # '#255464'

The package has no runtime dependencies and performs no I/O.
"""

from collections.abc import Iterable
from typing import cast

from . import _core
from ._assignment import assign_collection
from ._core import VERSION, TextColorError
from ._css import css_variables, to_css
from ._models import (
    HSL,
    OKLCH,
    RGB,
    Assignment,
    Color,
    ColorSet,
    ContrastResult,
    ThemeColors,
    ThemeContrast,
)
from ._types import Backgrounds, ColorProfile, Profiles, Range, TextColorOptions, ThemeProfiles

#: Package release version. Independent of :data:`VERSION`, the algorithm identifier.
__version__ = "0.1.0"

# Sentinel distinguishing an omitted options argument from an explicit (invalid) None.
_OMITTED = object()
_OMITTED_OPTIONS = cast(TextColorOptions, _OMITTED)


_ALIASES = {
    "foreground_policy": "foregroundPolicy",
    "hue_range": "hueRange",
    "exclude_hues": "excludeHues",
    "contrast_target": "contrastTarget",
    "contrast_targets": "contrastTargets",
    "fill_hover": "fillHover",
    "fill_active": "fillActive",
    "text_on_subtle": "textOnSubtle",
    "chroma_scale": "chromaScale",
    "chroma_cap": "chromaCap",
}


def _native_options(value):
    if isinstance(value, dict):
        output = {}
        for key, item in value.items():
            name = _ALIASES.get(key, key)
            if name in output:
                raise TextColorError("INVALID_OPTIONS", f"Duplicate option {name}")
            output[name] = item if name == "overrides" else _native_options(item)
        return output
    if isinstance(value, tuple):
        return list(value)
    return value


class Resolver:
    """Compile options once and reuse the resolver for a collection of labels."""

    def __init__(self, options: TextColorOptions = _OMITTED_OPTIONS, **kwargs):
        if options is not _OMITTED and kwargs:
            raise TextColorError("INVALID_OPTIONS", "Use an options mapping or keyword options")
        source = kwargs if options is _OMITTED else options
        self._compiled = _core.compile_settings(_native_options(source))

    def export_config(self):
        from copy import deepcopy

        from ._fingerprint import fingerprint

        payload = {
            "schema": "texthue-config-v1",
            "algorithm": VERSION,
            "options": deepcopy(self._compiled[0]["exportOptions"]),
        }
        return {**payload, "fingerprint": fingerprint(payload)}

    def resolve(self, text: str) -> ColorSet:
        return ColorSet.from_dict(_core.render(text, *self._compiled))

    def assign(self, texts: Iterable[str], *, pinned=None):
        return assign_collection(texts, pinned or {}, self._compiled)

    def batch(self, texts: Iterable[str]) -> list[ColorSet]:
        cache = {}
        result = []
        for text in texts:
            _core._text(text, "text", "INVALID_TEXT")
            if text not in cache:
                cache[text] = self.resolve(text)
            result.append(cache[text])
        return result

    def _selected_theme(self, text: str, theme: str, role: str) -> ThemeColors:
        if theme not in ("light", "dark") or role not in {
            "background",
            "subtle",
            "muted",
            "fill",
            "fill_hover",
            "fill_active",
            "on_fill",
            "border",
            "text",
            "strong",
        }:
            raise TextColorError("INVALID_OPTIONS", "Unknown theme or role")
        return getattr(self.resolve(text), theme)

    def color(self, text: str, *, theme: str, role: str) -> Color:
        return getattr(self._selected_theme(text, theme, role), role)

    def hex(self, text: str, *, theme: str, role: str, strict: bool = False) -> str:
        if not isinstance(strict, bool):
            raise TextColorError("INVALID_OPTIONS", "strict must be boolean")
        selected = self._selected_theme(text, theme, role)
        if strict:
            pairs = {
                "fill": ("fill",),
                "on_fill": ("fill",),
                "text": ("text", "text_on_subtle"),
                "border": ("border",),
                "strong": ("strong",),
                "fill_hover": ("fill_hover",),
                "fill_active": ("fill_active",),
            }
            for pair in pairs.get(role, ()):
                if not getattr(selected.contrast, pair).meets_target:
                    raise TextColorError(
                        "UNMET_CONSTRAINT", f"{theme}.{pair} contrast target was not met"
                    )
        return getattr(selected, role).hex


def export_config(resolver: Resolver):
    return resolver.export_config()


def import_config(value) -> Resolver:
    from ._fingerprint import fingerprint

    keys = {"schema", "algorithm", "options", "fingerprint"}
    if (
        not isinstance(value, dict)
        or set(value) != keys
        or value["schema"] != "texthue-config-v1"
        or value["algorithm"] != VERSION
    ):
        raise TextColorError("INVALID_OPTIONS", "Unsupported configuration schema or algorithm")
    resolver = Resolver(value["options"])
    payload = {key: value[key] for key in ("schema", "algorithm", "options")}
    if (
        resolver.export_config()["fingerprint"] != value["fingerprint"]
        or fingerprint(payload) != value["fingerprint"]
    ):
        raise TextColorError("INVALID_OPTIONS", "Configuration fingerprint mismatch")
    return resolver


def resolve_text_colors(
    text: str, options: TextColorOptions = _OMITTED_OPTIONS, **kwargs
) -> ColorSet:
    """Return immutable theme colors. Use to_dict() for the shared JSON shape."""
    _core._text(text, "text", "INVALID_TEXT")
    return Resolver(options, **kwargs).resolve(text)


def assign_text_colors(texts, options=_OMITTED_OPTIONS, *, pinned=None, **kwargs):
    return Resolver(options, **kwargs).assign(texts, pinned=pinned)


__all__ = [
    "export_config",
    "import_config",
    "assign_text_colors",
    "Assignment",
    "css_variables",
    "to_css",
    "Resolver",
    "VERSION",
    "TextColorError",
    "resolve_text_colors",
    "TextColorOptions",
    "Range",
    "ColorProfile",
    "ThemeProfiles",
    "Profiles",
    "Backgrounds",
    "RGB",
    "HSL",
    "OKLCH",
    "Color",
    "ContrastResult",
    "ThemeContrast",
    "ThemeColors",
    "ColorSet",
]
