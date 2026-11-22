"""Unit tests for tools/release.py: the fail-closed version check and the
per-registry publish-target state checks used by .github/workflows/publish.yml.

These tests never make a real network call or shell out to a real registry;
every registry lookup is exercised through an injected fake runner/fetcher,
per docs/RELEASING.md and CONTRIBUTING.md's rule that release logic must be
testable without touching a real registry.
"""

import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))

import release  # noqa: E402


def fake_result(returncode, stdout="", stderr=""):
    return subprocess.CompletedProcess(args=[], returncode=returncode, stdout=stdout, stderr=stderr)


class ValidateVersionTests(unittest.TestCase):
    def test_accepts_plain_semver(self):
        self.assertEqual(release.validate_version("1.2.3"), "1.2.3")

    def test_accepts_and_strips_leading_v(self):
        self.assertEqual(release.validate_version("v1.2.3"), "1.2.3")

    def test_rejects_empty_string(self):
        with self.assertRaises(release.ReleaseError):
            release.validate_version("")

    def test_rejects_none(self):
        with self.assertRaises(release.ReleaseError):
            release.validate_version(None)

    def test_rejects_malformed_syntax(self):
        for bad in ["1.2", "1.2.3.4", "1.2.3-beta", "latest", "  ", "1.2.x"]:
            with self.assertRaises(release.ReleaseError, msg=bad):
                release.validate_version(bad)

    def test_rejects_shell_metacharacters(self):
        for bad in ["1.2.3; rm -rf /", "$(whoami)", "1.2.3\n2.0.0", "1.2.3 && echo hi"]:
            with self.assertRaises(release.ReleaseError, msg=bad):
                release.validate_version(bad)


class CheckVersionTests(unittest.TestCase):
    def test_agreeing_manifests_return_the_version(self):
        manifests = {"a": "0.1.0", "b": "0.1.0"}
        self.assertEqual(release.check_version("0.1.0", manifests), "0.1.0")

    def test_agreeing_manifests_accept_leading_v(self):
        manifests = {"a": "0.1.0", "b": "0.1.0"}
        self.assertEqual(release.check_version("v0.1.0", manifests), "0.1.0")

    def test_disagreeing_manifests_fail(self):
        manifests = {"a": "0.1.0", "b": "0.2.0"}
        with self.assertRaises(release.ReleaseError):
            release.check_version("0.1.0", manifests)

    def test_manifest_mismatch_with_requested_fails(self):
        # This is the exact scenario from the plan's acceptance criteria:
        # requesting 99.99.99 when manifests declare 0.1.0 must fail before
        # any publication step, producing no usable version output.
        manifests = {"a": "0.1.0", "b": "0.1.0"}
        with self.assertRaises(release.ReleaseError):
            release.check_version("99.99.99", manifests)

    def test_malformed_requested_version_fails_even_if_manifests_agree(self):
        manifests = {"a": "0.1.0", "b": "0.1.0"}
        with self.assertRaises(release.ReleaseError):
            release.check_version("; rm -rf /", manifests)


class NpmTargetStateTests(unittest.TestCase):
    def test_missing_version_is_absent(self):
        def run(_command):
            return fake_result(1, stderr="npm error code E404\nnpm error 404 Not Found")

        state = release.npm_target_state("texthue", "1.0.0", None, run=run)
        self.assertEqual(state.state, release.ABSENT)

    def test_network_failure_is_lookup_failed_not_absent(self):
        def run(_command):
            return fake_result(1, stderr="npm error network timeout")

        state = release.npm_target_state("texthue", "1.0.0", "deadbeef", run=run)
        self.assertEqual(state.state, release.LOOKUP_FAILED)

    def test_matching_digest_is_matching(self):
        def run(_command):
            return fake_result(0, stdout='"deadbeef"')

        state = release.npm_target_state("texthue", "1.0.0", "deadbeef", run=run)
        self.assertEqual(state.state, release.MATCHING)

    def test_different_digest_is_conflicting_not_matching(self):
        def run(_command):
            return fake_result(0, stdout='"deadbeef"')

        state = release.npm_target_state("texthue", "1.0.0", "cafefeed", run=run)
        self.assertEqual(state.state, release.CONFLICTING)

    def test_present_without_local_digest_is_lookup_failed(self):
        # We cannot tell matching from conflicting without something to
        # compare, and treating "we don't know" as either MATCHING (skip)
        # or ABSENT (re-publish) would be unsafe.
        def run(_command):
            return fake_result(0, stdout='"deadbeef"')

        state = release.npm_target_state("texthue", "1.0.0", None, run=run)
        self.assertEqual(state.state, release.LOOKUP_FAILED)


