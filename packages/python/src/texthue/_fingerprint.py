"""Canonical binary fingerprint for an expanded TextHue configuration."""

import hashlib
import math
import struct


def fingerprint(value):
    digest = hashlib.sha256(b"texthue-config-v1\0")

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
