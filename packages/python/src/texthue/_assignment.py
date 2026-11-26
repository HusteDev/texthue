"""Assign colors to a complete collection or extend a caller-owned registry."""

import hashlib
import math
from itertools import combinations, count

from . import _core
from ._models import Assignment, ColorSet
from ._types import AssignedColors

# Machado et al. (2009), full-severity linear sRGB transforms.
_VISION = {
    "protan": (
        (0.152286, 1.052583, -0.204868),
        (0.114503, 0.786281, 0.099216),
        (-0.003882, -0.048116, 1.051998),
    ),
    "deutan": (
        (0.367322, 0.860646, -0.227968),
        (0.280085, 0.672501, 0.047413),
        (-0.011820, 0.042940, 0.968881),
    ),
    "tritan": (
        (1.255528, -0.076749, -0.178779),
        (-0.078411, 0.930809, 0.147602),
        (0.004733, 0.691367, 0.303900),
    ),
}
_SHAPES = ("circle", "square", "triangle", "diamond", "star", "cross", "pentagon", "hexagon")


def _vision_point(rgb, profile):
    channels = (rgb.r, rgb.g, rgb.b)
    if profile != "normal":
        linear = [_core._decode(channel / 255) for channel in channels]
        transformed = _core._multiply(_VISION[profile], linear)
        channels = [math.floor(255 * _core._encode(max(0, min(1, v))) + 0.5) for v in transformed]
    return _core._oklab(channels, _core._RGB_TO_XYZ)


def _place(natural, occupied, separation, size):
    if size <= 8 and occupied:
        best, chosen = -1.0, natural
        for step in range(24):
            hue = (natural + step / 24) % 1
            deltas = (abs(p.hue_fraction - hue) for p in occupied)
            distance = min(min(d, 1 - d) for d in deltas)
            if distance > best:
                best, chosen = distance, hue
        return Assignment(chosen, 0, chosen != natural)

    for ring in count():
        neighbors = [p.hue_fraction for p in occupied if p.ring == ring]
        for index in range(385):
            step = ((index + 1) // 2) * (-1 if index % 2 else 1)
            hue = (natural + step * (separation / 4)) % 1
            distances = (abs(hue - other) for other in neighbors)
            if all(min(d, 1 - d) >= separation for d in distances):
                return Assignment(hue, ring, bool(index or ring))


def assign_collection(texts, pinned, compiled, markers=False, vision=None) -> AssignedColors:
    if type(markers) is not bool:
        raise _core.TextColorError("INVALID_OPTIONS", "markers must be a boolean")
    if vision is not None and (
        not isinstance(vision, (list, tuple))
        or not vision
        or any(profile not in ("normal", *_VISION) for profile in vision)
    ):
        raise _core.TextColorError("INVALID_OPTIONS", "Invalid vision profiles")
    settings, prefix, _ = compiled

    def key(text):
        return settings["normalize"](_core._text(text, "text", "INVALID_TEXT"))

    identities = {text: key(text) for text in texts}
    names = set(identities.values())
    entries = sorted((hashlib.sha256(prefix + name.encode()).digest(), name) for name in names)
    assignments = {}
    for name, p in pinned.items():
        name = key(name)
        if name in assignments:
            raise _core.TextColorError("INVALID_OPTIONS", "Invalid pinned placement")
        assignments[name] = p
    for digest, name in entries:
        _, brand = settings["brand"](name, digest)
        if brand and name not in assignments:
            assignments[name] = Assignment(_core.fixed_fraction(brand["light"]), 0, False)
    size = len(names.union(assignments))
    separation = min(1 / 12, max(1 / 24, 1 / max(size, 1)))
    colors = {}
    points = []
    searches = []

    def render_pair(name, digest, placement):
        palette = ColorSet.from_dict(_core.render(name, *compiled, placement, digest))
        pair = []
        for profile in vision or ("normal",):
            for theme in (palette.light, palette.dark):
                pair.append(_vision_point(theme.fill.rgb, profile))
        return palette, pair

    occupied = [
        render_pair(name, hashlib.sha256(prefix + name.encode()).digest(), placement)[1]
        for name, placement in assignments.items()
    ]

    def score(pair):
        return min(
            (math.dist(a, b) for prior in occupied for a, b in zip(pair, prior, strict=True)),
            default=math.inf,
        )

    for digest, name in entries:
        if name not in assignments:
            natural = int.from_bytes(digest[:4], "big") / 4294967296
            initial = _place(natural, assignments.values(), separation, size)
            placement = initial
            palette, pair = render_pair(name, digest, initial)
            best = score(pair)
            considered = evaluated = 1
            for step in range(1, 24 if vision else 120):
                if best == math.inf or (not vision and best >= 0.04):
                    break
                considered += 1
                hue = (initial.hue_fraction + (step % 24) / 24) % 1
                ring = initial.ring + (step % 5 if vision else step // 24)
                distances = (
                    abs(p.hue_fraction - hue) for p in assignments.values() if p.ring == ring
                )
                if any(min(d, 1 - d) < separation for d in distances):
                    continue
                candidate = Assignment(hue, ring, True)
                evaluated += 1
                c, projected = render_pair(name, digest, candidate)
                distance = score(projected)
                if distance > best:
                    placement, palette, pair, best = candidate, c, projected, distance
            if vision:
                searches.append(
                    {
                        "label": name,
                        "positionsConsidered": considered,
                        "colorsEvaluated": evaluated,
                        "bestDistance": None if best == math.inf else best,
                    }
                )
            assignments[name] = placement
            occupied.append(pair)
        else:
            palette, pair = render_pair(name, digest, assignments[name])
        colors[name] = palette
        points.append(
            (name, _vision_point(palette.light.fill.rgb, "normal") if vision else pair[0])
        )
    minimum = None
    closest = []
    for (first, a), (second, b) in combinations(points, 2):
        distance = math.dist(a, b)
        if minimum is None or distance < minimum:
            minimum, closest = distance, []
        if distance == minimum:
            closest.append([first, second])
    result: AssignedColors = {
        "colors": colors,
        "colorsByInput": {text: colors[name] for text, name in identities.items()},
        "assignments": assignments,
        "report": {
            "minDistance": minimum,
            "closestPairs": closest,
            "withinRingCapacity": size <= 5 * math.floor(1 / separation),
            "distinctFills": len({v.light.fill.hex for v in colors.values()}) == len(colors),
        },
    }
    if markers:
        result["markers"] = {name: _SHAPES[digest[-1] % len(_SHAPES)] for digest, name in entries}
    if vision:
        result["report"]["searches"] = searches
    return result
