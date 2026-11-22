"""Immutable Python results with canonical JSON serialization."""

from dataclasses import dataclass, field, fields
from typing import Literal, Self


def _wire_name(name: str) -> str:
    first, *rest = name.split("_")
    return first + "".join(part.capitalize() for part in rest)


class _Record:
    __slots__ = ()

    def to_dict(self) -> dict:
        result = {}
        for member in fields(self):
            value = getattr(self, member.name)
            if member.metadata.get("optional") and value is None:
                continue
            result[_wire_name(member.name)] = (
                value.to_dict() if isinstance(value, _Record) else value
            )
        return result

    @classmethod
    def from_dict(cls, values: dict) -> Self:
        result = {}
        for member in fields(cls):
            if member.metadata.get("optional") and _wire_name(member.name) not in values:
                continue
            value = values[_wire_name(member.name)]
            kind = member.metadata.get("record", member.type)
            nested = isinstance(kind, type) and issubclass(kind, _Record)
            result[member.name] = kind.from_dict(value) if nested else value
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
    """One opaque sRGB color in four equivalent representations.

    The RGB bytes are canonical; ``hex``, ``hsl``, and ``oklch`` are derived from them.
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

    #: WCAG contrast ratio of the final RGB pair, at full computational precision.
    ratio: float
    #: Whether ``ratio`` is at least the configured target.
    meets_target: bool
    #: Whether lightness was moved away from the sampled value to reach the target.
    lightness_adjusted: bool
    #: Whether chroma was reduced below the requested value to fit the sRGB gamut.
    chroma_reduced: bool
    chroma_capped: bool
    #: ``"unattainable-contrast"`` when no sRGB text can reach the target; otherwise ``None``.
    fallback: Literal["unattainable-contrast", "palette-constraint"] | None
    model: Literal["apca", "wcag2"] | None = field(default=None, metadata={"optional": True})
    value: float | None = field(default=None, metadata={"optional": True})


@dataclass(frozen=True, slots=True)
class ThemeContrast(_Record):
    """The configured target plus measurements for both contrast pairs."""

    target: float
    #: ``fill`` measured against ``onFill``.
    fill: ContrastResult
    #: ``text`` measured against ``background``.
    fill_hover: ContrastResult
    fill_active: ContrastResult
    border: ContrastResult
    strong: ContrastResult
    text_on_subtle: ContrastResult
    text: ContrastResult


@dataclass(frozen=True, slots=True)
class ThemeColors(_Record):
    """All colors and contrast measurements for one theme."""

    #: The configured theme background.
    background: Color
    #: Badge or surface color.
    fill: Color
    #: Black or white, whichever contrasts more with ``fill``.
    on_fill: Color
    #: Text or mark color for use on ``background``.
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
    #: Hash-derived identity hue in degrees, unrounded. Shared by all four roles before gamut fitting.
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
