"""Public option and result shapes as ``TypedDict`` classes.

These annotations help static checkers and editors. Numeric bounds and key
validity are enforced at runtime by :func:`texthue.resolve_text_colors`;
the types alone cannot express them.
"""

from typing import Literal, TypedDict

#: An ordered ``[minimum, maximum]`` pair of preferred bounds as a two-item list.
#: Equal endpoints request a fixed value. Contrast enforcement may move lightness
#: outside the range, and gamut fitting may reduce chroma below its minimum.
Range = list[float]


class ColorProfile(TypedDict, total=False):
    """Preferred OKLCH lightness and chroma ranges for one color role."""

    #: Both endpoints in ``0..1``.
    lightness: Range
    #: Both endpoints in ``0..0.4``. ``[0, 0]`` requests grayscale.
    chromaScale: Range
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
    light: str
    #: Default ``"#121212"``.
    dark: str


class TextColorOptions(TypedDict, total=False):
    """Options accepted by :func:`texthue.resolve_text_colors`.

    Every key is optional and omitted keys keep their defaults. Explicit
    ``None`` values and unknown keys are invalid at every level.
    """

    #: Domain separator mixed into the hash. Default ``""``. Exact Unicode text; not a secret.
    seed: int
    namespace: str
    #: Theme backgrounds used for text contrast.
    backgrounds: Backgrounds
    #: WCAG contrast ratio required for both pairs in both themes; ``1..21`` inclusive. Default ``4.5``.
    contrastTargets: dict[str, float]
    contrastTarget: float
    #: Per-theme, per-role lightness and chroma preferences.
    profiles: Profiles


class RGB(TypedDict):
    """sRGB channels as integers in ``0..255``."""

    r: int
    g: int
    b: int


class HSL(TypedDict):
    """Hue in degrees ``[0, 360)``; saturation and lightness in percent. Rounded to six decimals."""

    h: float
    s: float
    l: float  # noqa: E741 - field name is part of the cross-language contract


class OKLCH(TypedDict):
    """OKLCH lightness in ``0..1``, numeric chroma, and hue in degrees ``[0, 360)``. Rounded to six decimals."""

    l: float  # noqa: E741 - field name is part of the cross-language contract
    c: float
    h: float


class Color(TypedDict):
    """One opaque sRGB color in four equivalent representations.

    The RGB bytes are canonical; ``hex``, ``hsl``, and ``oklch`` are derived from them.
    """

    #: Lowercase six-digit ``#rrggbb``.
    hex: str
    rgb: RGB
    hsl: HSL
    oklch: OKLCH


class ContrastResult(TypedDict):
    """Contrast measurement for one color pair and a record of any adjustments."""

    #: WCAG contrast ratio of the final RGB pair, at full computational precision.
    ratio: float
    #: Whether ``ratio`` is at least the configured target.
    meetsTarget: bool
    #: Whether lightness was moved away from the sampled value to reach the target.
    lightnessAdjusted: bool
    #: Whether chroma was reduced below the requested value to fit the sRGB gamut.
    chromaReduced: bool
    chromaCapped: bool
    #: ``"unattainable-contrast"`` when no sRGB text can reach the target; otherwise ``None``.
    fallback: Literal["unattainable-contrast"] | None


class ThemeContrast(TypedDict):
    """The configured target plus measurements for both contrast pairs."""

    target: float
    #: ``fill`` measured against ``onFill``.
    fill: ContrastResult
    #: ``text`` measured against ``background``.
    fillHover: ContrastResult
    fillActive: ContrastResult
    border: ContrastResult
    strong: ContrastResult
    textOnSubtle: ContrastResult
    text: ContrastResult


class ThemeColors(TypedDict):
    """All colors and contrast measurements for one theme."""

    #: The configured theme background.
    background: Color
    #: Badge or surface color.
    fill: Color
    #: Black or white, whichever contrasts more with ``fill``.
    onFill: Color
    #: Text or mark color for use on ``background``.
    subtle: Color
    muted: Color
    fillHover: Color
    fillActive: Color
    border: Color
    strong: Color
    text: Color
    contrast: ThemeContrast


class ColorSet(TypedDict):
    """Complete result of :func:`texthue.resolve_text_colors`."""

    #: Algorithm identifier that produced this result.
    version: Literal["text-to-color-v1"]
    #: Hash-derived identity hue in degrees, unrounded. Shared by all four roles before gamut fitting.
    hueFraction: float
    hue: float
    light: ThemeColors
    dark: ThemeColors
