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
            lightness, hue = 0.01 + 0.98 * sample(), 360 * sample()
            for space, to_xyz, from_xyz in (
                ("srgb", _core._RGB_TO_XYZ, _core._XYZ_TO_RGB),
                ("display-p3", _core._P3_TO_XYZ, _core._XYZ_TO_P3),
            ):
                reference = Color(space, [v / 255 for v in rgb]).convert("oklab").coords()
                for actual, expected in zip(_core._oklab(rgb, to_xyz), reference, strict=True):
                    self.assertAlmostEqual(actual, expected, delta=1e-7, msg=str((space, rgb)))
                edge = _core._cusp(lightness, hue, from_xyz)
                self.assertTrue(0 <= edge <= 0.4, (space, lightness, hue, edge))
                for offset, inside in ((-0.000002, True), (0.000002, False)):
                    chroma = edge + offset
                    # The algorithm limits chroma to 0.4 even if the gamut extends farther.
                    if space == "display-p3" and chroma > 0.4:
                        continue
                    linear = Color("oklch", [lightness, chroma, hue]).convert(space + "-linear")
                    self.assertEqual(
                        all(-1e-12 <= v <= 1 + 1e-12 for v in linear.coords()),
                        inside,
                        (space, lightness, hue, edge, offset),
                    )
