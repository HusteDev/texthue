"""Implementation of the ``text-to-color-v1`` algorithm.

Conversion equations and matrices are taken from W3C CSS Color 4
(1 September 2026); see THIRD_PARTY_NOTICES.md. The order of floating-point
operations is part of the algorithm contract and must not change.

This module is private. Use :func:`texthue.resolve_text_colors`.
"""

import hashlib
import math
import re
import unicodedata

from ._tables import ANCHORS, BIASES

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


_XYZ_TO_P3 = [
    [446124 / 178915, -333277 / 357830, -72051 / 178915],
    [-14852 / 17905, 63121 / 35810, 423 / 17905],
    [11844 / 330415, -50337 / 660830, 316169 / 330415],
]
_P3_TO_XYZ = [
    [608311 / 1250200, 189793 / 714400, 198249 / 1000160],
    [35783 / 156275, 247089 / 357200, 198249 / 2500400],
    [0 / 1, 32229 / 714400, 5220557 / 5000800],
]


def _linear(lightness, chroma, hue, target=_XYZ_TO_RGB):
    """Convert OKLCH to linear sRGB without clamping.

    Channels outside ``[0, 1]`` indicate a color outside the sRGB gamut.
    """
    angle = hue * math.pi / 180
    lab = [lightness, chroma * math.cos(angle), chroma * math.sin(angle)]
    lms = [value * value * value for value in _multiply(_LAB_TO_LMS, lab)]
    return _multiply(target, _multiply(_LMS_TO_XYZ, lms))


def _inside(rgb):
    """Return whether every linear channel lies within the sRGB gamut, allowing ``1e-12`` of residue."""
    return all(-1e-12 <= value <= 1 + 1e-12 for value in rgb)


def _cusp(lightness, hue, target=_XYZ_TO_RGB):
    if lightness in (0, 1):
        return 0
    low, high = 0, 0.4
    for _ in range(20):
        mid = (low + high) / 2
        if _inside(_linear(lightness, mid, hue, target)):
            low = mid
        else:
            high = mid
    return low


def _fit(lightness, chroma, hue, target=_XYZ_TO_RGB):
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
    linear = _linear(lightness, retained, hue, target)
    if not _inside(linear):
        low, high = 0, chroma
        for _ in range(24):
            mid = (low + high) / 2
            if _inside(_linear(lightness, mid, hue, target)):
                low = mid
            else:
                high = mid
        retained = low
        linear = _linear(lightness, retained, hue, target)
    rgb = [math.floor(_encode(max(0, min(1, value))) * 255 + 0.5) for value in linear]
    return {"rgb": rgb, "chroma": retained, "lightness": lightness}


def _luminance(rgb, weights=(0.2126, 0.7152, 0.0722)):
    """Compute WCAG relative luminance from RGB bytes."""
    r, g, b = [_decode(value / 255) for value in rgb]
    return weights[0] * r + weights[1] * g + weights[2] * b


def _contrast(first, second, weights=(0.2126, 0.7152, 0.0722)):
    """Compute the WCAG contrast ratio between two RGB colors, at full precision."""
    a, b = _luminance(first, weights), _luminance(second, weights)
    return (max(a, b) + 0.05) / (min(a, b) + 0.05)


def _foreground(rgb):
    """Return black or white, whichever contrasts more with ``rgb``. An exact tie selects black."""
    black, white = [0, 0, 0], [255, 255, 255]
    return black if _contrast(rgb, black) >= _contrast(rgb, white) else white


def _oklab(rgb, matrix):
    xyz = _multiply(matrix, [_decode(channel / 255) for channel in rgb])
    return _multiply(_LMS_TO_LAB, [math.cbrt(value) for value in _multiply(_XYZ_TO_LMS, xyz)])


def _oklch(rgb, matrix):
    lab = _oklab(rgb, matrix)
    neutral = rgb[0] == rgb[1] == rgb[2]
    chroma = 0 if neutral else math.sqrt(lab[1] * lab[1] + lab[2] * lab[2])
    ok_hue = 0 if neutral else ((math.atan2(lab[2], lab[1]) * 180 / math.pi) % 360 + 360) % 360
    return {"l": _round6(lab[0]), "c": _round6(chroma), "h": _round6(ok_hue) % 360}


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
    return {
        "hex": "#" + "".join(f"{value:02x}" for value in rgb),
        "rgb": {"r": r, "g": g, "b": b},
        # A rounded 360 wraps to 0 so hue stays within [0, 360).
        "hsl": {"h": _round6(hue) % 360, "s": _round6(saturation * 100), "l": _round6(light * 100)},
        "oklch": _oklch(rgb, _RGB_TO_XYZ),
    }


