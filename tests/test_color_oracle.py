"""Compare Python color math with ColorAide using the JavaScript oracle corpus."""

import sys
import unittest
from pathlib import Path

from coloraide import Color

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "packages/python/src"))
from texthue import _core  # noqa: E402


class ColorOracleTests(unittest.TestCase):
    def test_conversion_and_gamut_boundary(self):
        seed = 4217

        def sample():
            nonlocal seed
            seed = (1664525 * seed + 1013904223) % (2**32)
            return seed / 2**32

        for _ in range(1000):
            rgb = tuple(int(256 * sample()) for _ in range(3))
            reference = Color("srgb", [v / 255 for v in rgb]).convert("oklab").coords()
            for actual, expected in zip(
                _core._oklab(rgb, _core._RGB_TO_XYZ), reference, strict=True
            ):
                self.assertAlmostEqual(actual, expected, delta=1e-7, msg=str(rgb))
            lightness, hue = 0.01 + 0.98 * sample(), 360 * sample()
            edge = _core._cusp(lightness, hue)
            for offset, inside in ((-0.000002, True), (0.000002, False)):
                linear = Color("oklch", [lightness, edge + offset, hue]).convert("srgb-linear")
                self.assertEqual(
                    all(-1e-12 <= v <= 1 + 1e-12 for v in linear.coords()),
                    inside,
                    (lightness, hue, edge, offset),
                )
