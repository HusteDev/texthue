"""Implementation of the ``text-to-color-v1`` algorithm.

Conversion equations and matrices are taken from W3C CSS Color 4
(1 September 2026); see THIRD_PARTY_NOTICES.md. The order of floating-point
operations is part of the algorithm contract and must not change.

This module is private. Use :func:`texthue.resolve_text_colors`.
"""

import hashlib
import math

#: Algorithm identifier, written into every hashed payload and returned as ``version``.
VERSION = "text-to-color-v1"

# OKLab to non-linear LMS (specification matrix M1).
_LAB_TO_LMS = (
    (1, 0.3963377773761749, 0.2158037573099136),
    (1, -0.1055613458156586, -0.0638541728258133),
    (1, -0.0894841775298119, -1.2914855480194092),
)
# LMS to XYZ D65 (M2).
_LMS_TO_XYZ = (
    (1.2268798758459243, -0.5578149944602171, 0.2813910456659647),
    (-0.0405757452148008, 1.112286803280317, -0.0717110580655164),
    (-0.0763729366746601, -0.4214933324022432, 1.5869240198367816),
)
# XYZ D65 to linear sRGB (M3). Rational entries are evaluated as binary64 divisions.
_XYZ_TO_RGB = (
    (12831 / 3959, -329 / 214, -1974 / 3959),
    (-851781 / 878810, 1648619 / 878810, 36519 / 878810),
    (705 / 12673, -2585 / 12673, 705 / 667),
)
# Linear sRGB to XYZ D65 (M4).
_RGB_TO_XYZ = (
    (506752 / 1228815, 87881 / 245763, 12673 / 70218),
    (87098 / 409605, 175762 / 245763, 12673 / 175545),
    (7918 / 409605, 87881 / 737289, 1001167 / 1053270),
)
# XYZ D65 to LMS (M5).
_XYZ_TO_LMS = (
    (0.819022437996703, 0.3619062600528904, -0.1288737815209879),
    (0.0329836539323885, 0.9292868615863434, 0.0361446663506424),
    (0.0481771893596242, 0.2642395317527308, 0.6335478284694309),
)
# Cube-root LMS to OKLab (M6).
_LMS_TO_LAB = (
    (0.210454268309314, 0.7936177747023054, -0.0040720430116193),
    (1.9779985324311684, -2.42859224204858, 0.450593709617411),
    (0.0259040424655478, 0.7827717124575296, -0.8086757549230774),
)


class TextColorError(ValueError):
    """Raised for invalid text or options.

    Attributes:
        code: A stable, language-neutral error code: ``"INVALID_TEXT"`` for a
            malformed ``text`` argument or ``"INVALID_OPTIONS"`` for any
            invalid option, including an invalid namespace. The message
            wording is not part of the contract.
    """

    def __init__(self, code, message):
        super().__init__(message)
        self.code = code


def _multiply(matrix, vector):
    """Multiply a 3x3 matrix by a column vector, evaluating each row as ``(m0*v0 + m1*v1) + m2*v2``."""
    return [row[0] * vector[0] + row[1] * vector[1] + row[2] * vector[2] for row in matrix]


def _decode(value):
    """Apply the sRGB transfer function from an encoded channel to linear light."""
    return value / 12.92 if value <= 0.04045 else ((value + 0.055) / 1.055) ** 2.4


def _encode(value):
    """Apply the sRGB transfer function from linear light to an encoded channel."""
    return 12.92 * value if value <= 0.0031308 else 1.055 * value ** (1 / 2.4) - 0.055


def _round6(value):
    """Round half up to six decimal places."""
    return math.floor(value * 1e6 + 0.5) / 1e6


def _linear(lightness, chroma, hue):
    """Convert OKLCH to linear sRGB without clamping.

    Channels outside ``[0, 1]`` indicate a color outside the sRGB gamut.
    """
    angle = hue * math.pi / 180
    lab = [lightness, chroma * math.cos(angle), chroma * math.sin(angle)]
    lms = [value * value * value for value in _multiply(_LAB_TO_LMS, lab)]
    return _multiply(_XYZ_TO_RGB, _multiply(_LMS_TO_XYZ, lms))


