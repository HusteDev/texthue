"""CSS serialization for sRGB and Display-P3 results."""

import hashlib
import re
from dataclasses import fields

from ._core import TextColorError, _srgb_to_p3, _text
from ._models import Color, ColorSet


def _decimal(value: float) -> str:
    return f"{value:.6f}".rstrip("0").rstrip(".") or "0"


def to_css(color: Color, format: str = "hex") -> str:
    if format == "hex":
        return color.hex
    if format == "rgb":
        return f"rgb({color.rgb.r} {color.rgb.g} {color.rgb.b})"
    if format == "p3":
        if color.css is not None:
            return color.css
        channels = _srgb_to_p3((color.rgb.r, color.rgb.g, color.rgb.b))
        return "color(display-p3 " + " ".join(map(_decimal, channels)) + ")"
    if format == "hsl":
        c = color.hsl
        return f"hsl({_decimal(c.h)} {_decimal(c.s)}% {_decimal(c.l)}%)"
    if format == "oklch":
        c = color.oklch
        return f"oklch({_decimal(c.l)} {_decimal(c.c)} {_decimal(c.h)})"
    raise TextColorError("INVALID_OPTIONS", "Unknown CSS format")


def css_variables(
    colors: ColorSet, *, theme: str, slug: str, prefix: str = "texthue", format: str = "hex"
) -> dict[str, str]:
    if (
        not isinstance(prefix, str)
        or not re.fullmatch(r"[a-z][a-z0-9-]*", prefix)
        or theme not in ("light", "dark")
    ):
        raise TextColorError("INVALID_OPTIONS", "Invalid CSS prefix or theme")
    _text(slug, "slug", "INVALID_OPTIONS")
    suffix = hashlib.sha256(slug.encode()).hexdigest()[:6]
    stem = re.sub(r"[^a-z0-9]+", "-", slug.lower()).strip("-") or "label"
    palette = getattr(colors, theme)
    return {
        f"--{prefix}-{stem}-{suffix}-{field.name.replace('_', '-')}": to_css(
            getattr(palette, field.name), format
        )
        for field in fields(palette)
        if field.name != "contrast"
    }
