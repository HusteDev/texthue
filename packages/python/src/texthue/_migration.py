"""Preview a collection migration using each side's resolver and optional registry."""

import math


def _snapshot(side, labels):
    resolver = side["resolver"]
    pinned = resolver.import_registry(side["registry"]) if "registry" in side else {}
    collection = resolver.assign(labels, pinned=pinned)
    identities = {text: resolver.identity(text) for text in labels}
    collisions = []
    for theme in ("light", "dark"):
        groups = {}
        for key in dict.fromkeys(identities.values()):
            color = getattr(collection["colors"][key], theme).fill.hex
            groups.setdefault(color, []).append(key)
        collisions.extend(
            {"theme": theme, "hex": color, "identities": keys}
            for color, keys in groups.items()
            if len(keys) > 1
        )
    return collection, identities, collisions


def _point(color):
    tone = color["oklch"]
    angle = math.radians(tone["h"])
    return tone["l"], tone["c"] * math.cos(angle), tone["c"] * math.sin(angle)


def compare_assignments(old, new, texts):
    labels = sorted(set(texts))
    left, old_keys, old_collisions = _snapshot(old, labels)
    right, new_keys, new_collisions = _snapshot(new, labels)
    moved, colors, contrast = [], [], []
    for text in labels:
        a, b = old_keys[text], new_keys[text]
        p, q = left["assignments"][a], right["assignments"][b]
        if (a, p.hue_fraction, p.ring) != (b, q.hue_fraction, q.ring):
            moved.append(text)
        for theme in ("light", "dark"):
            before = getattr(left["colors"][a], theme).to_dict()
            after = getattr(right["colors"][b], theme).to_dict()
            for role in (
                "background",
                "subtle",
                "muted",
                "fill",
                "onFill",
                "fillHover",
                "fillActive",
                "border",
                "text",
                "strong",
            ):
                x, y = before[role], after[role]
                if x["hex"] != y["hex"]:
                    colors.append(
                        {
                            "text": text,
                            "theme": theme,
                            "role": role,
                            "before": x["hex"],
                            "after": y["hex"],
                            "deltaE": math.dist(_point(x), _point(y)),
                        }
                    )
            for pair in (
                "fill",
                "fillHover",
                "fillActive",
                "border",
                "text",
                "textOnSubtle",
                "strong",
            ):
                x, y = before["contrast"][pair], after["contrast"][pair]
                if x["ratio"] != y["ratio"] or x["meetsTarget"] != y["meetsTarget"]:
                    contrast.append(
                        {
                            "text": text,
                            "theme": theme,
                            "pair": pair,
                            "before": x["ratio"],
                            "after": y["ratio"],
                            "passedBefore": x["meetsTarget"],
                            "passedAfter": y["meetsTarget"],
                        }
                    )
    return {
        "moved": moved,
        "colors": colors,
        "contrast": contrast,
        "collisions": {"before": old_collisions, "after": new_collisions},
    }
