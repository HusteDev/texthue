"""Immutable Python results with canonical JSON serialization."""

from dataclasses import dataclass, field, fields
from functools import cache
from typing import Literal, Self


def _wire_name(name: str) -> str:
    first, *rest = name.split("_")
    return first + "".join(part.capitalize() for part in rest)


@cache
def _record_schema(cls):
    # Field metadata and wire names depend only on the result type.
    schema = []
    for member in fields(cls):
        kind = member.metadata.get("record", member.type)
        nested = kind if isinstance(kind, type) and issubclass(kind, _Record) else None
        schema.append(
            (member.name, _wire_name(member.name), member.metadata.get("optional"), nested)
        )
    return tuple(schema)


class _Record:
    __slots__ = ()

    def to_dict(self) -> dict:
        result = {}
        for name, wire, optional, nested in _record_schema(type(self)):
            value = getattr(self, name)
            if optional and value is None:
                continue
            result[wire] = value.to_dict() if nested else value
        return result

    @classmethod
    def from_dict(cls, values: dict) -> Self:
        result = {}
        for name, wire, optional, nested in _record_schema(cls):
            if optional and wire not in values:
                continue
            value = values[wire]
            result[name] = nested.from_dict(value) if nested else value
        return cls(**result)


@dataclass(frozen=True, slots=True)
class RGB(_Record):
    """sRGB channels as integers in ``0..255``."""

    r: int
    g: int
    b: int


@dataclass(frozen=True, slots=True)
class HSL(_Record):
    """Hue in degrees ``[0, 360)``; saturation and lightness in percent. Rounded to six decimals."""

    h: float
    s: float
    l: float  # noqa: E741 - field name is part of the cross-language contract


@dataclass(frozen=True, slots=True)
class OKLCH(_Record):
    """OKLCH lightness in ``0..1``, numeric chroma, and hue in degrees ``[0, 360)``. Rounded to six decimals."""

    l: float  # noqa: E741 - field name is part of the cross-language contract
    c: float
    h: float


@dataclass(frozen=True, slots=True)
class DisplayP3(_Record):
    """Encoded Display-P3 channels in the range zero through one."""

    r: float
    g: float
    b: float


@dataclass(frozen=True, slots=True)
class Color(_Record):
    """One opaque color rendered in the configured gamut.

    For Display-P3, ``p3``, ``css``, and ``oklch`` describe the native rendition.
    The ``hex``, ``rgb``, and ``hsl`` fields describe its sRGB fallback.
    ``srgb_clipped`` records whether conversion clipped a channel.
    """

    #: Lowercase six-digit ``#rrggbb``.
    hex: str
    rgb: RGB
    hsl: HSL
    oklch: OKLCH
    p3: DisplayP3 | None = field(default=None, metadata={"optional": True, "record": DisplayP3})
    css: str | None = field(default=None, metadata={"optional": True})
    srgb_clipped: bool | None = field(default=None, metadata={"optional": True})


@dataclass(frozen=True, slots=True)
class ContrastResult(_Record):
    """Contrast measurement for one color pair and a record of any adjustments."""

    #: Luminance contrast ratio of the rendered pair in the selected gamut.
    ratio: float
    #: Whether this relationship meets its target under the configured contrast model.
    meets_target: bool
    #: Whether lightness was moved away from the sampled value to reach the target.
    lightness_adjusted: bool
    #: Whether chroma was reduced below the requested value to fit the selected gamut.
    chroma_reduced: bool
    chroma_capped: bool
    #: Reason the renderer used a fallback or retained a constrained palette fill.
    fallback: Literal["unattainable-contrast", "palette-constraint"] | None
    model: Literal["apca", "wcag2"] | None = field(default=None, metadata={"optional": True})
    value: float | None = field(default=None, metadata={"optional": True})


@dataclass(frozen=True, slots=True)
class ThemeContrast(_Record):
    """The configured target and the seven measured role relationships."""

    target: float
    #: ``fill`` measured against ``onFill``.
    fill: ContrastResult
    #: Hover and active fills are measured against the selected on-fill foreground.
    fill_hover: ContrastResult
    fill_active: ContrastResult
    border: ContrastResult
    strong: ContrastResult
    text_on_subtle: ContrastResult
    #: Text measured against the theme background.
    text: ContrastResult


@dataclass(frozen=True, slots=True)
class ThemeColors(_Record):
    """All colors and contrast measurements for one theme."""

    #: The configured theme background.
    background: Color
    #: Badge or surface color.
    fill: Color
    #: Foreground chosen from the configured candidates for use on the fill.
    on_fill: Color
    #: Low-emphasis surface used as the backdrop for the text-on-subtle measurement.
    subtle: Color
    muted: Color
    fill_hover: Color
    fill_active: Color
    border: Color
    strong: Color
    text: Color
    contrast: ThemeContrast


@dataclass(frozen=True, slots=True)
class ColorSet(_Record):
    """Complete result of :func:`texthue.resolve_text_colors`."""

    #: Algorithm identifier that produced this result.
    version: Literal["text-to-color-v1"]
    #: Origin of this color assignment.
    source: Literal["hash", "assigned", "palette", "override"]
    hue_fraction: float
    hue: float
    light: ThemeColors
    dark: ThemeColors


@dataclass(frozen=True, slots=True)
class Assignment(_Record):
    hue_fraction: float
    ring: int
    moved: bool