def _inside(rgb):
    """Return whether every linear channel lies within the sRGB gamut, allowing ``1e-12`` of residue."""
    return all(-1e-12 <= value <= 1 + 1e-12 for value in rgb)


def _fit(lightness, chroma, hue):
    """Fit an OKLCH color into the sRGB gamut and quantize it to RGB bytes.

    Lightness and hue are preserved. Out-of-gamut chroma is reduced with
    exactly 24 binary-search iterations. Lightness ``0`` and ``1`` short-circuit
    to black and white.

    Returns:
        A dict with ``rgb`` (three integer channels), ``chroma`` (the retained
        pre-quantization chroma), and ``lightness`` (the input lightness).
    """
    if lightness == 0 or lightness == 1:
        return {"rgb": [int(lightness * 255)] * 3, "chroma": 0, "lightness": lightness}
    retained = chroma
    linear = _linear(lightness, retained, hue)
    if not _inside(linear):
        low, high = 0, chroma
        for _ in range(24):
            mid = (low + high) / 2
            if _inside(_linear(lightness, mid, hue)):
                low = mid
            else:
                high = mid
        retained = low
        linear = _linear(lightness, retained, hue)
    rgb = [math.floor(_encode(max(0, min(1, value))) * 255 + 0.5) for value in linear]
    return {"rgb": rgb, "chroma": retained, "lightness": lightness}


def _luminance(rgb):
    """Compute WCAG relative luminance from RGB bytes."""
    r, g, b = [_decode(value / 255) for value in rgb]
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def _contrast(first, second):
    """Compute the WCAG contrast ratio between two RGB colors, at full precision."""
    a, b = _luminance(first), _luminance(second)
    return (max(a, b) + 0.05) / (min(a, b) + 0.05)


def _foreground(rgb):
    """Return black or white, whichever contrasts more with ``rgb``. An exact tie selects black."""
    black, white = [0, 0, 0], [255, 255, 255]
    return black if _contrast(rgb, black) >= _contrast(rgb, white) else white


def _formats(rgb):
    """Derive every output representation from canonical RGB bytes.

    HSL and OKLCH are computed from the bytes and rounded to six decimal places.
    Achromatic colors report zero hue and zero chroma.
    """
    r, g, b = rgb
    values = [value / 255 for value in rgb]
    maximum, minimum = max(values), min(values)
    delta = maximum - minimum
    light = (maximum + minimum) / 2
    hue, saturation = 0, 0
    if delta != 0:
        saturation = (maximum - light) / min(light, 1 - light)
        red, green, blue = values
        # Branch order (red, green, blue) decides ties between equal maximum channels.
        if maximum == red:
            hue = (green - blue) / delta + (6 if green < blue else 0)
        elif maximum == green:
            hue = (blue - red) / delta + 2
        else:
            hue = (red - green) / delta + 4
        hue *= 60
    xyz = _multiply(_RGB_TO_XYZ, [_decode(value) for value in values])
    lab = _multiply(_LMS_TO_LAB, [math.cbrt(value) for value in _multiply(_XYZ_TO_LMS, xyz)])
    neutral = r == g == b
    chroma = 0 if neutral else math.sqrt(lab[1] * lab[1] + lab[2] * lab[2])
    ok_hue = 0 if neutral else ((math.atan2(lab[2], lab[1]) * 180 / math.pi) % 360 + 360) % 360
    return {
        "hex": "#" + "".join(f"{value:02x}" for value in rgb),
        "rgb": {"r": r, "g": g, "b": b},
        # A rounded 360 wraps to 0 so hue stays within [0, 360).
        "hsl": {"h": _round6(hue) % 360, "s": _round6(saturation * 100), "l": _round6(light * 100)},
        "oklch": {"l": _round6(lab[0]), "c": _round6(chroma), "h": _round6(ok_hue) % 360},
    }


