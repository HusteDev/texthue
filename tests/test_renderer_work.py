"""Bound Python renderer work independently of wall-clock timings."""

import runpy
import unittest
from pathlib import Path

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
