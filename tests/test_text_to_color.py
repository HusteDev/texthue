"""Python conformance suite and three-language parity test.

Run from the project root: python -m unittest discover -s tests -p 'test_*.py'.
The parity test invokes Node.js and Go, so both toolchains and a built npm
package must be available.
"""

import hashlib
import json
import math
import os
import random
import shutil
import subprocess
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "packages" / "python" / "src"))
from texthue import TextColorError, resolve_text_colors  # noqa: E402 - path set above

FIXTURE = json.loads((ROOT / "conformance" / "vectors.json").read_text(encoding="utf-8"))


NORMALIZED_NAMESPACES = [
    ("  Ａ\u2003E\u0301 ", "a é"),
    ("ΟΣ", "ος"),
    ("İ", "i\u0307"),
    ("\ufeffA\u001c", "\ufeffa\u001c"),
    ("\u0085A\u0085", "a"),
]
NORMALIZATION_RULES = {"unicode": "NFKC", "case": "lower", "whitespace": "collapse"}


def generated_cases():
    rng = random.Random(4217)
    alphabet = "abcdefghijklmnopqrstuvwxyz ABC0123456789\x00\n\u00e9\u0301\u7814\u7a76\U0001f308"
    cases = [
        {
            "text": "".join(rng.choice(alphabet) for _ in range(rng.randrange(0, 80))),
            "options": {},
        }
        for _ in range(128)
    ]
    for raw, _ in NORMALIZED_NAMESPACES:
        cases.append({"text": raw, "options": {"namespace": raw, "normalize": NORMALIZATION_RULES}})
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
    for seed in (1, 0x7FFFFFFF, 0x80000000, 0xFFFFFFFF):
        for model, target in (("wcag2", 7), ("apca", 75)):
            cases.append(
                {
                    "text": "  Ａ\u0301🌈  ",
                    "options": {
                        "seed": seed,
                        "namespace": "scope\x00研究",
                        "normalize": NORMALIZATION_RULES,
                        "preset": "chart",
                        "contrastModel": model,
                        "contrastTarget": target,
                        "contrastTargets": {"fillHover": target, "strong": target},
                        "hueRange": [300, 45],
                        "excludeHues": [[350, 10]],
                        "profiles": {"dark": {"fill": {"chromaCap": 0.02}}},
                        "backgrounds": {"dark": "#3467af"},
                    },
                }
            )
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
    return cases