def _choose(lightness, chroma, hue, background, target):
    """Select the final color for one role, enforcing the contrast target.

    The sampled color is fitted first. If it fails the target, an accent whose
    background cannot reach the target with any sRGB color falls back to the
    better of black and white and reports ``"unattainable-contrast"``.
    Otherwise a search over lightness values ``k / 1000`` for ``k = 0..1000``
    picks the passing candidate nearest to the sampled lightness; an exact
    distance tie chooses the lower lightness.

    Args:
        lightness: Sampled OKLCH lightness.
        chroma: Sampled OKLCH chroma; every candidate is fitted from this value.
        hue: Identity hue in degrees.
        background: Theme background RGB bytes for an accent, or ``None`` for
            a fill, which is measured against its own black/white foreground.
        target: Required WCAG contrast ratio.

    Returns:
        A dict with ``rgb`` and ``metadata`` (a ``ContrastResult``).

    Raises:
        RuntimeError: If no lightness candidate passes for a fill. The
            endpoints guarantee this cannot happen for valid targets.
    """

    def measure(rgb):
        return _contrast(rgb, background if background is not None else _foreground(rgb))

    chosen = _fit(lightness, chroma, hue)
    ratio = measure(chosen["rgb"])
    fallback = None
    if ratio < target:
        if (
            background is not None
            and max(_contrast([0, 0, 0], background), _contrast([255, 255, 255], background))
            < target
        ):
            rgb = _foreground(background)
            chosen = {"rgb": rgb, "lightness": rgb[0] / 255, "chroma": 0}
            ratio = measure(rgb)
            fallback = "unattainable-contrast"
        else:
            best_distance = math.inf
            for k in range(1001):
                candidate_lightness = k / 1000
                distance = abs(candidate_lightness - lightness)
                # Ascending order preserves the lower-lightness candidate on exact ties.
                if distance >= best_distance:
                    continue
                candidate = _fit(candidate_lightness, chroma, hue)
                candidate_ratio = measure(candidate["rgb"])
                if candidate_ratio >= target:
                    chosen, ratio, best_distance = candidate, candidate_ratio, distance
            if best_distance == math.inf:
                raise RuntimeError("Contrast search invariant failed")
    return {
        "rgb": chosen["rgb"],
        "metadata": {
            "ratio": ratio,
            "meetsTarget": ratio >= target,
            "lightnessAdjusted": chosen["lightness"] != lightness,
            "chromaReduced": chosen["chroma"] < chroma,
            "fallback": fallback,
        },
    }


def _text(value, path, code):
    """Validate that ``value`` is a ``str`` containing no surrogate code points.

    Surrogates cannot be encoded as UTF-8. Empty strings and embedded NUL are accepted.
    """
    if not isinstance(value, str):
        raise TextColorError(code, f"{path} must be a string")
    if any(0xD800 <= ord(character) <= 0xDFFF for character in value):
        raise TextColorError(code, f"{path} contains malformed Unicode")
    return value


def _record(value, keys, path):
    """Validate that ``value`` is a ``dict`` whose keys are all in ``keys``."""
    if not isinstance(value, dict):
        raise TextColorError("INVALID_OPTIONS", f"{path} must be an object")
    if any(key not in keys for key in value):
        raise TextColorError("INVALID_OPTIONS", f"{path} contains an unknown option")
    return value


def _number(value):
    """Return whether ``value`` is a finite ``int`` or ``float``.

    ``bool`` is rejected even though it subclasses ``int``. Integers too large
    for a float are rejected rather than raising.
    """
    if type(value) not in (int, float):
        return False
    try:
        return math.isfinite(value)
    except OverflowError:
        return False


def _range(value, maximum, path):
    """Validate an ordered ``[minimum, maximum]`` list within ``0..maximum`` and return a float copy."""
    if (
        not isinstance(value, list)
        or len(value) != 2
        or not all(_number(item) for item in value)
        or not 0 <= value[0] <= value[1] <= maximum
    ):
        raise TextColorError(
            "INVALID_OPTIONS", f"{path} must be [minimum, maximum] within 0..{maximum}"
        )
    return [float(item) for item in value]


