"""Verify the Swift batch example's public CLI from the Swift package directory."""

import subprocess
import sys


def main():
    fills = {"apple": "#5ab95a", "pear": "#a3b662"}
    for arguments in ([], ["pear", "apple", "pear"]):
        result = subprocess.run(
            [
                "swift",
                "run",
                "--force-resolved-versions",
                *sys.argv[1:],
                "TextHueLabels",
                *arguments,
            ],
            stdout=subprocess.PIPE,
            text=True,
            check=True,
        )
        labels = arguments or ["apple", "pear", "apple"]
        expected = [f"{label} {fills[label]} #ffffff" for label in labels]
        if result.stdout.splitlines() != expected:
            raise SystemExit(f"Expected {expected!r}, received {result.stdout!r}")


if __name__ == "__main__":
    main()