class PypiTargetStateTests(unittest.TestCase):
    def test_cli_retry_from_multiregistry_bundle(self):
        import hashlib
        import json
        from unittest.mock import patch

        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            package = "texthue-1.0.0"
            urls = []
            for suffix in ("-py3-none-any.whl", ".tar.gz"):
                archive = root / (package + suffix)
                archive.write_bytes(suffix.encode())
                urls.append(
                    {
                        "filename": archive.name,
                        "digests": {"sha256": hashlib.sha256(archive.read_bytes()).hexdigest()},
                    }
                )
            (root / (package + ".tgz")).write_bytes(b"npm")
            (root / "TextHue.1.0.0.nupkg").write_bytes(b"nuget")
            args = ["pypi-state", "--package", "texthue", "--version", "1.0.0", "--dist", directory]
            with patch.object(
                release, "_default_fetch", return_value=json.dumps({"urls": urls}).encode()
            ):
                self.assertEqual(release.main(args), 0)
                (root / (package + ".tar.gz")).unlink()
                with self.assertRaises(release.ReleaseError):
                    release.main(args)

    def test_missing_version_is_absent(self):
        def fetch(_url):
            raise release._NotFound

        state = release.pypi_target_state("texthue", "1.0.0", None, fetch=fetch)
        self.assertEqual(state.state, release.ABSENT)

    def test_transport_error_is_lookup_failed_not_absent(self):
        def fetch(_url):
            raise ConnectionError("boom")

        state = release.pypi_target_state(
            "texthue", "1.0.0", {"texthue-1.0.0.whl": "aaa"}, fetch=fetch
        )
        self.assertEqual(state.state, release.LOOKUP_FAILED)

    def test_matching_digests_is_matching(self):
        def fetch(_url):
            return b'{"urls": [{"filename": "texthue-1.0.0.whl", "digests": {"sha256": "aaa"}}]}'

        state = release.pypi_target_state(
            "texthue", "1.0.0", {"texthue-1.0.0.whl": "aaa"}, fetch=fetch
        )
        self.assertEqual(state.state, release.MATCHING)

    def test_different_digest_is_conflicting(self):
        def fetch(_url):
            return b'{"urls": [{"filename": "texthue-1.0.0.whl", "digests": {"sha256": "bbb"}}]}'

        state = release.pypi_target_state(
            "texthue", "1.0.0", {"texthue-1.0.0.whl": "aaa"}, fetch=fetch
        )
        self.assertEqual(state.state, release.CONFLICTING)

    def test_different_file_set_is_conflicting(self):
        def fetch(_url):
            return b'{"urls": [{"filename": "other-1.0.0.whl", "digests": {"sha256": "aaa"}}]}'

        state = release.pypi_target_state(
            "texthue", "1.0.0", {"texthue-1.0.0.whl": "aaa"}, fetch=fetch
        )
        self.assertEqual(state.state, release.CONFLICTING)


class MavenTargetStateTests(unittest.TestCase):
    def test_all_artifacts_and_partial_visibility(self):
        import zipfile
        from unittest.mock import Mock

        with tempfile.TemporaryDirectory() as directory:
            archive = Path(directory) / "texthue-1.0.0-maven.zip"
            names = [
                "com/hustedev/texthue/1.0.0/texthue-1.0.0" + suffix
                for suffix in (".jar", "-sources.jar", "-javadoc.jar", ".pom", ".module")
            ]
            contents = [name.encode() for name in names]
            with zipfile.ZipFile(archive, "w") as bundle:
                for name, data in zip(names, contents, strict=True):
                    bundle.writestr(name, data)
            for responses, expected in [
                (contents, release.MATCHING),
                ([release._NotFound()] * 5, release.ABSENT),
                ([*contents[:-1], release._NotFound()], release.LOOKUP_FAILED),
                ([release._NotFound(), TimeoutError()], release.LOOKUP_FAILED),
                ([*contents[:-1], b"changed"], release.CONFLICTING),
            ]:
                fetch = Mock(side_effect=responses)
                self.assertEqual(
                    release.maven_target_state("1.0.0", archive, fetch=fetch).state, expected
                )
                self.assertEqual(
                    [call.args[0] for call in fetch.call_args_list],
                    ["https://repo.maven.apache.org/maven2/" + n for n in names[: len(responses)]],
                )


