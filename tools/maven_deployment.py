"""Wait for the original automatic Central deployment before retrying a release."""

import argparse
import http.client
import json
import os
import time
from uuid import UUID

from release import ReleaseError, validate_version


def fetch_status(deployment_id):
    connection = http.client.HTTPSConnection("central.sonatype.com", timeout=30)
    try:
        connection.request(
            "POST",
            f"/api/v1/publisher/status?id={deployment_id}",
            headers={"Authorization": f"Bearer {os.environ['CENTRAL_TOKEN']}"},
        )
        response = connection.getresponse()
        if response.status != 200:
            raise ReleaseError(f"Central deployment lookup returned HTTP {response.status}")
        return json.loads(response.read())
    finally:
        connection.close()


def wait_for_publication(
    deployment_id, version, *, fetch=fetch_status, sleep=time.sleep, attempts=60
):
    identifier = str(UUID(deployment_id))
    coordinate = f"pkg:maven/com.hustedev/texthue@{validate_version(version)}"
    for attempt in range(attempts):
        status = fetch(identifier)
        if status.get("deploymentId") != identifier:
            raise ReleaseError("Central returned a different deployment ID")
        state = status.get("deploymentState")
        if state == "PUBLISHED":
            if status.get("purls") != [coordinate]:
                raise ReleaseError("Central returned unexpected published coordinates")
            return
        if state not in ("PENDING", "VALIDATING", "VALIDATED", "PUBLISHING"):
            raise ReleaseError(f"Central deployment {identifier} reported state {state!r}")
        if attempt + 1 < attempts:
            sleep(15)
    raise ReleaseError(f"Deployment {identifier} is still {state}. Resume with the same ID.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("deployment_id")
    parser.add_argument("version")
    args = parser.parse_args()
    wait_for_publication(args.deployment_id, args.version)
