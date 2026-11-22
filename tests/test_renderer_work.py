"""Bound Python renderer work independently of wall-clock timings."""

import runpy
import unittest
from pathlib import Path
from unittest.mock import patch

BENCH = runpy.run_path(str(Path(__file__).resolve().parents[1] / "tools/bench.py"))


class RendererWorkTests(unittest.TestCase):
    def test_contrast_work_budgets(self):
        limits = {"default": 1600, "aaa": 5732, "maximum": 12725, "gray": 2868, "impossible": 11452}
        for name, target, light in BENCH["SCENARIOS"]:
            with self.subTest(scenario=name):
                resolver = BENCH["Resolver"](
                    {"contrastTarget": target, "backgrounds": {"light": light}}
                )
                counts = BENCH["work_counts"](resolver)
                self.assertGreater(counts["fits"], 0)
                self.assertLessEqual(counts["fits"], limits[name])
                self.assertGreater(counts["cusps"], 0)
                self.assertLessEqual(counts["cusps"], 1600)
                self.assertEqual(counts["hashes"], 100)

    def test_individual_tone_work_limits(self):
        core = BENCH["_core"]
        choose = core._choose
        cusp = core._cusp
        cusp_conversions = 0
        observed = set()

        def count_cusp(*args):
            nonlocal cusp_conversions
            with patch.object(core, "_linear", wraps=core._linear) as conversions:
                boundary = cusp(*args)
            cusp_conversions = conversions.call_count
            return boundary

        def check_tone(*args):
            with (
                patch.object(core, "_fit", wraps=core._fit) as fits,
                patch.object(core, "_linear", wraps=core._linear) as conversions,
            ):
                result = choose(*args)
            adjusted = result["metadata"]["lightnessAdjusted"]
            observed.add(adjusted)
            if adjusted:
                self.assertLessEqual(fits.call_count, 26)
            else:
                self.assertEqual(fits.call_count, 1)
                self.assertLessEqual(cusp_conversions + conversions.call_count, 21)
            return result

        with patch.object(core, "_cusp", count_cusp), patch.object(core, "_choose", check_tone):
            for name, target, light in BENCH["SCENARIOS"]:
                resolver = BENCH["Resolver"](
                    {"contrastTarget": target, "backgrounds": {"light": light}}
                )
                for index in range(8):
                    with self.subTest(scenario=name, label=index):
                        resolver.resolve(f"item:{index}")
        self.assertEqual(observed, {False, True})
