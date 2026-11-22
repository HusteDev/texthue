"""Assign colors to a complete collection or extend a caller-owned registry."""

import hashlib
import math
from itertools import combinations, count

from . import _core
from ._models import Assignment, ColorSet


def _place(natural, occupied, separation):
    for ring in count():
        neighbors = [p.hue_fraction for p in occupied if p.ring == ring]
        for index in range(385):
            step = ((index + 1) // 2) * (-1 if index % 2 else 1)
            hue = (natural + step * (separation / 4)) % 1
            distances = (abs(hue - other) for other in neighbors)
            if all(min(d, 1 - d) >= separation for d in distances):
                return Assignment(hue, ring, bool(index or ring))


def assign_collection(texts, pinned, compiled):
    settings, prefix, _ = compiled

    def key(text):
        return settings["normalize"](_core._text(text, "text", "INVALID_TEXT"))

    names = {key(text) for text in texts}
    entries = sorted((hashlib.sha256(prefix + name.encode()).digest(), name) for name in names)
    assignments = {}
    for name, value in pinned.items():
        name = key(name)
        p = value if isinstance(value, Assignment) else Assignment.from_dict(value)
        if (
            name in assignments
            or not 0 <= p.hue_fraction < 1
            or type(p.ring) is not int
            or p.ring < 0
            or type(p.moved) is not bool
        ):
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
    for digest, name in entries:
        if name not in assignments:
            natural = int.from_bytes(digest[:4], "big") / 4294967296
            assignments[name] = _place(natural, assignments.values(), separation)
        colors[name] = ColorSet.from_dict(_core.render(name, *compiled, assignments[name], digest))
        rgb = colors[name].light.fill.rgb
        points.append((name, _core._oklab((rgb.r, rgb.g, rgb.b), _core._RGB_TO_XYZ)))
    minimum = None
    closest = []
    for (first, a), (second, b) in combinations(points, 2):
        distance = math.dist(a, b)
        if minimum is None or distance < minimum:
            minimum, closest = distance, []
        if distance == minimum:
            closest.append([first, second])
    return {
        "colors": colors,
        "assignments": assignments,
        "report": {
            "minDistance": minimum,
            "closestPairs": closest,
            "withinRingCapacity": size <= 5 * math.floor(1 / separation),
            "distinctFills": len({v.light.fill.hex for v in colors.values()}) == len(colors),
        },
    }