class DartTargetStateTests(unittest.TestCase):
    def test_version_record_and_transport_states(self):
        import hashlib
        import json
        from unittest.mock import Mock

        version = "1.0.0"
        with tempfile.TemporaryDirectory() as directory:
            archive = Path(directory) / "texthue-1.0.0-dart.tar.gz"
            archive.write_bytes(b"tested archive")
            record = dict(
                version=version,
                pubspec=dict(name="texthue", version=version),
                archive_sha256=hashlib.sha256(archive.read_bytes()).hexdigest(),
            )
            for changes, expected in [
                ({}, release.MATCHING),
                ({"archive_sha256": "0" * 64}, release.CONFLICTING),
                ({"retracted": True}, release.CONFLICTING),
                ({"pubspec": {}}, release.LOOKUP_FAILED),
                ({"archive_sha256": ""}, release.LOOKUP_FAILED),
                ({"version": "2.0.0"}, release.LOOKUP_FAILED),
            ]:
                fetch = Mock(return_value=json.dumps(record | changes).encode())
                self.assertEqual(
                    release.dart_target_state(version, archive, fetch=fetch).state, expected
                )
                fetch.assert_called_once_with("https://pub.dev/api/packages/texthue/versions/1.0.0")
            for error, expected in [
                (release._NotFound(), release.ABSENT),
                (TimeoutError(), release.LOOKUP_FAILED),
            ]:
                self.assertEqual(
                    release.dart_target_state(
                        version, archive, fetch=Mock(side_effect=error)
                    ).state,
                    expected,
                )


class CrateTargetStateTests(unittest.TestCase):
    def test_version_checksum_and_registry_failures(self):
        import hashlib
        import json

        with tempfile.TemporaryDirectory() as directory:
            archive = Path(directory) / "texthue-1.0.0.crate"
            archive.write_bytes(b"tested archive")
            row = dict(
                name="texthue",
                vers="1.0.0",
                cksum=hashlib.sha256(archive.read_bytes()).hexdigest(),
                yanked=False,
            )
            for fields, expected in [
                ({}, release.MATCHING),
                ({"vers": "0.9.0"}, release.ABSENT),
                ({"yanked": True}, release.CONFLICTING),
                ({"cksum": "0" * 64}, release.CONFLICTING),
                ({"name": "other"}, release.LOOKUP_FAILED),
                ({"cksum": ""}, release.LOOKUP_FAILED),
            ]:
                data = json.dumps(row | fields).encode()
                self.assertEqual(
                    release.crate_target_state(
                        "1.0.0", archive, fetch=lambda _, data=data: data
                    ).state,
                    expected,
                )
            for data in [b"", b"not JSON", b"{}", b"\n".join([json.dumps(row).encode()] * 2)]:
                self.assertEqual(
                    release.crate_target_state(
                        "1.0.0", archive, fetch=lambda _, data=data: data
                    ).state,
                    release.LOOKUP_FAILED,
                )
            for error, expected in [
                (release._NotFound(), release.ABSENT),
                (TimeoutError(), release.LOOKUP_FAILED),
            ]:

                def fail(_, error=error):
                    raise error

                self.assertEqual(
                    release.crate_target_state("1.0.0", archive, fetch=fail).state, expected
                )


