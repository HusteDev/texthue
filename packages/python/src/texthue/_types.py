"""Public option and result shapes as ``TypedDict`` classes.

These annotations help static checkers and editors. Numeric bounds and key
validity are enforced at runtime by :func:`texthue.resolve_text_colors`;
the types alone cannot express them.
"""

from typing import TypedDict

#: An ordered ``[minimum, maximum]`` pair of preferred bounds as a two-item list.
#: Equal endpoints request a fixed value. Contrast enforcement may move lightness
#: outside the range, and gamut fitting may reduce chroma below its minimum.
Range = list[float] | tuple[float, float]


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
    overrides: dict[str, str | dict[str, str]]
    palette: list[dict[str, str]]
    foregrounds: list[str]
    foregroundPolicy: str
    preset: str
    hueRange: Range
    excludeHues: list[Range]
    normalize: dict[str, str]
    seed: int
    namespace: str
    #: Theme backgrounds used for text contrast.
    backgrounds: Backgrounds
    #: WCAG contrast ratio required for both pairs in both themes; ``1..21`` inclusive. Default ``4.5``.
    contrastTargets: dict[str, float]
    contrastTarget: float
    #: Per-theme, per-role lightness and chroma preferences.
    profiles: Profiles