def _choose(
    lightness,
    chroma,
    hue,
    background,
    target,
    second=None,
    second_target=None,
    select=None,
    apca=False,
    surface=False,
    wide=False,
):
    """Fit the sampled tone, then repair failing contrast on the 1/4096 lightness grid.

    Both endpoints are evaluated in the selected gamut. Search each passing side
    and keep the closer candidate, with lower lightness winning a distance tie.
    """
    matrix = _XYZ_TO_P3 if wide else _XYZ_TO_RGB
    contrast = _p3_contrast if wide else _contrast
    metric = (_p3_apca_contrast if wide else _apca_contrast) if apca else contrast
    primary_target = target
    if apca and target == 0 and second is not None:
        target = second_target

    def measure(rgb):
        if apca or wide:
            backdrop = background if background is not None else select(rgb, primary_target)
            primary = abs(
                metric(backdrop, rgb) if surface or background is None else metric(rgb, backdrop)
            )
            if second is None or not second_target:
                return primary
            secondary = abs(metric(rgb, second))
            return (
                min(primary, secondary * (primary_target / second_target))
                if primary_target
                else secondary
            )
        ratio = _contrast(
            rgb,
            (
                background
                if background is not None
                else (select(rgb, target) if select else _foreground(rgb))
            ),
        )
        return (
            min(ratio, _contrast(rgb, second) * (target / (second_target or target)))
            if second is not None
            else ratio
        )

    chosen = _fit(lightness, chroma, hue, matrix)
    ratio = measure(chosen["rgb"])
    fallback = None
    if ratio < target:
        if max(measure([0, 0, 0]), measure([255, 255, 255])) < target:
            rgb = max(([0, 0, 0], [255, 255, 255]), key=measure)
            chosen = {"rgb": rgb, "lightness": rgb[0] / 255, "chroma": 0}
            ratio = measure(rgb)
            fallback = "unattainable-contrast"
        else:
            best_distance = math.inf
            for endpoint in (0, 4096):
                passing = endpoint
                failing = (
                    math.ceil(lightness * 4096) if endpoint == 0 else math.floor(lightness * 4096)
                )
                candidate = _fit(passing / 4096, chroma, hue, matrix)
                score = measure(candidate["rgb"])
                if score < target:
                    continue
                while abs(passing - failing) > 1:
                    mid = (passing + failing) // 2
                    probe = _fit(mid / 4096, chroma, hue, matrix)
                    measured = measure(probe["rgb"])
                    if measured >= target:
                        passing, candidate, score = mid, probe, measured
                    else:
                        failing = mid
                distance = abs(candidate["lightness"] - lightness)
                if distance < best_distance:
                    chosen, ratio, best_distance = candidate, score, distance
            if best_distance == math.inf:
                raise RuntimeError("Contrast search invariant failed")
    return {
        "rgb": chosen["rgb"],
        "fitted": chosen,
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


_SPACE = (
    "\u0009\u000a\u000b\u000c\u000d \u0085\u00a0\u1680"
    + "".join(chr(i) for i in range(0x2000, 0x200B))
    + "\u2028\u2029\u202f\u205f\u3000"
)
_SPACE_RUN = re.compile(f"[{_SPACE}]+")


def _normalizer(rules):
    rules = _record(rules, ("unicode", "case", "whitespace"), "normalize")
    form, casing, space = (rules.get(key, "none") for key in ("unicode", "case", "whitespace"))
    if (
        form not in ("none", "NFC", "NFKC")
        or casing not in ("none", "lower")
        or space not in ("none", "trim", "collapse")
    ):
        raise TextColorError("INVALID_OPTIONS", "invalid normalization rule")

    def normalize(text):
        if form != "none":
            text = unicodedata.normalize(form, text)
        if casing == "lower":
            text = text.lower()
        if space != "none":
            text = text.strip(_SPACE)
        if space == "collapse":
            text = _SPACE_RUN.sub(" ", text)
        return text

    return normalize


def _hue_domain(allowed, excluded):
    def split(arc):
        if (
            not isinstance(arc, list)
            or len(arc) != 2
            or not all(_number(x) and 0 <= x <= 360 for x in arc)
        ):
            raise TextColorError("INVALID_OPTIONS", "invalid hue interval")
        a, b = arc
        return [(a, b)] if a <= b else [(0, b), (a, 360)]

    if not isinstance(excluded, list) or len(excluded) > 16:
        raise TextColorError("INVALID_OPTIONS", "invalid excluded hues")
    segments = split(allowed)
    for interval in excluded:
        for a, b in split(interval):
            segments = [
                part
                for lo, hi in segments
                for part in ((lo, min(hi, a)), (max(lo, b), hi))
                if part[0] < part[1]
            ]
    total = sum(hi - lo for lo, hi in segments)
    if not total:
        raise TextColorError("INVALID_OPTIONS", "empty hue domain")

    def remap(hue):
        if total == 360:
            return hue
        distance = hue / 360 * total
        for lo, hi in segments:
            if distance < hi - lo:
                return lo + distance
            distance -= hi - lo
        return segments[0][0]

    return remap


def _options(options):
    """Validate caller options and fill in defaults.

    Returns an independent, fully resolved settings dict. Backgrounds are
    parsed to RGB byte lists. The caller's mapping is not modified.
    """
    source = _record(
        options,
        (
            "overrides",
            "palette",
            "foregrounds",
            "foregroundPolicy",
            "contrastModel",
            "gamut",
            "preset",
            "hueRange",
            "excludeHues",
            "normalize",
            "namespace",
            "seed",
            "contrastTargets",
            "backgrounds",
            "contrastTarget",
            "profiles",
        ),
        "options",
    )
    model = source.get("contrastModel", "wcag2")
    if model not in ("wcag2", "apca"):
        raise TextColorError("INVALID_OPTIONS", "Unknown contrast model")
    apca = model == "apca"
    gamut = source.get("gamut", "srgb")
    if gamut not in ("srgb", "display-p3"):
        raise TextColorError("INVALID_OPTIONS", "Unknown gamut")
    wide = gamut == "display-p3"

    def canonical(rgb):
        return [v * 255 for v in _srgb_to_p3(rgb, full_precision=True)] if wide else rgb

    contrast = _p3_contrast if wide else _contrast
    measure = (_p3_apca_contrast if wide else _apca_contrast) if apca else contrast
    low, high = (0, 106) if apca else (1, 21)
    normalize = _normalizer(source.get("normalize", {}))
    namespace = _text(source.get("namespace", ""), "namespace", "INVALID_OPTIONS")
    candidates = source.get("foregrounds", ["#000000", "#ffffff"])
    policy = source.get("foregroundPolicy", "best")
    if (
        not isinstance(candidates, list)
        or not candidates
        or policy not in ("best", "first-passing")
    ):
        raise TextColorError("INVALID_OPTIONS", "Invalid foreground list or policy")
    colors = []
    for hex_value in candidates:
        if not isinstance(hex_value, str) or not re.fullmatch(r"#[0-9a-fA-F]{6}", hex_value):
            raise TextColorError("INVALID_OPTIONS", "Invalid foreground color")
        colors.append([int(hex_value[i : i + 2], 16) for i in (1, 3, 5)])

    canonical_colors = [canonical(c) for c in colors]

    def select_foreground(rgb, target):
        selected, best = canonical_colors[0], -1
        for candidate in canonical_colors:
            ratio = abs(measure(candidate, rgb))
            if policy == "first-passing" and ratio >= target:
                return candidate
            if ratio > best:
                selected, best = candidate, ratio
        return selected

    preset = source.get("preset", "labels")
    if preset not in ("labels", "controls", "chart", "subdued", "mono"):
        raise TextColorError("INVALID_OPTIONS", "Unknown preset")
    scale = {"mono": [0, 0], "subdued": [0.2, 0.4], "chart": [0.8, 1]}.get(preset, [0.6, 0.8])
    seed = source.get("seed", 0)
    if not _number(seed) or not 0 <= seed <= 0xFFFFFFFF or int(seed) != seed:
        raise TextColorError("INVALID_OPTIONS", "seed must be uint32")
    target = source.get("contrastTarget", 60 if apca else 7 if preset == "controls" else 4.5)
    if not _number(target) or not low <= target <= high:
        raise TextColorError("INVALID_OPTIONS", "contrastTarget outside selected model range")
    roles = ("fill", "fillHover", "fillActive", "border", "text", "textOnSubtle", "strong")
    overrides = _record(source.get("contrastTargets", {}), roles, "contrastTargets")
    targets = {
        role: overrides.get(role, min(3, target) if role == "border" and not apca else target)
        for role in roles
    }
    if any(not _number(v) or not low <= v <= high for v in targets.values()):
        raise TextColorError("INVALID_OPTIONS", "invalid contrastTargets")
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
        theme_source = _record(profile_source.get(theme, {}), ("fill", "text"), f"profiles.{theme}")
        profiles[theme] = {}
        for role in ("fill", "text"):
            path = f"profiles.{theme}.{role}"
            profile = _record(
                theme_source.get(role, {}), ("lightness", "chromaScale", "chromaCap"), path
            )
            if theme == "light":
                default_lightness = [0.72, 0.82] if role == "fill" else [0.43, 0.53]
            else:
                default_lightness = [0.4, 0.5] if role == "fill" else [0.72, 0.82]
            cap = profile.get("chromaCap", 0.16 if role == "fill" else 0.19)
            if not _number(cap) or not 0 <= cap <= 0.4:
                raise TextColorError("INVALID_OPTIONS", "invalid chromaCap")
            profiles[theme][role] = {
                "lightness": _range(
                    profile.get("lightness", default_lightness), 1, f"{path}.lightness"
                ),
                "chromaScale": _range(profile.get("chromaScale", scale), 1, f"{path}.chromaScale"),
                "chromaCap": cap,
            }

    def parse_hex(value):
        if not isinstance(value, str) or not re.fullmatch(r"#[0-9a-fA-F]{6}", value):
            raise TextColorError("INVALID_OPTIONS", "Invalid brand hex")
        return [int(value[i : i + 2], 16) for i in (1, 3, 5)]

    pairs = {}
    overrides = source.get("overrides", {})
    if not isinstance(overrides, dict):
        raise TextColorError("INVALID_OPTIONS", "Invalid overrides")
    for key, value in overrides.items():
        name = normalize(_text(key, "overrides", "INVALID_OPTIONS"))
        if name in pairs:
            raise TextColorError("INVALID_OPTIONS", "Duplicate normalized override")
        pair = (
            {"light": value, "dark": value}
            if isinstance(value, str)
            else _record(value, ("light", "dark"), "override")
        )
        pairs[name] = {k: parse_hex(pair.get(k)) for k in ("light", "dark")}
    raw_palette = source.get("palette", [])
    if not isinstance(raw_palette, list) or ("palette" in source and not raw_palette):
        raise TextColorError("INVALID_OPTIONS", "Empty palette")
    palette = {}
    for value in raw_palette:
        entry = _record(value, ("id", "light", "dark"), "palette")
        ident = _text(entry.get("id"), "palette.id", "INVALID_OPTIONS").encode()
        if ident in palette:
            raise TextColorError("INVALID_OPTIONS", "Duplicate palette ID")
        pair = {
            "light": parse_hex(entry.get("light", entry.get("dark"))),
            "dark": parse_hex(entry.get("dark", entry.get("light"))),
        }
        passing = all(
            abs(measure(select_foreground(rgb, targets["fill"]), rgb)) >= targets["fill"]
            for rgb in map(canonical, pair.values())
        )
        palette[ident] = (passing, pair)

    def brand(name, digest):
        if name in pairs:
            return "override", pairs[name]
        if palette:
            ident = max(palette, key=lambda i: (palette[i][0], hashlib.sha256(digest + i).digest()))
            return "palette", palette[ident][1]
        return None, None

    domain = _hue_domain(source.get("hueRange", [0, 360]), source.get("excludeHues", []))

    def hex_color(rgb):
        return "#" + bytes(rgb).hex()

    expanded = {
        "preset": preset,
        "seed": int(seed),
        "namespace": namespace,
        "hueRange": list(source.get("hueRange", [0, 360])),
        "excludeHues": sorted(list(arc) for arc in source.get("excludeHues", [])),
        "normalize": {
            key: source.get("normalize", {}).get(key, "none")
            for key in ("unicode", "case", "whitespace")
        },
        "foregroundPolicy": policy,
        "foregrounds": [hex_color(c) for c in colors],
        "contrastTarget": target,
        "contrastTargets": targets,
        "profiles": profiles,
        "backgrounds": {theme: hex_color(rgb) for theme, rgb in backgrounds.items()},
        "overrides": {
            key: {theme: hex_color(rgb) for theme, rgb in pairs[normalize(key)].items()}
            for key in overrides
        },
    }
    if wide:
        expanded["gamut"] = gamut
    if apca:
        expanded["contrastModel"] = model
    if palette:
        expanded["palette"] = [
            {"id": ident.decode(), **{k: hex_color(rgb) for k, rgb in palette[ident][1].items()}}
            for ident in sorted(palette)
        ]

    return {
        "wide": wide,
        "canonical": canonical,
        "measure": measure,
        "contrast": contrast,
        "formats": _p3_formats if wide else _formats,
        "exportOptions": expanded,
        "apca": apca,
        "brand": brand,
        "selectForeground": select_foreground,
        "namespace": normalize(namespace),
        "hueDomain": domain,
        "normalize": normalize,
        "seed": int(seed),
        "targets": targets,
        "backgrounds": {theme: canonical(rgb) for theme, rgb in backgrounds.items()},
        "contrastTarget": float(target),
        "profiles": profiles,
    }


def compile_settings(options):
    settings = _options(options)
    namespace_bytes = settings["namespace"].encode("utf-8")
    if len(namespace_bytes) > 0xFFFFFFFF:
        raise TextColorError("INVALID_OPTIONS", "namespace exceeds the v1 byte-length limit")
    # Payload: VERSION, NUL, namespace byte length (uint32 big-endian), namespace, text.
    prefix = (
        VERSION.encode("ascii")
        + b"\x00"
        + settings["seed"].to_bytes(4, "big")
        + len(namespace_bytes).to_bytes(4, "big")
        + namespace_bytes
    )
    bases = {theme: settings["formats"](rgb) for theme, rgb in settings["backgrounds"].items()}
    return settings, prefix, bases


def fixed_fraction(rgb):
    hue = (math.floor(_formats(rgb)["oklch"]["h"] * 1024 + 0.5) / 1024) % 360
    angle = hue + 360 if hue < ANCHORS[0] else hue
    i = next(index for index, value in enumerate(ANCHORS) if value > angle) - 1
    return (i + (angle - ANCHORS[i]) / (ANCHORS[i + 1] - ANCHORS[i])) / 12


def render(
    text,
    settings,
    prefix,
    bases,
    placement=None,
    digest=None,
    *,
    trace=False,
    themes=("light", "dark"),
):
    _text(text, "text", "INVALID_TEXT")
    if digest is None:
        digest = hashlib.sha256(prefix + settings["normalize"](text).encode("utf-8")).digest()
    # The first three big-endian 32-bit digest words become fractions in [0, 1) for hue, lightness, and chroma.
    fractions = [
        int.from_bytes(digest[index : index + 4], "big") / 4294967296 for index in (0, 4, 8)
    ]
    ring = placement.ring % 5 if placement else 0
    offset = (0, 0.08, -0.08, 0.16, -0.16)[ring]
    hue_fraction = placement.hue_fraction if placement else fractions[0]
    position = hue_fraction * 12
    index = int(position)
    hue = (ANCHORS[index] + (ANCHORS[index + 1] - ANCHORS[index]) * (position - index)) % 360
    hue = settings["hueDomain"](hue)
    name = text if placement else settings["normalize"](text)
    source, brand = settings["brand"](name, digest)

    def snapped(rgb):
        return (math.floor(_formats(rgb)["oklch"]["h"] * 1024 + 0.5) / 1024) % 360

    natural_hue = hue
    if brand:
        fractions[1:3] = [0.5, 0.5]
    result = {
        "version": VERSION,
        "source": source or ("assigned" if placement else "hash"),
        "hue": snapped(brand["light"]) if brand else hue,
        "hueFraction": fixed_fraction(brand["light"]) if brand else hue_fraction,
    }
    for theme in themes:
        background = settings["backgrounds"][theme]
        base = bases[theme]
        lb = math.floor(base["oklch"]["l"] * 4096 + 0.5) / 4096
        hue = snapped(brand[theme]) if brand else natural_hue
        direction = -1 if theme == "light" else 1

        def sample(role, theme=theme, hue=hue):
            profile = settings["profiles"][theme][role]
            low, high = profile["lightness"]
            bias = BIASES[(0 if theme == "light" else 2) + (0 if role == "fill" else 1)]
            segment = int(hue / 30)
            correction = bias[segment] + (bias[(segment + 1) % 12] - bias[segment]) * (
                hue / 30 - segment
            )
            sampled = low + (high - low) * fractions[1]
            lightness = max(0, min(1, sampled + correction + offset))
            low, high = profile["chromaScale"]
            return (
                lightness,
                (low + (high - low) * fractions[2]) * (1 if ring < 3 else 0.6),
                profile["chromaCap"],
                sampled,
            )

        def tone(
            lightness,
            profile,
            backdrop,
            target,
            second=None,
            second_target=None,
            surface=False,
            requested=None,
            hue=hue,
        ):
            lightness = max(0, min(1, lightness))
            chroma = (
                _cusp(lightness, hue, _XYZ_TO_P3 if settings["wide"] else _XYZ_TO_RGB) * profile[1]
            )
            value = _choose(
                lightness,
                min(chroma, profile[2]),
                hue,
                backdrop,
                target,
                second,
                second_target,
                settings["selectForeground"],
                settings["apca"],
                surface,
                settings["wide"],
            )
            if trace:
                raw = lightness if requested is None else max(0, min(1, requested))
                capped = min(chroma, profile[2])
                fitted = value["fitted"]
                value["trace"] = {
                    "source": "generated",
                    "requested": {
                        "l": raw,
                        "c": _cusp(raw, hue, _XYZ_TO_P3 if settings["wide"] else _XYZ_TO_RGB)
                        * profile[1],
                        "h": hue,
                    },
                    "biased": {"l": lightness, "c": capped, "h": hue},
                    "repaired": {"l": fitted["lightness"], "c": capped, "h": hue},
                    "fitted": {"l": fitted["lightness"], "c": fitted["chroma"], "h": hue},
                }
            value["metadata"]["chromaCapped"] = chroma > profile[2]
            return value

        fp, tp = sample("fill"), sample("text")
        if brand:
            fixed = _formats(brand[theme])["oklch"]
            fixed_l = math.floor(fixed["l"] * 4096 + 0.5) / 4096
            fp = (fixed_l, fp[1], fp[2] if fixed["c"] else 0, fixed_l)
            if not fixed["c"]:
                tp = (tp[0], tp[1], 0, tp[3])
        target = settings["contrastTarget"]
        targets = settings["targets"]
        subtle = tone(lb + direction * 0.04, fp, None, 0 if settings["apca"] else 1)
        muted = tone(lb + direction * 0.10, fp, None, 0 if settings["apca"] else 1)
        fill = tone(fp[0], fp, None, targets["fill"], requested=fp[3])
        if brand:
            fill["rgb"] = settings["canonical"](brand[theme])
        on_fill = settings["selectForeground"](fill["rgb"], targets["fill"])
        if brand:
            ratio = abs(settings["measure"](on_fill, fill["rgb"]))
            fill["metadata"] = {
                "ratio": ratio,
                "meetsTarget": ratio >= targets["fill"],
                "lightnessAdjusted": False,
                "chromaReduced": False,
                "chromaCapped": False,
                "fallback": "palette-constraint" if ratio < targets["fill"] else None,
            }
        colors = {
            "subtle": subtle,
            "muted": muted,
            "fill": fill,
            "fillHover": tone(
                fp[0] + direction * 0.025,
                fp,
                on_fill,
                targets["fillHover"],
                surface=True,
                requested=fp[3] + direction * 0.025,
            ),
            "fillActive": tone(
                fp[0] + direction * 0.05,
                fp,
                on_fill,
                targets["fillActive"],
                surface=True,
                requested=fp[3] + direction * 0.05,
            ),
            "border": tone(lb + direction * 0.39, fp, background, targets["border"]),
            "text": tone(
                tp[0],
                tp,
                background,
                targets["text"],
                subtle["rgb"],
                targets["textOnSubtle"],
                requested=tp[3],
            ),
            "strong": tone(
                tp[0] + direction * 0.10,
                tp,
                background,
                targets["strong"],
                requested=tp[3] + direction * 0.10,
            ),
        }
        meta = {k: v["metadata"] for k, v in colors.items() if k not in ("subtle", "muted")}
        for name, backdrop in (("text", background), ("textOnSubtle", subtle["rgb"])):
            ratio = settings["contrast"](colors["text"]["rgb"], backdrop)
            meta[name] = {
                **colors["text"]["metadata"],
                "ratio": ratio,
                "meetsTarget": ratio >= targets[name],
            }
        if settings["apca"]:
            for name, item in meta.items():
                if name in ("fill", "fillHover", "fillActive"):
                    front, back = on_fill, colors[name]["rgb"]
                elif name == "textOnSubtle":
                    front, back = colors["text"]["rgb"], subtle["rgb"]
                else:
                    front, back = colors[name]["rgb"], background
                value = settings["measure"](front, back)
                item.update(
                    model="apca",
                    value=value,
                    ratio=settings["contrast"](front, back),
                    meetsTarget=abs(value) >= targets[name],
                )
        result[theme] = {
            **{k: settings["formats"](v["rgb"]) for k, v in colors.items()},
            "background": base,
            "onFill": settings["formats"](on_fill),
            "contrast": {"target": target, **meta},
        }
        if trace:
            result[theme]["background"] = dict(base)
            for role in (*colors, "background", "onFill"):
                fixed_input = role in ("background", "onFill") or (brand and role == "fill")
                result[theme][role]["trace"] = (
                    {"source": "supplied", "hex": result[theme][role]["hex"]}
                    if fixed_input
                    else colors[role]["trace"]
                )
    return result


def _apca_contrast(text, background, weights=(0.2126729, 0.7151522, 0.0721750)):
    """Signed APCA-W3 0.1.9 Lc of two opaque sRGB byte triples, text first."""

    def luminance(rgb):
        r, g, b = (channel / 255 for channel in rgb)
        y = weights[0] * r**2.4 + weights[1] * g**2.4 + weights[2] * b**2.4
        return y + (0.022 - y) ** 1.414 if y < 0.022 else y

    fg, bg = luminance(text), luminance(background)
    if abs(fg - bg) < 0.0005:
        return 0.0
    positive = bg > fg
    raw = 1.14 * (bg ** (0.56 if positive else 0.65) - fg ** (0.57 if positive else 0.62))
    if abs(raw) < 0.1:
        return 0.0
    return 100 * (raw - (0.027 if positive else -0.027))


def _p3_fallback(rgb):
    xyz = _multiply(_P3_TO_XYZ, [_decode(v / 255) for v in rgb])
    linear = _multiply(_XYZ_TO_RGB, xyz)
    return [math.floor(255 * _encode(max(0, min(1, v))) + 0.5) for v in linear], not _inside(linear)


def _srgb_to_p3(rgb, full_precision=False):
    xyz = _multiply(_RGB_TO_XYZ, [_decode(v / 255) for v in rgb])
    channels = [_encode(max(0, min(1, v))) for v in _multiply(_XYZ_TO_P3, xyz)]
    return channels if full_precision else list(map(_round6, channels))


def _p3_contrast(text, background):
    return _contrast(text, background, _P3_TO_XYZ[1])


def _p3_apca_contrast(text, background):
    return _apca_contrast(
        text, background, (0.2289829594805780, 0.6917492625852380, 0.0792677779341829)
    )


def _p3_formats(rgb):
    fallback, clipped = _p3_fallback(rgb)
    channels = [_round6(v / 255) for v in rgb]
    css = "color(display-p3 " + " ".join(f"{v:.6f}".rstrip("0").rstrip(".") for v in channels) + ")"
    return {
        **_formats(fallback),
        "oklch": _oklch(rgb, _P3_TO_XYZ),
        "p3": dict(zip("rgb", channels, strict=True)),
        "css": css,
        "srgbClipped": clipped,
    }
