"""Check the actual release job gates and archive step ordering without uploading."""

import shutil
import subprocess
import unittest
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[1]


class PublishWorkflowTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.jobs = yaml.safe_load((ROOT / ".github/workflows/publish.yml").read_text())["jobs"]

    def test_targets_can_retry_independently(self):
        for registry in ("npm", "pypi", "go"):
            job = self.jobs[f"publish-{registry}"]
            with self.subTest(registry=registry):
                self.assertEqual(job["if"], f"inputs.{registry} && !inputs.dry_run")
                self.assertEqual(job["needs"], "build")
                steps = job["steps"]
                state = next(i for i, step in enumerate(steps) if step.get("id") == "state")
                self.assertIn("set -euo pipefail", steps[state]["run"])
                for step in steps[state + 1 : -1]:
                    self.assertEqual(step["if"], "steps.state.outputs.state == 'absent'")
                self.assertEqual(steps[-1]["if"], "steps.state.outputs.state == 'matching'")

    def test_dry_run_stages_the_bundle_without_promoting_it(self):
        build = self.jobs["build"]
        self.assertNotIn("if", build)
        stage = next(s for s in build["steps"] if s.get("name") == "Stage original tested bytes")
        self.assertEqual(stage["if"], "steps.bundle.outputs.state == 'absent'")
        self.assertIn("--draft", stage["run"])
        self.assertEqual(
            self.jobs["github-release"]["if"],
            "inputs.github_release && !inputs.dry_run && !failure() && !cancelled()",
        )

    def test_checkout_precedes_archive_download(self):
        for registry in ("npm", "pypi"):
            actions = [
                s.get("uses", "").split("@")[0] for s in self.jobs[f"publish-{registry}"]["steps"]
            ]
            self.assertLess(
                actions.index("actions/checkout"), actions.index("actions/download-artifact")
            )

    def test_npm_version_gate(self):
        steps = self.jobs["publish-npm"]["steps"]
        gate = next(s["run"] for s in steps if s.get("name", "").startswith("Require an npm CLI"))
        # Execute the workflow's JavaScript comparison with representative CLI version outputs.
        expression = gate.split('node -e "', 1)[1].split('" "$version"', 1)[0]
        self.assertIn("version=$(npm --version)", gate)
        for version, expected in [("10.9.0", 1), ("11.5.0", 1), ("11.5.1", 0), ("12.0.0", 0)]:
            result = subprocess.run(
                [shutil.which("node"), "-e", expression, version], capture_output=True
            )
            self.assertEqual(result.returncode, expected, version)
