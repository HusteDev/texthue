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

    def test_migration_preview(self):
        from texthue import Resolver, compare_assignments

        before = Resolver(seed=123)
        registry = json.loads((ROOT / "conformance/registry-v1.json").read_text())
        after = Resolver(overrides={"old": "#777777", "keep": "#777777"}, foregrounds=["#777777"])
        texts = ["old", "keep", "old"]
        report = compare_assignments(
            {"resolver": before, "registry": registry}, {"resolver": after}, texts
        )
        self.assertEqual(report["moved"], ["keep", "old"])
        self.assertEqual(report["collisions"]["before"], [])
        self.assertEqual(
            report["collisions"]["after"],
            [
                {"theme": theme, "hex": "#777777", "identities": ["keep", "old"]}
                for theme in ("light", "dark")
            ],
        )
        self.assertTrue(any(change["deltaE"] > 0 for change in report["colors"]))
        self.assertTrue(
            any(
                change["passedBefore"] and not change["passedAfter"]
                for change in report["contrast"]
            )
        )
        sides = {
            "old": {"config": before.export_config(), "registry": registry},
            "next": {"config": after.export_config()},
        }
        cases = json.dumps([{"texts": texts, "migration": sides}])
        script = """
import {compareAssignments,importConfig} from './packages/npm/dist/index.js';
import {readFileSync} from 'node:fs';
const side = ({config,registry})=>({resolver:importConfig(config),registry});
const [{texts,migration:{old,next}}] = JSON.parse(readFileSync(0,'utf8'));
console.log(JSON.stringify([compareAssignments(side(old),side(next),texts)]));
"""
        for command in (
            ["node", "--input-type=module", "-e", script],
            ["go", "-C", "packages/go", "run", "./cmd/conformance"],
        ):
            result = subprocess.run(
                command,
                input=cases,
                cwd=ROOT,
                text=True,
                capture_output=True,
                check=True,
                timeout=60,
            )
            self.compare(json.loads(result.stdout)[0], report)

    def test_apca_reference(self):
        from texthue._core import _apca_contrast

        rows = json.loads((ROOT / "conformance/apca-srgb-v1.json").read_text())
        for row in rows:
            self.assertAlmostEqual(_apca_contrast(row[:3], row[3:6]), row[6], delta=1e-10)

    def test_linear_light_composite(self):
        from texthue import composite_over

        cases = json.loads((ROOT / "conformance/composite-v1.json").read_text())
        for case in cases:
            bases = resolve_text_colors(
                "blend", backgrounds={"light": case["source"], "dark": case["backdrop"]}
            )
            result = composite_over(bases.light.background, case["alpha"], bases.dark.background)
            self.assertEqual(result.hex, case["expected"])
            self.assertEqual(
                resolve_text_colors("blend", backgrounds={"light": result}).light.background, result
            )
            for alpha in (math.nan, -0.1, 1.1, True):
                with self.assertRaises(TextColorError):
                    composite_over(result, alpha, result)

    def test_registry_replay(self):
        from texthue import Resolver

        saved = json.loads((ROOT / "conformance/registry-v1.json").read_text(encoding="utf-8"))
        resolver = Resolver(seed=123)
        pins = resolver.import_registry(saved)
        self.assertEqual(resolver.export_registry(pins), saved)
        updated = resolver.assign(["new", "old"], pinned=pins)
        original = resolver.assign(saved["assignments"])
        self.assertEqual(updated["colors"]["old"], original["colors"]["old"])
        for key, placement in pins.items():
            self.assertEqual(updated["assignments"][key], placement)
        with self.assertRaises(TextColorError):
            Resolver().import_registry(saved)
        del saved["assignments"]["old"]["moved"]
        with self.assertRaises(TextColorError):
            resolver.import_registry(saved)

    def test_portable_config_fingerprint(self):
        from texthue._fingerprint import fingerprint

        saved = json.loads((ROOT / "conformance/config-v1.json").read_text(encoding="utf-8"))
        from texthue import import_config

        self.assertEqual(import_config(saved).export_config(), saved)
        expected = saved.pop("fingerprint")
        self.assertEqual(fingerprint(saved), expected)
        self.assertEqual(fingerprint(-0.0), fingerprint(0.0))
        self.assertNotEqual(fingerprint([1, 2]), fingerprint([2, 1]))

    def test_strict_hex_relationships(self):
        from texthue import Resolver

        resolver = Resolver(
            {
                "overrides": {"sample": "#777777"},
                "foregrounds": ["#777777"],
                "contrastTargets": {"text": 1, "textOnSubtle": 21},
            }
        )
        for role in ("fill", "on_fill", "text"):
            self.assertTrue(resolver.hex("sample", theme="light", role=role))
            with self.assertRaises(TextColorError) as caught:
                resolver.hex("sample", theme="light", role=role, strict=True)
            self.assertEqual(caught.exception.code, "UNMET_CONSTRAINT")
        self.assertTrue(resolver.hex("sample", theme="light", role="border", strict=True))

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
                self.compare(
                    resolve_text_colors(item["text"], item["options"]).to_dict(), item["expected"]
                )
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

    def test_native_models_and_compiled_options(self):
        from dataclasses import FrozenInstanceError

        from texthue import ColorSet, Resolver

        resolver = Resolver(
            contrast_target=7, profiles={"light": {"fill": {"chroma_scale": (0, 0)}}}
        )
        first, second = resolver.batch(["tag", "tag"])
        self.assertEqual(first, second)
        self.assertEqual(ColorSet.from_dict(first.to_dict()), first)
        self.assertEqual(first.light.fill.oklch.c, 0)
        self.assertEqual(resolver.hex("tag", theme="light", role="fill"), first.light.fill.hex)
        with self.assertRaises(FrozenInstanceError):
            first.light.fill.rgb.r = 0

    def test_assignment_vectors(self):
        from texthue import Resolver

        cases = json.loads((ROOT / "conformance/assign-vectors.json").read_text())
        run = subprocess.run(
            ["go", "-C", "packages/go", "run", "./cmd/conformance"],
            input=json.dumps(cases),
            capture_output=True,
            text=True,
            check=True,
            timeout=60,
        )
        for case, go in zip(cases, json.loads(run.stdout), strict=True):
            resolver = Resolver(case.get("options", {}))
            for texts in (case["texts"], list(reversed(case["texts"]))):
                result = resolver.assign(texts, pinned=case.get("pinned"))
                self.compare(
                    {k: v.to_dict() for k, v in result["assignments"].items()}, case["assignments"]
                )
                self.compare(result["report"], case["report"])
                self.compare(
                    {k: v.light.fill.hex for k, v in result["colors"].items()}, case["lightFills"]
                )
                self.compare({k: v.to_dict() for k, v in result["colors"].items()}, go["colors"])
            self.compare(go["assignments"], case["assignments"])
            self.compare(go["report"], case["report"])

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
        normalized = {"normalize": {"unicode": "NFKC", "case": "lower", "whitespace": "collapse"}}
        for raw, expected in [
            ("  Ａ\u2003E\u0301 ", "a é"),
            ("ΟΣ", "ος"),
            ("İ", "i\u0307"),
            ("\ufeffA\u001c", "\ufeffa\u001c"),
            ("\u0085A\u0085", "a"),
        ]:
            item = {"text": raw, "options": {"namespace": raw, **normalized}}
            cases.append(item)
            self.assertEqual(
                resolve_text_colors(raw, item["options"]),
                resolve_text_colors(expected, namespace=expected),
            )
        entries = [
            {"id": "ocean", "light": "#147fad"},
            {"id": "ruby", "dark": "#901641"},
            {"id": "neutral", "light": "#777777", "dark": "#999999"},
        ]
        for name in ["brand", "other", "neutral"]:
            for palette in [entries, entries[::-1]]:
                cases.append(
                    {
                        "text": name,
                        "options": {
                            "palette": palette,
                            "overrides": {
                                "brand": {"light": "#0077bb", "dark": "#cc8800"},
                                "neutral": "#777777",
                            },
                            "foregrounds": ["#555555"],
                            "contrastTarget": 7,
                        },
                    }
                )
        for policy in ("best", "first-passing"):
            for target in (1, 4.5, 21):
                cases.append(
                    {
                        "text": "foreground",
                        "options": {
                            "foregroundPolicy": policy,
                            "foregrounds": ["#888888", "#555555"],
                            "contrastTarget": target,
                        },
                    }
                )
        for preset in ("labels", "controls", "chart", "subdued", "mono"):
            cases.append({"text": "preset", "options": {"preset": preset}})
        for i in range(16):
            cases.append(
                {
                    "text": f"hue:{i}",
                    "options": {"hueRange": [270, 120], "excludeHues": [[355, 20], [75, 90]]},
                }
            )
        for lc in (0, 45, 60, 75, 90, 106):
            for extra in (
                {},
                {"overrides": {"apca": "#777777"}, "foregrounds": ["#777777"]},
                {"palette": [{"id": "a", "light": "#ffff00"}, {"id": "b", "light": "#cccccc"}]},
                {"contrastTargets": {"text": 0, "textOnSubtle": 75}},
                {"contrastTargets": {"text": 75, "textOnSubtle": 0}},
            ):
                cases.append(
                    {
                        "text": "apca",
                        "options": {"contrastModel": "apca", "contrastTarget": lc, **extra},
                    }
                )
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
        from texthue import Resolver

        replay = [
            {"text": item["text"], "config": Resolver(item["options"]).export_config()}
            for item in cases
        ]
        script = """
import { importConfig, resolveTextColors } from './packages/npm/dist/index.js';
let input = '';
process.stdin.setEncoding('utf8');
for await (const chunk of process.stdin) input += chunk;
const output = [];
for (const item of JSON.parse(input)) {
  output.push(item.config ? importConfig(item.config).resolve(item.text) : resolveTextColors(item.text, item.options));
}
process.stdout.write(JSON.stringify(output));
"""
        completed = subprocess.run(
            ["node", "--input-type=module", "-e", script],
            cwd=ROOT,
            input=json.dumps(cases + replay, ensure_ascii=True),
            text=True,
            capture_output=True,
            check=True,
            timeout=60,
        )
        expected = json.loads(completed.stdout)
        go_completed = subprocess.run(
            ["go", "-C", "packages/go", "run", "./cmd/conformance"],
            cwd=ROOT,
            input=json.dumps(cases + replay, ensure_ascii=True),
            text=True,
            capture_output=True,
            check=True,
            timeout=60,
        )
        go_results = json.loads(go_completed.stdout)
        self.assertEqual(len(go_results), 2 * len(cases))
        self.assertEqual(go_results[: len(cases)], go_results[len(cases) :])
        self.assertEqual(expected[: len(cases)], expected[len(cases) :])
        expected = expected[: len(cases)]
        for index, (item, result) in enumerate(zip(cases, expected, strict=True)):
            with self.subTest(index=index):
                self.compare(resolve_text_colors(item["text"], item["options"]).to_dict(), result)
                self.compare(go_results[index], result)


if __name__ == "__main__":
    unittest.main()