class ConformanceTests(unittest.TestCase):
    """Frozen-vector, runtime-error, and cross-language checks for the Python package."""

    def test_precision_trace(self):
        from texthue import Resolver

        resolver = Resolver({"contrastTarget": 7})
        selection = {"themes": ["light"], "roles": ["text", "background"]}
        ordinary = resolver.project("repair", **selection)["light"]
        self.assertNotIn("trace", ordinary["text"])
        projected = resolver.project("repair", formats=["trace", "hex"], **selection)["light"]
        self.assertEqual(projected["text"]["hex"], ordinary["text"]["hex"])
        trace = projected["text"]["trace"]
        self.assertEqual(trace["source"], "generated")
        self.assertNotEqual(trace["requested"]["l"], trace["biased"]["l"])
        self.assertNotEqual(trace["biased"]["l"], trace["repaired"]["l"])
        self.assertEqual(trace["repaired"]["l"], trace["fitted"]["l"])
        self.assertEqual(
            projected["background"]["trace"],
            {"source": "supplied", "hex": ordinary["background"]["hex"]},
        )

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

    def test_display_p3_fit(self):
        from texthue import to_css
        from texthue._core import _XYZ_TO_P3, _cusp, _fit, _p3_fallback

        rows = json.loads((ROOT / "conformance/p3-fit-v1.json").read_text())
        for row in rows:
            fit = _fit(row["l"], row["c"], row["h"], _XYZ_TO_P3)
            self.assertEqual(fit["rgb"], row["rgb"])
            self.assertEqual(_p3_fallback(fit["rgb"]), (row["fallback"], row["clipped"]))
        red = resolve_text_colors("red", backgrounds={"light": "#ff0000"}).light.background
        self.assertEqual(to_css(red, "p3"), "color(display-p3 0.917488 0.200287 0.138561)")
        self.assertGreater(_cusp(0.7, 145, _XYZ_TO_P3), _cusp(0.7, 145))

    def test_display_p3_resolver_parity(self):
        from texthue import ColorSet, Resolver, import_config, to_css

        inputs = []
        expected = []
        for model in ("wcag2", "apca"):
            for options in (
                {},
                {"preset": "chart"},
                {"overrides": {"0": "#ff0000"}},
                {"backgrounds": {"light": "#456789"}, "foregrounds": ["#777777", "#ffffff"]},
                {
                    "palette": [
                        {"id": "red", "light": "#ff0000"},
                        {"id": "green", "dark": "#00ff00"},
                    ]
                },
                {"contrastTarget": 106 if model == "apca" else 21},
            ):
                resolver = Resolver({"gamut": "display-p3", "contrastModel": model, **options})
                snapshot = resolver.export_config()
                restored = import_config(snapshot)
                for text in ("0", "sample"):
                    colors = resolver.resolve(text)
                    self.assertEqual(colors, restored.resolve(text))
                    self.assertEqual(colors, ColorSet.from_dict(colors.to_dict()))
                    self.assertEqual(to_css(colors.light.fill, "p3"), colors.light.fill.css)
                    inputs.append({"config": snapshot, "text": text})
                    expected.append(colors.to_dict())
        script = """
import {importConfig} from './packages/npm/dist/index.js';
import {readFileSync} from 'node:fs';
console.log(JSON.stringify(JSON.parse(readFileSync(0,'utf8')).map(
  ({config,text})=>importConfig(config).resolve(text))));
"""
        for command in (
            ["node", "--input-type=module", "-e", script],
            ["go", "-C", "packages/go", "run", "./cmd/conformance"],
        ):
            run = subprocess.run(
                command,
                cwd=ROOT,
                input=json.dumps(inputs),
                text=True,
                capture_output=True,
                timeout=60,
            )
            self.assertEqual(run.returncode, 0, run.stderr)
            self.compare(expected, json.loads(run.stdout))

    def test_frozen_renderer_vectors(self):
        from texthue import Resolver

        corpus = json.loads((ROOT / "conformance/renderer-v1.json").read_text())
        self.assertEqual(corpus["algorithm"], "text-to-color-v1")
        inputs = []
        for case in corpus["vectors"]:
            resolver = Resolver(case["options"])
            text, role = case["text"], case["role"]
            full = resolver.resolve(text).to_dict()
            inputs.append({"text": text, "config": resolver.export_config(), "trace": True})
            for theme, expected in case["themes"].items():
                selected = resolver.project(
                    text, themes=[theme], roles=[role], formats=list(expected["color"])
                )
                self.compare(selected[theme][role], expected["color"])
                self.compare(full[theme]["contrast"][role], expected["contrast"])
        run = subprocess.run(
            ["go", "-C", "packages/go", "run", "./cmd/conformance"],
            cwd=ROOT,
            input=json.dumps(inputs),
            text=True,
            capture_output=True,
            timeout=60,
        )
        self.assertEqual(run.returncode, 0, run.stderr)
        for case, full in zip(corpus["vectors"], json.loads(run.stdout), strict=True):
            role = case["role"]
            for theme, expected in case["themes"].items():
                actual = full[theme][role]
                self.compare({k: actual[k] for k in expected["color"]}, expected["color"])
                self.compare(full[theme]["contrast"][role], expected["contrast"])

    def test_three_language_trace_parity(self):
        from texthue import Resolver

        inputs, expected = [], []
        for gamut in ("srgb", "display-p3"):
            for options in (
                {"contrastTarget": 7},
                {"contrastModel": "apca", "contrastTarget": 106},
                {"overrides": {"repair": "#888888"}},
                {"palette": [{"id": "red", "light": "#ff0000"}]},
            ):
                resolver = Resolver({"gamut": gamut, **options})
                inputs.append({"config": resolver.export_config(), "text": "repair", "trace": True})
                expected.append(resolver.project("repair", formats=["hex", "trace"]))
        script = """
import {importConfig} from './packages/npm/dist/index.js';
import {readFileSync} from 'node:fs';
console.log(JSON.stringify(JSON.parse(readFileSync(0,'utf8')).map(
  ({config,text})=>importConfig(config).project(text,{formats:['hex','trace']}))));
"""
        for command in (
            ["node", "--input-type=module", "-e", script],
            ["go", "-C", "packages/go", "run", "./cmd/conformance"],
        ):
            run = subprocess.run(
                command,
                cwd=ROOT,
                input=json.dumps(inputs),
                text=True,
                capture_output=True,
                timeout=60,
            )
            self.assertEqual(run.returncode, 0, run.stderr)
            for result, reference in zip(json.loads(run.stdout), expected, strict=True):
                for theme, roles in reference.items():
                    for role, fields in roles.items():
                        actual = result[theme][role]
                        self.compare(
                            {key: actual[key] for key in fields}, fields, f"{theme}.{role}"
                        )

    def test_display_p3_contrast(self):
        from texthue._core import _p3_apca_contrast, _p3_contrast

        rows = json.loads((ROOT / "conformance/p3-contrast-v1.json").read_text())
        for row in rows:
            self.assertAlmostEqual(
                _p3_contrast(row["text"], row["background"]), row["ratio"], delta=1e-10
            )
            self.assertAlmostEqual(
                _p3_apca_contrast(row["text"], row["background"]), row["lc"], delta=1e-10
            )

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

    def test_config_replay_from_each_primary_language(self):
        manifest = json.loads((ROOT / "tools/packages.json").read_text(encoding="utf-8"))
        commands = {
            p["id"]: p["conformanceRunner"]
            for p in manifest["packages"]
            if p.get("conformanceReplay")
        }
        commands["python"] = [sys.executable, *commands["python"][1:]]
        cases = [
            {"text": " research ", "options": {}},
            {
                "text": "É",
                "options": {
                    "namespace": "試験",
                    "seed": 17,
                    "normalize": {"unicode": "NFC"},
                    "overrides": {"É": "#335577"},
                },
            },
            {
                "text": "night",
                "options": {"preset": "controls", "backgrounds": {"light": "#888888"}},
            },
        ]

        def run(command, inputs):
            proc = subprocess.run(
                command,
                cwd=ROOT,
                input=json.dumps(inputs),
                text=True,
                capture_output=True,
                encoding="utf-8",
                timeout=60,
            )
            self.assertEqual(proc.returncode, 0, proc.stderr)
            return json.loads(proc.stdout)

        expected = run(commands["npm"], cases)
        replays = []
        for producer, command in commands.items():
            configs = run(command, [{**item, "exportConfig": True} for item in cases])
            for case, config in zip(cases, configs, strict=True):
                self.assertEqual(config["schema"], "texthue-config-v1", producer)
                replays.append({"text": case["text"], "config": config})
        for consumer, command in commands.items():
            with self.subTest(consumer=consumer):
                self.compare(run(command, replays), expected * len(commands))

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

    def test_normalized_namespaces(self):
        for raw, expected in NORMALIZED_NAMESPACES:
            self.assertEqual(
                resolve_text_colors(raw, namespace=raw, normalize=NORMALIZATION_RULES),
                resolve_text_colors(expected, namespace=expected),
            )

    def test_cross_language_generated_cases(self):
        """Compare complete palettes across the installed registered runners."""
        cases = generated_cases()
        from texthue import Resolver

        replay = [
            {"text": item["text"], "config": Resolver(item["options"]).export_config()}
            for item in cases
        ]
        packages = json.loads((ROOT / "tools/packages.json").read_text(encoding="utf-8"))[
            "packages"
        ]
        runners = {p["id"]: p for p in packages if p.get("conformanceRunner")}
        self.assertTrue({"npm", "python", "go"}.issubset(runners))
        results = {}
        for name, package in runners.items():
            command = list(package["conformanceRunner"])
            available = shutil.which(command[0])
            if name == "kotlin":
                available = os.environ.get("JAVA_HOME") or shutil.which("java")
                if os.name == "nt":
                    command[0] = str((ROOT / command[0]).with_suffix(".bat"))
            if package.get("optionalToolchain") and not available:
                with self.subTest(runner=name):
                    self.skipTest(f"{name} toolchain unavailable")
                continue
            inputs = cases + replay if package.get("conformanceReplay") else cases
            with self.subTest(runner=name):
                if command[0] == "python":
                    command[0] = sys.executable
                else:
                    command[0] = shutil.which(command[0]) or command[0]
                run = subprocess.run(
                    command,
                    cwd=ROOT,
                    input=json.dumps(inputs, ensure_ascii=True),
                    env={**os.environ, "DOTNET_NOLOGO": "1"},
                    text=True,
                    encoding="utf-8",
                    capture_output=True,
                    timeout=1200 if package.get("optionalToolchain") else 60,
                )
                self.assertEqual(run.returncode, 0, run.stderr)
                output = json.loads(run.stdout)
                self.assertEqual(len(output), len(inputs))
                results[name] = output[: len(cases)]
                if package.get("conformanceReplay"):
                    self.assertEqual(results[name], output[len(cases) :])
        expected = results.pop("npm")
        for index, result in enumerate(expected):
            for name, output in results.items():
                with self.subTest(index=index, runner=name):
                    self.compare(output[index], result)


if __name__ == "__main__":
    unittest.main()
