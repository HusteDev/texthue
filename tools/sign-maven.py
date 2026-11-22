"""Sign the five immutable Maven artifacts from a staged TextHue release ZIP."""

import argparse
import hashlib
import io
import re
import subprocess
import tempfile
import zipfile
from pathlib import Path


def sign_bundle(source, destination, version, fingerprint):
    if not re.fullmatch(r"[0-9]+\.[0-9]+\.[0-9]+", version):
        raise ValueError("Invalid release version")
    if not re.fullmatch(r"[0-9a-fA-F]{40}|[0-9a-fA-F]{64}", fingerprint):
        raise ValueError("Expected a full GPG fingerprint")
    stem = f"com/hustedev/texthue/{version}/texthue-{version}"
    names = [stem + suffix for suffix in (".jar", "-sources.jar", "-javadoc.jar", ".pom", ".module")]
    signed = io.BytesIO()
    with zipfile.ZipFile(source) as original, zipfile.ZipFile(signed, "w") as result:
        if sorted(original.namelist()) != sorted(names):
            raise ValueError("Incomplete or unexpected staged Maven artifact set")
        with tempfile.TemporaryDirectory() as tmp:
            for name in names:
                data = original.read(name)
                artifact = Path(tmp) / Path(name).name
                artifact.write_bytes(data)
                signature = Path(str(artifact) + ".asc")
                subprocess.run(["gpg", "--batch", "--armor", "--local-user", fingerprint,
                                "--detach-sign", "--output", str(signature), str(artifact)], check=True)
                subprocess.run(["gpg", "--batch", "--verify", str(signature), str(artifact)], check=True)
                result.writestr(name, data)
                result.writestr(name + ".asc", signature.read_bytes())
                for algorithm in ("md5", "sha1", "sha256", "sha512"):
                    digest = hashlib.new(algorithm, data, usedforsecurity=False).hexdigest()
                    result.writestr(f"{name}.{algorithm}", digest)
    with destination.open("xb") as output:
        output.write(signed.getbuffer())


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("destination", type=Path)
    parser.add_argument("version")
    parser.add_argument("fingerprint")
    options = parser.parse_args()
    sign_bundle(options.source, options.destination, options.version, options.fingerprint)
