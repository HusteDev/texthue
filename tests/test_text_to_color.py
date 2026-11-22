"""Python conformance suite and three-language parity test.

Run from the project root: python -m unittest discover -s tests -p 'test_*.py'.
The parity test invokes Node.js and Go, so both toolchains and a built npm
package must be available.
"""

import hashlib
import json
import math
import random
import subprocess
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "packages" / "python" / "src"))
from texthue import TextColorError, resolve_text_colors  # noqa: E402 - path set above

FIXTURE = json.loads((ROOT / "conformance" / "vectors.json").read_text(encoding="utf-8"))


class ConformanceTests(unittest.TestCase):
    """Frozen-vector, runtime-error, and cross-language checks for the Python package."""

    def compare(self, actual, expected, path="result"):
        """Recursively compare a result to a fixture.

        RGB bytes must match exactly, HSL and OKLCH fields within one unit in
        the sixth decimal, and every other number within 1e-12. Booleans must
        be real ``bool`` values, not integers.
        """
        if isinstance(expected, dict):
            self.assertEqual(set(actual), set(expected), path)
            for key in expected:
                self.compare(actual[key], expected[key], f"{path}.{key}")
        elif isinstance(expected, list):
            self.assertEqual(len(actual), len(expected), path)
            for i, value in enumerate(expected):
                self.compare(actual[i], value, f"{path}[{i}]")
        elif type(expected) in (int, float) and ".rgb." not in path:
            self.assertTrue(math.isfinite(actual), path)
            # HSL/OKLCH decimal serialization permits one unit in the sixth decimal.
            tolerance = 1.000001e-6 if ".hsl." in path or ".oklch." in path else 1e-12
            self.assertLessEqual(abs(actual - expected), tolerance, path)
        else:
            self.assertEqual(actual, expected, path)
            if isinstance(expected, bool):
                self.assertIs(type(actual), bool, path)

    def test_published_vectors(self):
        """Every valid vector resolves to its expected result, and the recorded payload and digest are reproduced."""
        for item in FIXTURE["vectors"]:
            with self.subTest(item=item["id"]):
                self.compare(resolve_text_colors(item["text"], item["options"]), item["expected"])
                encoded = item["encoding"]
                namespace = item["options"].get("namespace", "").encode("utf-8")
                text = item["text"].encode("utf-8")
                payload = (
                    b"text-to-color-v1\x00"
                    + item["options"].get("seed", 0).to_bytes(4, "big")
                    + len(namespace).to_bytes(4, "big")
                    + namespace
                    + text
                )
                self.assertEqual(namespace.hex(), encoded["namespaceUtf8Hex"])
                self.assertEqual(text.hex(), encoded["textUtf8Hex"])
                self.assertEqual(payload.hex(), encoded["payloadHex"])
                self.assertEqual(hashlib.sha256(payload).hexdigest(), encoded["sha256"])

    def test_rejected_vectors(self):
        """Every invalid vector raises TextColorError with the expected code."""
        for item in FIXTURE["invalid"]:
            with self.subTest(item=item["id"]):
                with self.assertRaises(TextColorError) as caught:
                    resolve_text_colors(item["text"], item.get("options", {}))
                self.assertEqual(caught.exception.code, item["code"])

    def test_runtime_only_errors(self):
        """Values JSON cannot express (NaN, infinity, huge ints, numeric strings) are rejected."""
        for value in (math.nan, math.inf, -math.inf, 10**1000, "4.5"):
            with self.subTest(value_type=type(value).__name__):
                with self.assertRaises(TextColorError):
                    resolve_text_colors("x", {"contrastTarget": value})
        with self.assertRaises(TextColorError):
            resolve_text_colors("x", {"profiles": {"dark": {"fill": {"lightness": [0, math.nan]}}}})

    def test_cross_language_generated_cases(self):
        """Seeded random cases produce identical results in Python, JavaScript, and Go."""
        rng = random.Random(4217)
        alphabet = (
            "abcdefghijklmnopqrstuvwxyz ABC0123456789\x00\n\u00e9\u0301\u7814\u7a76\U0001f308"
        )
        cases = [
            {
                "text": "".join(rng.choice(alphabet) for _ in range(rng.randrange(0, 80))),
                "options": {},
            }
            for _ in range(128)
        ]
        for i in range(32):
            a, b = sorted((rng.random(), rng.random()))
            cases.append(
                {
                    "text": f"item:{i}",
                    "options": {
                        "namespace": f"collection:{i % 4}",
                        "backgrounds": {
                            "light": f"#{rng.randrange(16777216):06x}",
                            "dark": f"#{rng.randrange(16777216):06x}",
                        },
                        "contrastTarget": [1, 4.5, 7, 21][i % 4],
                        "profiles": {
                            "light": {"text": {"lightness": [a, b], "chromaScale": [0.3, 0.4]}}
                        },
                    },
                }
            )
        script = """
import { resolveTextColors } from './packages/npm/dist/index.js';
let input = '';
process.stdin.setEncoding('utf8');
for await (const chunk of process.stdin) input += chunk;
const output = [];
for (const item of JSON.parse(input)) output.push(await resolveTextColors(item.text, item.options));
process.stdout.write(JSON.stringify(output));
"""
        completed = subprocess.run(
            ["node", "--input-type=module", "-e", script],
            cwd=ROOT,
            input=json.dumps(cases, ensure_ascii=True),
            text=True,
            capture_output=True,
            check=True,
            timeout=60,
        )
        expected = json.loads(completed.stdout)
        go_completed = subprocess.run(
            ["go", "-C", "packages/go", "run", "./cmd/conformance"],
            cwd=ROOT,
            input=json.dumps(cases, ensure_ascii=True),
            text=True,
            capture_output=True,
            check=True,
            timeout=60,
        )
        go_results = json.loads(go_completed.stdout)
        self.assertEqual(len(go_results), len(cases))
        for index, (item, result) in enumerate(zip(cases, expected, strict=True)):
            with self.subTest(index=index):
                self.compare(resolve_text_colors(item["text"], item["options"]), result)
                self.compare(go_results[index], result)


if __name__ == "__main__":
    unittest.main()
