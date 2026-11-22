"""Resolve a JSON batch from stdin using the checkout's Python implementation."""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "packages/python/src"))
from texthue import Resolver, import_config  # noqa: E402


def main():
    cases = json.load(sys.stdin.buffer)
    output = []
    for case in cases:
        resolver = (
            import_config(case["config"]) if "config" in case else Resolver(case.get("options", {}))
        )
        output.append(resolver.resolve(case["text"]).to_dict())
    json.dump(output, sys.stdout, allow_nan=False)


if __name__ == "__main__":
    main()