def _options(options):
    """Validate caller options and fill in defaults.

    Returns an independent, fully resolved settings dict. Backgrounds are
    parsed to RGB byte lists. The caller's mapping is not modified.
    """
    source = _record(options, ("namespace", "backgrounds", "contrastTarget", "profiles"), "options")
    namespace = _text(source.get("namespace", ""), "namespace", "INVALID_OPTIONS")
    target = source.get("contrastTarget", 4.5)
    if not _number(target) or not 1 <= target <= 21:
        raise TextColorError(
            "INVALID_OPTIONS", "contrastTarget must be a finite number from 1 through 21"
        )
    background_source = _record(source.get("backgrounds", {}), ("light", "dark"), "backgrounds")
    profile_source = _record(source.get("profiles", {}), ("light", "dark"), "profiles")
    backgrounds, profiles = {}, {}
    for theme in ("light", "dark"):
        background = background_source.get(theme, "#ffffff" if theme == "light" else "#121212")
        if (
            not isinstance(background, str)
            or len(background) != 7
            or background[0] != "#"
            or any(character not in "0123456789abcdefABCDEF" for character in background[1:])
        ):
            raise TextColorError("INVALID_OPTIONS", f"backgrounds.{theme} must be opaque #RRGGBB")
        backgrounds[theme] = [int(background[index : index + 2], 16) for index in (1, 3, 5)]
        theme_source = _record(
            profile_source.get(theme, {}), ("fill", "accent"), f"profiles.{theme}"
        )
        profiles[theme] = {}
        for role in ("fill", "accent"):
            path = f"profiles.{theme}.{role}"
            profile = _record(theme_source.get(role, {}), ("lightness", "chroma"), path)
            if theme == "light":
                default_lightness = [0.72, 0.82] if role == "fill" else [0.45, 0.55]
            else:
                default_lightness = [0.4, 0.5] if role == "fill" else [0.72, 0.82]
            profiles[theme][role] = {
                "lightness": _range(
                    profile.get("lightness", default_lightness), 1, f"{path}.lightness"
                ),
                "chroma": _range(profile.get("chroma", [0.1, 0.16]), 0.4, f"{path}.chroma"),
            }
    return {
        "namespace": namespace,
        "backgrounds": backgrounds,
        "contrastTarget": float(target),
        "profiles": profiles,
    }


_OMITTED = object()


def resolve_text_colors(text, options=_OMITTED):
    """Resolve exact text to both themes in every output format.

    This is the untyped implementation behind :func:`texthue.resolve_text_colors`,
    which documents the arguments, return value, and errors.
    """
    _text(text, "text", "INVALID_TEXT")
    settings = _options({} if options is _OMITTED else options)
    namespace_bytes = settings["namespace"].encode("utf-8")
    if len(namespace_bytes) > 0xFFFFFFFF:
        raise TextColorError("INVALID_OPTIONS", "namespace exceeds the v1 byte-length limit")
    # Payload: VERSION, NUL, namespace byte length (uint32 big-endian), namespace, text.
    payload = (
        VERSION.encode("ascii")
        + b"\x00"
        + len(namespace_bytes).to_bytes(4, "big")
        + namespace_bytes
        + text.encode("utf-8")
    )
    digest = hashlib.sha256(payload).digest()
    # The first three big-endian 32-bit digest words become fractions in [0, 1) for hue, lightness, and chroma.
    fractions = [
        int.from_bytes(digest[index : index + 4], "big") / 4294967296 for index in (0, 4, 8)
    ]
    hue = fractions[0] * 360
    result = {"version": VERSION, "hue": hue}
    for theme in ("light", "dark"):
        colors = {}
        for role in ("fill", "accent"):
            profile = settings["profiles"][theme][role]
            lightness = (
                profile["lightness"][0]
                + (profile["lightness"][1] - profile["lightness"][0]) * fractions[1]
            )
            chroma = (
                profile["chroma"][0] + (profile["chroma"][1] - profile["chroma"][0]) * fractions[2]
            )
            # A fill is measured against its own black/white foreground; an accent against the theme background.
            colors[role] = _choose(
                lightness,
                chroma,
                hue,
                settings["backgrounds"][theme] if role == "accent" else None,
                settings["contrastTarget"],
            )
        result[theme] = {
            "background": _formats(settings["backgrounds"][theme]),
            "fill": _formats(colors["fill"]["rgb"]),
            "onFill": _formats(_foreground(colors["fill"]["rgb"])),
            "accent": _formats(colors["accent"]["rgb"]),
            "contrast": {
                "target": settings["contrastTarget"],
                "fill": colors["fill"]["metadata"],
                "accent": colors["accent"]["metadata"],
            },
        }
    return result
