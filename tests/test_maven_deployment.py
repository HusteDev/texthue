import sys
import unittest
from pathlib import Path
from unittest.mock import Mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))
from maven_deployment import ReleaseError, wait_for_publication  # noqa: E402

ID = "fa82f9a7-52bd-4911-a595-638541f2c1ab"
PUBLISHED = dict(
    deploymentId=ID, deploymentState="PUBLISHED", purls=["pkg:maven/com.hustedev/texthue@1.0.0"]
)


class DeploymentTests(unittest.TestCase):
    def test_pending_through_publication(self):
        fetch = Mock(
            side_effect=[
                PUBLISHED | {"deploymentState": s}
                for s in ("PENDING", "VALIDATING", "VALIDATED", "PUBLISHING", "PUBLISHED")
            ]
        )
        sleep = Mock()
        wait_for_publication(ID, "1.0.0", fetch=fetch, sleep=sleep)
        self.assertEqual(sleep.call_count, 4)

    def test_incomplete_failed_or_unrelated_status_stops_release(self):
        for changes in (
            {"deploymentState": "PENDING"},
            {"deploymentState": "FAILED"},
            {"deploymentState": "unknown"},
            {"deploymentId": "other"},
            {"purls": []},
        ):
            with self.subTest(changes=changes), self.assertRaises(ReleaseError):
                wait_for_publication(
                    ID, "1.0.0", fetch=Mock(return_value=PUBLISHED | changes), attempts=1
                )
