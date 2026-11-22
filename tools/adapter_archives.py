"""Select the exact release archives, or pack workspace copies for a local test."""

import argparse
import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def adapter_archives(npm, adapter, temporary):
    parser = argparse.ArgumentParser()
    parser.add_argument("--archives", type=Path, help="Test existing release tarballs")
    directory = parser.parse_args().archives
    archives = []
    for package in ("npm", adapter):
        source = ROOT / "packages" / package
        if directory is None:
            output = subprocess.check_output(
                [npm, "pack", "--json", "--pack-destination", str(temporary)], cwd=source, text=True
            )
            archive = temporary / json.loads(output)[0]["filename"]
        else:
            metadata = json.loads((source / "package.json").read_text())
            stem = metadata["name"].removeprefix("@").replace("/", "-")
            archive = directory / f"{stem}-{metadata['version']}.tgz"
        archives.append(str(archive.resolve(strict=True)))
    return archives
