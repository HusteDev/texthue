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

import math
from collections.abc import Iterable
from typing import cast

from . import _core
from ._assignment import assign_collection
from ._core import VERSION, TextColorError
from ._css import css_variables, to_css
from ._migration import compare_assignments
from ._models import (
    HSL,
    OKLCH,
    RGB,
    Assignment,
    Color,
    ColorSet,
    ContrastResult,
    DisplayP3,
    ThemeColors,
    ThemeContrast,
    _wire_name,
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
    "contrast_model": "contrastModel",
    "contrast_target": "contrastTarget",
    "contrast_targets": "contrastTargets",
    "fill_hover": "fillHover",
    "fill_active": "fillActive",
    "text_on_subtle": "textOnSubtle",
    "chroma_scale": "chromaScale",
    "chroma_cap": "chromaCap",
}


def _color_bytes(color: Color) -> tuple[int, int, int]:
    if not isinstance(color, Color) or not isinstance(color.rgb, RGB):
        raise TextColorError("INVALID_OPTIONS", "Expected an opaque sRGB color")
    channels = (color.rgb.r, color.rgb.g, color.rgb.b)
    if any(type(c) is not int or not 0 <= c <= 255 for c in channels):
        raise TextColorError("INVALID_OPTIONS", "Expected sRGB bytes")
    return channels


def measure_apca(text: Color, background: Color) -> float:
    """Measure signed APCA Lc for opaque sRGB colors, text first."""
    return _core._apca_contrast(_color_bytes(text), _color_bytes(background))


def composite_over(color: Color, alpha: float, backdrop: Color) -> Color:
    """Composite a translucent source over an opaque backdrop in linear sRGB."""
    if not _core._number(alpha) or not 0 <= alpha <= 1:
        raise TextColorError("INVALID_OPTIONS", "Alpha must be in [0,1]")
    channels = []
    for src, dst in zip(_color_bytes(color), _color_bytes(backdrop), strict=True):
        linear = alpha * _core._decode(src / 255) + (1 - alpha) * _core._decode(dst / 255)
        channels.append(math.floor(255 * _core._encode(linear) + 0.5))
    return Color.from_dict(_core._formats(channels))


def _native_options(value):
    if isinstance(value, dict):
        output = {}
        for key, item in value.items():
            name = _ALIASES.get(key, key)
            if name in output:
                raise TextColorError("INVALID_OPTIONS", f"Duplicate option {name}")
            if name == "backgrounds" and isinstance(item, dict):
                item = {
                    k: "#" + bytes(_color_bytes(v)).hex() if isinstance(v, Color) else v
                    for k, v in item.items()
                }
            output[name] = item if name == "overrides" else _native_options(item)
        return output
    if isinstance(value, tuple):
        return list(value)
    return value


def _registry_assignments(value):
    if not isinstance(value, dict):
        raise TextColorError("INVALID_OPTIONS", "Invalid registry assignments")
    result = {}
    for name, placement in value.items():
        _core._text(name, "registry key", "INVALID_OPTIONS")
        p = placement.to_dict() if isinstance(placement, Assignment) else placement
        if not isinstance(p, dict) or set(p) != {"hueFraction", "ring", "moved"}:
            raise TextColorError("INVALID_OPTIONS", "Invalid registry placement fields")
        hue, ring, moved = p["hueFraction"], p["ring"], p["moved"]
        if (
            type(hue) not in (int, float)
            or not 0 <= hue < 1
            or type(ring) is not int
            or not 0 <= ring <= 2**53 - 1
            or type(moved) is not bool
        ):
            raise TextColorError("INVALID_OPTIONS", "Invalid registry placement")
        result[name] = Assignment(hue, ring, moved)
    return result


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

    def identity(self, text: str) -> str:
        return self._compiled[0]["normalize"](_core._text(text, "text", "INVALID_TEXT"))

    def export_registry(self, assignments):
        return {
            "schema": "texthue-registry-v1",
            "algorithm": VERSION,
            "fingerprint": self.export_config()["fingerprint"],
            "assignments": {k: v.to_dict() for k, v in _registry_assignments(assignments).items()},
        }

    def import_registry(self, value):
        if (
            not isinstance(value, dict)
            or set(value) != {"schema", "algorithm", "fingerprint", "assignments"}
            or value["schema"] != "texthue-registry-v1"
            or value["algorithm"] != VERSION
            or value["fingerprint"] != self.export_config()["fingerprint"]
        ):
            raise TextColorError("INVALID_OPTIONS", "Incompatible assignment registry")
        return _registry_assignments(value["assignments"])

    def resolve(self, text: str) -> ColorSet:
        return ColorSet.from_dict(_core.render(text, *self._compiled))

    def project(self, text: str, *, themes=None, roles=None, formats=None):
        """Select wire-format theme, role and format fields, optionally including a precision trace."""
        role_names = (
            "background",
            "subtle",
            "muted",
            "fill",
            "onFill",
            "fillHover",
            "fillActive",
            "border",
            "text",
            "strong",
        )
        standard = ("hex", "rgb", "hsl", "oklch")
        if self._compiled[0]["wide"]:
            standard += ("p3", "css", "srgbClipped")

        def select(values, allowed, defaults):
            if values is None:
                return defaults
            if (
                not isinstance(values, (list, tuple))
                or not values
                or any(v not in allowed for v in values)
            ):
                raise TextColorError("INVALID_OPTIONS", "Invalid output selection")
            return values

        themes = select(themes, ("light", "dark"), ("light", "dark"))
        roles = select(roles, role_names, role_names)
        formats = select(formats, (*standard, "trace"), standard)
        result = _core.render(
            text,
            *self._compiled,
            trace="trace" in formats,
            themes=themes,
            roles=roles,
            formats=(*formats, "hex") if "trace" in formats else formats,
        )
        return {
            theme: {role: {fmt: result[theme][role][fmt] for fmt in formats} for role in roles}
            for theme in themes
        }

    def assign(self, texts: Iterable[str], *, pinned=None):
        return assign_collection(texts, pinned or {}, self._compiled)

    def batch(self, texts: Iterable[str]) -> list[ColorSet]:
        cache = {}
        result = []
        for text in texts:
            name = self.identity(text)
            if name not in cache:
                cache[name] = self.resolve(text)
            result.append(cache[name])
        return result

    def _selected_theme(self, text: str, theme: str, role: str, *, hex_only=False):
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
        return _core.render(
            text,
            *self._compiled,
            themes=(theme,),
            roles=(_wire_name(role),),
            formats=("hex",) if hex_only else None,
        )[theme]

    def color(self, text: str, *, theme: str, role: str) -> Color:
        return Color.from_dict(self._selected_theme(text, theme, role)[_wire_name(role)])

    def hex(self, text: str, *, theme: str, role: str, strict: bool = False) -> str:
        if not isinstance(strict, bool):
            raise TextColorError("INVALID_OPTIONS", "strict must be boolean")
        selected = self._selected_theme(text, theme, role, hex_only=True)
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
                if not selected["contrast"][_wire_name(pair)]["meetsTarget"]:
                    raise TextColorError(
                        "UNMET_CONSTRAINT", f"{theme}.{pair} contrast target was not met"
                    )
        return selected[_wire_name(role)]["hex"]


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
    "measure_apca",
    "composite_over",
    "compare_assignments",
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
    "DisplayP3",
    "ThemeContrast",
    "ThemeColors",
    "ColorSet",
]