class GoTargetStateTests(unittest.TestCase):
    def test_real_annotated_tag_matches_peeled_commit(self):
        with tempfile.TemporaryDirectory() as directory:

            def git(*args):
                return subprocess.check_output(["git", "-C", directory, *args], text=True).strip()

            git("init", "--quiet")
            identity = ["-c", "user.name=Test", "-c", "user.email=test@example.invalid"]
            git(*identity, "commit", "--allow-empty", "--no-gpg-sign", "-m", "fixture")
            commit = git("rev-parse", "HEAD")
            name = "packages/go/v1.0.0"
            git(*identity, "tag", "--no-sign", "-a", name, "-m", "fixture")
            ref = "refs/tags/" + name
            self.assertEqual(release.tag_state(directory, ref, commit).state, release.MATCHING)
            self.assertEqual(
                release.tag_state(directory, ref, git("rev-parse", ref)).state, release.CONFLICTING
            )

    def test_missing_tag_is_absent(self):
        def run(_command):
            return fake_result(0, stdout="")

        state = release.go_target_state(
            "github.com/HusteDev/texthue/packages/go", "1.0.0", "deadbeef", run=run
        )
        self.assertEqual(state.state, release.ABSENT)

    def test_ls_remote_failure_is_lookup_failed_not_absent(self):
        def run(_command):
            return fake_result(128, stderr="fatal: could not resolve host")

        state = release.go_target_state(
            "github.com/HusteDev/texthue/packages/go", "1.0.0", "deadbeef", run=run
        )
        self.assertEqual(state.state, release.LOOKUP_FAILED)

    def test_tag_at_expected_commit_is_matching(self):
        def run(_command):
            return fake_result(0, stdout="deadbeef\trefs/tags/packages/go/v1.0.0\n")

        state = release.go_target_state(
            "github.com/HusteDev/texthue/packages/go", "1.0.0", "deadbeef", run=run
        )
        self.assertEqual(state.state, release.MATCHING)

    def test_tag_at_different_commit_is_conflicting(self):
        # An existing tag must never be silently reused or moved to make a
        # retry pass; a tag at an unexpected commit is a hard conflict.
        def run(_command):
            return fake_result(0, stdout="feedface\trefs/tags/packages/go/v1.0.0\n")

        state = release.go_target_state(
            "github.com/HusteDev/texthue/packages/go", "1.0.0", "deadbeef", run=run
        )
        self.assertEqual(state.state, release.CONFLICTING)

    def test_one_targets_lookup_failure_does_not_block_another_target(self):
        # This is the scenario the plan calls out explicitly: an existing
        # (or unreachable) Go tag must not block an unrelated npm retry.
        # Each *_target_state call is independent, so this is really an
        # integration property of the caller, exercised here by checking
        # that a Go failure and an npm success can be computed side by side
        # without either function's state leaking into the other.
        def go_run(_command):
            return fake_result(128, stderr="fatal: could not resolve host")

        def npm_run(_command):
            return fake_result(0, stdout='"deadbeef"')

        go_state = release.go_target_state(
            "github.com/HusteDev/texthue/packages/go", "1.0.0", "deadbeef", run=go_run
        )
        npm_state = release.npm_target_state("texthue", "1.0.0", "deadbeef", run=npm_run)
        self.assertEqual(go_state.state, release.LOOKUP_FAILED)
        self.assertEqual(npm_state.state, release.MATCHING)


