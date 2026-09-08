"""TextHue: deterministic colors for exact text.

Maps any well-formed Unicode string to coordinated light and dark theme
colors using the ``text-to-color-v1`` algorithm. Results match the TextHue
JavaScript/TypeScript and Go libraries for identical inputs and options.

Example::

    from texthue import resolve_text_colors

    colors = resolve_text_colors("research")
    colors["light"]["fill"]["hex"]  # '#bf97fc'
    colors["dark"]["fill"]["hex"]   # '#5f3692'

The package has no runtime dependencies and performs no I/O.
"""

from typing import cast

from . import _core
from ._core import VERSION, TextColorError
from ._types import (
    HSL,
    OKLCH,
    RGB,
    Backgrounds,
    Color,
    ColorProfile,
    ColorSet,
    ContrastResult,
    Profiles,
    Range,
    TextColorOptions,
    ThemeColors,
    ThemeContrast,
    ThemeProfiles,
)

#: Package release version. Independent of :data:`VERSION`, the algorithm identifier.
__version__ = "0.1.0"

# Sentinel distinguishing an omitted options argument from an explicit (invalid) None.
_OMITTED = object()
_OMITTED_OPTIONS = cast(TextColorOptions, _OMITTED)


def resolve_text_colors(text: str, options: TextColorOptions = _OMITTED_OPTIONS) -> ColorSet:
    """Resolve exact text to light and dark theme colors in every output format.

    The text is hashed with SHA-256 together with the algorithm identifier and
    the namespace. The digest drives hue, lightness, and chroma sampling for
    four OKLCH profiles. Each color is gamut-fitted to sRGB, checked against
    the contrast target, and returned in Hex, RGB, HSL, and OKLCH.

    Text is used exactly as given: no trimming, case folding, or Unicode
    normalization is applied. No input is retained after the call.

    Args:
        text: Any well-formed Unicode string, including the empty string.
            Strings containing surrogate code points are rejected.
        options: A :class:`TextColorOptions` mapping with optional
            ``namespace``, ``backgrounds``, ``contrastTarget``, and
            ``profiles`` keys. Omit the argument, or pass ``{}``, for
            defaults. ``None`` is invalid.

    Returns:
        A fresh :class:`ColorSet` dictionary that is JSON-serializable and uses
        the same camelCase keys as the other TextHue libraries.

    Raises:
        TextColorError: With ``code`` ``"INVALID_TEXT"`` for malformed text or
            ``"INVALID_OPTIONS"`` for any invalid option.
    """
    if options is _OMITTED:
        return cast(ColorSet, _core.resolve_text_colors(text))
    return cast(ColorSet, _core.resolve_text_colors(text, options))


__all__ = [
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
