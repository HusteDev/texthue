"""Public option and result shapes as ``TypedDict`` classes.

These annotations help static checkers and editors. Numeric bounds and key
validity are enforced at runtime by :func:`texthue.resolve_text_colors`;
the types alone cannot express them.
"""

from typing import Literal, NotRequired, TypedDict

from ._models import Assignment, Color, ColorSet

#: An ordered pair of bounds supplied as a two-item list or tuple.
#: Equal endpoints request a fixed value. Contrast enforcement may move lightness
#: outside the range, and gamut fitting may reduce chroma below its minimum.
Range = list[float] | tuple[float, float]


class ColorProfile(TypedDict, total=False):
    """Preferred OKLCH lightness and chroma ranges for one color role."""

    #: Both endpoints in ``0..1``.
    lightness: Range
    #: Fraction of the available gamut chroma, with both endpoints in ``0..1``.
    #: Equal zero endpoints request grayscale.
    chromaScale: Range
    #: Absolute OKLCH chroma ceiling in ``0..0.4``.
    chromaCap: float


class ThemeProfiles(TypedDict, total=False):
    """Profiles for the two color roles of one theme."""

    #: Badge or surface background color.
    fill: ColorProfile
    #: Text or mark color used directly on the theme background.
    text: ColorProfile


class Profiles(TypedDict, total=False):
    """Per-theme profiles."""

    light: ThemeProfiles
    dark: ThemeProfiles


class Backgrounds(TypedDict, total=False):
    """Theme backgrounds as opaque ``#RRGGBB`` strings, case-insensitive."""

    #: Default ``"#ffffff"``.
    light: str | Color
    #: Default ``"#121212"``.
    dark: str | Color


class TextColorOptions(TypedDict, total=False):
    """Options accepted by :func:`texthue.resolve_text_colors`.

    Every key is optional and omitted keys keep their defaults. Explicit
    ``None`` values and unknown keys are invalid at every level.
    """

    overrides: dict[str, str | dict[str, str]]
    paletteMode: Literal["fixed", "anchors"]
    palette: list[dict[str, str]]
    foregrounds: list[str]
    foregroundPolicy: str
    preset: str
    hueRange: Range
    excludeHues: list[Range] | tuple[Range, ...]
    normalize: dict[str, str]
    seed: int
    #: Domain separator mixed into the hash. Defaults to the empty string.
    namespace: str
    #: Theme backgrounds used for text contrast.
    backgrounds: Backgrounds
    #: Targets for individual contrast relationships.
    contrastTargets: dict[str, float]
    gamut: str
    contrastModel: str
    #: Global target. WCAG uses 1 through 21 (default 4.5), APCA uses 0 through 106 (default 60).
    contrastTarget: float
    #: Per-theme, per-role lightness and chroma preferences.
    profiles: Profiles


class AssignmentSearch(TypedDict):
    label: str
    positionsConsidered: int
    colorsEvaluated: int
    bestDistance: float | None


class AssignmentReport(TypedDict):
    minDistance: float | None
    closestPairs: list[list[str]]
    withinRingCapacity: bool
    distinctFills: bool
    searches: NotRequired[list[AssignmentSearch]]


class AssignedColors(TypedDict):
    colors: dict[str, ColorSet]
    colorsByInput: dict[str, ColorSet]
    assignments: dict[str, Assignment]
    report: AssignmentReport
    markers: NotRequired[dict[str, str]]
