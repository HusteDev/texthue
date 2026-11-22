"""Check verifier failure diagnostics on a restricted Windows console encoding."""

import os
import subprocess
import sys
import unittest
from pathlib import Path


class VerifierDiagnosticsTests(unittest.TestCase):
    def test_child_failure_survives_console_encoding(self):
        root = Path(__file__).resolve().parents[1]
        child = "import os; os.write(1, bytes.fromhex('e29c94')); os.write(2, bytes.fromhex('f09f8c88')); raise SystemExit(7)"
        driver = (
            "import runpy,sys; run=runpy.run_path('tools/verify.py')['run']; "
            f"run('parity', [sys.executable, '-c', {child!r}])"
        )
        result = subprocess.run(
            [sys.executable, "-c", driver],
            cwd=root,
            env={**os.environ, "PYTHONIOENCODING": "cp1252:strict"},
            capture_output=True,
        )
        self.assertNotEqual(result.returncode, 0)
        self.assertIn(rb"\u2714", result.stdout)
        self.assertIn(rb"\U0001f308", result.stderr)
        self.assertIn(b"FAILED: parity (7)", result.stderr)
