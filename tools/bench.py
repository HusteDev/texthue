"""Measure full two-theme resolutions on the same label corpus as the JS and Go benches."""

import json
import sys
from pathlib import Path
from statistics import median
from time import perf_counter_ns
from types import SimpleNamespace
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "packages/python/src"))
from texthue import Resolver, _core  # noqa: E402

SCENARIOS = (
    ("default", 4.5, "#ffffff"),
    ("aaa", 7, "#ffffff"),
    ("maximum", 21, "#ffffff"),
    ("gray", 4.5, "#777777"),
    ("impossible", 21, "#777777"),
)


def work_counts(resolver):
    """Count real operations in a separate pass so instrumentation does not skew timings."""
    counts = {"fits": 0, "cusps": 0, "hashes": 0}

    def count(key, operation):
        def measured(*args, **kwargs):
            counts[key] += 1
            return operation(*args, **kwargs)

        return measured

    hash_module = SimpleNamespace(sha256=count("hashes", _core.hashlib.sha256))
    with (
        patch.object(_core, "_fit", count("fits", _core._fit)),
        patch.object(_core, "_cusp", count("cusps", _core._cusp)),
        patch.object(_core, "hashlib", hash_module),
    ):
        for index in range(100):
            resolver.resolve(f"item:{index}")
    return counts


def main():
    for scenario, target, light in SCENARIOS:
        resolver = Resolver({"contrastTarget": target, "backgrounds": {"light": light}})
        samples = []
        for i in range(-20, 100):
            label = f"item:{i}"
            start = perf_counter_ns()
            resolver.resolve(label)
            elapsed = perf_counter_ns() - start
            if i >= 0:
                samples.append(elapsed / 1000)
        print(
            json.dumps(
                {
                    "scenario": scenario,
                    "medianUs": median(samples),
                    "p95Us": sorted(samples)[94],
                    "workPer100Labels": work_counts(resolver),
                }
            )
        )


if __name__ == "__main__":
    main()
