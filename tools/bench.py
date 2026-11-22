"""Measure full two-theme resolutions on the same label corpus as the JS and Go benches."""

import json
import sys
from pathlib import Path
from statistics import median
from time import perf_counter_ns

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "packages/python/src"))
from texthue import Resolver  # noqa: E402

for scenario, target, light in (
    ("default", 4.5, "#ffffff"),
    ("aaa", 7, "#ffffff"),
    ("maximum", 21, "#ffffff"),
    ("gray", 4.5, "#777777"),
    ("impossible", 21, "#777777"),
):
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
            {"scenario": scenario, "medianUs": median(samples), "p95Us": sorted(samples)[94]}
        )
    )