class ReleaseManifestTests(unittest.TestCase):
    def test_staged_additional_archives_are_verified_on_resume(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            additional = (
                "TextHue.1.0.0.nupkg",
                "texthue-1.0.0.crate",
                "texthue-1.0.0-maven.zip",
                "texthue-react-1.0.0.tgz",
                "texthue-tailwind-1.0.0.tgz",
                "texthue-wasm-1.0.0.tgz",
            )
            for name in (
                "texthue-1.0.0.tgz",
                "texthue-1.0.0.tar.gz",
                "texthue-1.0.0-py3-none-any.whl",
                *additional,
            ):
                (root / name).write_bytes(name.encode())
            manifest = release.ReleaseManifest.from_artifacts(
                "1.0.0", "abc", "text-to-color-v1", root
            )
            (root / "release-manifest.json").write_text(manifest.to_json())
            (root / "SHA256SUMS").write_text(
                "".join(f"{v}  {k}\n" for k, v in manifest.archives.items())
            )
            release.verify_bundle("1.0.0", "abc", root)
            for name in additional:
                with self.subTest(archive=name):
                    archive = root / name
                    archive.write_bytes(b"replacement")
                    with self.assertRaises(release.ReleaseError):
                        release.verify_bundle("1.0.0", "abc", root)
                    archive.unlink()
                    with self.assertRaises(release.ReleaseError):
                        release.verify_bundle("1.0.0", "abc", root)
                    archive.write_bytes(name.encode())

    def test_resume_requires_original_complete_bundle(self):
        import tempfile

        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for suffix in (".tgz", ".tar.gz", "-py3-none-any.whl"):
                (root / f"texthue-1.0.0{suffix}").write_bytes(suffix.encode())
            manifest = release.ReleaseManifest.from_artifacts(
                "1.0.0", "abc", "text-to-color-v1", root
            )
            (root / "release-manifest.json").write_text(manifest.to_json(), encoding="utf-8")
            (root / "SHA256SUMS").write_text(
                "".join(f"{digest}  {name}\n" for name, digest in manifest.archives.items()),
                encoding="utf-8",
            )
            release.verify_bundle("1.0.0", "abc", root)
            with self.assertRaises(release.ReleaseError):
                release.verify_bundle("1.0.0", "def", root)
            archive = root / "texthue-1.0.0.tgz"
            archive.write_bytes(b"rebuilt")
            with self.assertRaises(release.ReleaseError):
                release.verify_bundle("1.0.0", "abc", root)
            archive.unlink()
            with self.assertRaises(release.ReleaseError):
                release.verify_bundle("1.0.0", "abc", root)

    def test_matching_partial_digest_records_cannot_replace_a_required_archive(self):
        import tempfile

        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "texthue-1.0.0.tgz").mkdir()
            for suffix in (".tar.gz", "-py3-none-any.whl"):
                (root / f"texthue-1.0.0{suffix}").write_bytes(suffix.encode())
            partial = release.ReleaseManifest.from_artifacts(
                "1.0.0", "abc", "text-to-color-v1", root
            )
            (root / "release-manifest.json").write_text(partial.to_json(), encoding="utf-8")
            (root / "SHA256SUMS").write_text(
                "".join(f"{digest}  {name}\n" for name, digest in partial.archives.items()),
                encoding="utf-8",
            )
            with self.assertRaisesRegex(release.ReleaseError, "regular files"):
                release.verify_bundle("1.0.0", "abc", root)

    def test_from_artifacts_hashes_every_file_except_the_checksum_list(self, tmp_dir=None):
        import tempfile

        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "texthue-1.0.0.tgz").write_bytes(b"tarball contents")
            (root / "SHA256SUMS").write_text("irrelevant\n", encoding="utf-8")
            manifest = release.ReleaseManifest.from_artifacts(
                "1.0.0", "deadbeefcafefeed", "text-to-color-v1", root
            )
            self.assertEqual(manifest.version, "1.0.0")
            self.assertEqual(manifest.commit, "deadbeefcafefeed")
            self.assertIn("texthue-1.0.0.tgz", manifest.archives)
            self.assertNotIn("SHA256SUMS", manifest.archives)
            # Same bytes always produce the same digest, and the manifest
            # round-trips through JSON without losing anything.
            import json

            reloaded = json.loads(manifest.to_json())
            self.assertEqual(
                reloaded["archives"]["texthue-1.0.0.tgz"], manifest.archives["texthue-1.0.0.tgz"]
            )


class CommandLineTests(unittest.TestCase):
    def test_check_version_cli_fails_closed_on_mismatch(self):
        import io
        from contextlib import redirect_stderr, redirect_stdout
        from unittest import mock

        fake_module = mock.MagicMock()
        fake_module.versions.return_value = {"a": "0.1.0", "b": "0.1.0"}
        with mock.patch.object(release, "_load_check_version_module", return_value=fake_module):
            out, err = io.StringIO(), io.StringIO()
            with redirect_stdout(out), redirect_stderr(err):
                exit_code = release.main(["check-version", "99.99.99"])
        self.assertEqual(exit_code, 1)
        self.assertEqual(out.getvalue(), "")  # no partial/misleading success output
        self.assertIn("99.99.99", err.getvalue())

    def test_check_version_cli_succeeds_on_agreement(self):
        import io
        from contextlib import redirect_stdout
        from unittest import mock

        fake_module = mock.MagicMock()
        fake_module.versions.return_value = {"a": "0.1.0", "b": "0.1.0"}
        with mock.patch.object(release, "_load_check_version_module", return_value=fake_module):
            out = io.StringIO()
            with redirect_stdout(out):
                exit_code = release.main(["check-version", "0.1.0"])
        self.assertEqual(exit_code, 0)
        self.assertEqual(out.getvalue().strip(), "0.1.0")

    def test_check_version_cli_loads_the_real_hyphenated_module(self):
        # Regression test: tools/check-version.py has a hyphen in its
        # filename, so it is not importable via a plain `import
        # check_version`. Exercise the real (non-mocked) loader end to end
        # against the actual manifest, which must currently agree on 0.1.0.
        exit_code = release.main(["check-version", "0.1.0"])
        self.assertEqual(exit_code, 0)


if __name__ == "__main__":
    unittest.main()
