"""Check the actual release job gates and archive step ordering without uploading."""

import json
import os
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[1]


class PublishWorkflowTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.jobs = yaml.safe_load((ROOT / ".github/workflows/publish.yml").read_text())["jobs"]

    def test_targets_can_retry_independently(self):
        for registry in ("npm", "pypi", "go", "rust", "nuget", "dart"):
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

    def test_version_step_emits_output_only_after_validation(self):
        step = next(step for step in self.jobs["build"]["steps"] if step.get("id") == "version")
        self.assertEqual(step["env"]["REQUESTED"], "${{ inputs.version }}")
        self.assertNotIn("${{", step["run"])
        bash = shutil.which("bash")
        if os.name == "nt":
            git = Path(shutil.which("git"))
            bash = git.parent.parent / "bin" / "bash.exe"
        version = json.loads((ROOT / "package.json").read_text())["version"]
        with tempfile.TemporaryDirectory(dir=ROOT) as directory:
            output = Path(directory) / "output"
            for requested in (version, "", "99.99.99", "1.0.0\nversion=unexpected"):
                with self.subTest(requested=requested):
                    output.write_bytes(b"")
                    run = subprocess.run(
                        [bash, "-c", step["run"]],
                        cwd=ROOT,
                        env={
                            **os.environ,
                            "REQUESTED": requested,
                            "GITHUB_OUTPUT": output.relative_to(ROOT).as_posix(),
                        },
                        capture_output=True,
                    )
                    self.assertEqual(run.returncode == 0, requested == version, run.stderr)
                    self.assertEqual(
                        output.read_text(), f"version={version}\n" if requested == version else ""
                    )

    def test_fresh_bundle_prepares_registered_runners_before_parity(self):
        steps = self.jobs["build"]["steps"]
        parity = next(
            i for i, s in enumerate(steps) if s.get("run", "").endswith(" tools/verify.py")
        )
        before = steps[:parity]
        for action in ("actions/setup-dotnet@", "dart-lang/setup-dart@"):
            setup = next(s for s in before if s.get("uses", "").startswith(action))
            self.assertEqual(setup["if"], steps[parity]["if"])
        install = next(s for s in before if s.get("run") == "dart pub get --enforce-lockfile")
        self.assertEqual(install["working-directory"], "packages/dart")
        self.assertEqual(install["if"], steps[parity]["if"])
        self.assertLess(before.index(setup), before.index(install))

    def test_dry_run_stages_the_bundle_without_promoting_it(self):
        build = self.jobs["build"]
        self.assertNotIn("if", build)
        stage = next(s for s in build["steps"] if s.get("name") == "Stage original tested bytes")
        self.assertEqual(stage["if"], "steps.bundle.outputs.state == 'absent'")
        self.assertIn("--draft", stage["run"])
        steps = build["steps"]
        verify = next(s for s in steps if "tools/release.py verify-bundle" in s.get("run", ""))
        self.assertNotIn("if", verify)
        upload = next(s for s in steps if s.get("uses", "").startswith("actions/upload-artifact@"))
        self.assertLess(steps.index(verify), steps.index(stage))
        self.assertLess(steps.index(stage), steps.index(upload))
        self.assertEqual(
            self.jobs["github-release"]["if"],
            "inputs.github_release && !inputs.dry_run && !failure() && !cancelled()",
        )

    def test_root_release_requires_swift_package_and_versioned_consumer(self):
        job = self.jobs["verify-swift-release"]
        self.assertEqual(job["if"], "inputs.github_release")
        self.assertEqual(job["needs"], "build")
        self.assertIn("verify-swift-release", self.jobs["github-release"]["needs"])
        commands = [step["run"] for step in job["steps"] if "run" in step]
        self.assertEqual(
            commands,
            [
                "swift test --force-resolved-versions",
                "python3 tools/check-swift-tag.py",
            ],
        )

    def test_checkout_precedes_archive_download(self):
        for registry in ("npm", "adapters", "pypi", "rust", "nuget", "dart"):
            actions = [
                s.get("uses", "").split("@")[0] for s in self.jobs[f"publish-{registry}"]["steps"]
            ]
            self.assertLess(
                actions.index("actions/checkout"), actions.index("actions/download-artifact")
            )

    def test_adapter_retry_requires_matching_core_and_staged_scoped_package(self):
        job = self.jobs["publish-adapters"]
        self.assertEqual(job["strategy"]["matrix"]["adapter"], ["react", "tailwind"])
        self.assertFalse(job["strategy"]["fail-fast"])
        self.assertEqual(job["needs"], ["build", "publish-npm"])
        self.assertEqual(
            job["if"], "inputs.npm_adapters && !inputs.dry_run && !failure() && !cancelled()"
        )
        state = next(step["run"] for step in job["steps"] if step.get("id") == "state")
        self.assertIn('if [[ "$CORE" != matching ]]', state)
        self.assertIn('--package "@texthue/$ADAPTER"', state)
        publish = next(
            step for step in job["steps"] if step.get("name") == "Publish the tested tarball"
        )
        self.assertEqual(publish["if"], "steps.state.outputs.state == 'absent'")
        self.assertIn('"artifacts/texthue-${ADAPTER}-${VERSION}.tgz"', publish["run"])
        self.assertIn("publish-adapters", self.jobs["github-release"]["needs"])

    def test_maven_resume_polls_without_uploading(self):
        job = self.jobs["publish-maven"]
        self.assertEqual(job["if"], "inputs.maven != '' && !inputs.dry_run")
        self.assertIn("publish-maven", self.jobs["github-release"]["needs"])
        upload, wait = job["steps"][-2:]
        self.assertEqual(
            upload["if"], "steps.state.outputs.state == 'absent' && inputs.maven == 'new'"
        )
        self.assertIn('"$GITHUB_RUN_ATTEMPT" != 1', upload["run"])
        self.assertEqual(wait["if"], "steps.state.outputs.state == 'absent'")
        self.assertIn('tools/maven_deployment.py "$DEPLOYMENT" "$VERSION"', wait["run"])
        self.assertIn('test "$state" = matching', wait["run"])

    def test_wasm_can_publish_without_core(self):
        wasm = self.jobs["publish-wasm"]
        self.assertEqual(wasm["if"], "inputs.wasm && !inputs.dry_run")
        self.assertEqual(wasm["needs"], "build")
        self.assertEqual(wasm["env"]["ADAPTER"], "wasm")
        self.assertIn("publish-wasm", self.jobs["github-release"]["needs"])
        self.assertEqual(wasm["steps"], self.jobs["publish-adapters"]["steps"])
        state = next(step["run"] for step in wasm["steps"] if step.get("id") == "state")
        self.assertIn('if [[ "$ADAPTER" != wasm ]]', state)

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

    def test_root_tag_checked_before_staging_and_promotion(self):
        for job, operation in [
            ("build", "Locate the durable release bundle"),
            ("github-release", "Publish the draft release created by the build job"),
        ]:
            steps = self.jobs[job]["steps"]
            (gate,) = [i for i, step in enumerate(steps) if "root-tag-state" in step.get("run", "")]
            self.assertLess(
                gate, next(i for i, step in enumerate(steps) if step.get("name") == operation)
            )
            self.assertIn('--commit "$GITHUB_SHA"', steps[gate]["run"])
            self.assertNotIn("continue-on-error", steps[gate])
