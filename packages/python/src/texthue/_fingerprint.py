"""Canonical binary fingerprint for an expanded TextHue configuration."""

import hashlib
import math
import struct


def fingerprint(value, domain="texthue-config-v1"):
    digest = hashlib.sha256(domain.encode("ascii") + b"\0")

    def count(size):
        digest.update(struct.pack(">I", size))

    def write(item):
        if type(item) in (int, float) and math.isfinite(item):
            digest.update(b"\x01" + struct.pack(">d", item or 0))
        elif isinstance(item, str):
            data = item.encode("utf-8")
            digest.update(b"\x02")
            count(len(data))
            digest.update(data)
        elif isinstance(item, list):
            digest.update(b"\x03")
            count(len(item))
            for child in item:
                write(child)
        elif isinstance(item, dict):
            digest.update(b"\x04")
            count(len(item))
            for key in sorted(item, key=lambda key: key.encode("utf-8")):
                write(key)
                write(item[key])
        else:
            raise ValueError("Unsupported configuration value")

    write(value)
    return digest.hexdigest()


def behavior_fingerprint(algorithm, settings):
    options = settings["exportOptions"]
    fields = (
        "seed",
        "normalize",
        "contrastTarget",
        "contrastTargets",
        "profiles",
        "backgrounds",
        "foregroundPolicy",
        "foregrounds",
        "gamut",
        "contrastModel",
        "palette",
        "paletteMode",
    )
    behavior = {key: options[key] for key in fields if key in options}
    normalize = settings["normalize"]
    behavior["namespace"] = settings["namespace"]
    behavior["overrides"] = {normalize(key): pair for key, pair in options["overrides"].items()}
    behavior["hueSegments"] = settings["hueSegments"]
    merged = []
    for lo, hi in sorted(settings["excludedArcs"]):
        if merged and lo <= merged[-1][1]:
            merged[-1][1] = max(hi, merged[-1][1])
        else:
            merged.append([lo, hi])
    behavior["excludeHues"] = merged
    return fingerprint({"algorithm": algorithm, "behavior": behavior}, "texthue-behavior-v1")
