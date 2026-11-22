"""Send the original staged TextHue crate using Cargo's registry publish protocol."""

import argparse
import io
import json
import os
import struct
import tarfile
import tomllib
import urllib.request
from pathlib import Path


def publish_body(archive, version):
    data = archive.read_bytes()
    prefix = f"texthue-{version}/"
    with tarfile.open(fileobj=io.BytesIO(data), mode="r:gz") as bundle:
        manifest = tomllib.loads(bundle.extractfile(prefix + "Cargo.toml").read().decode())
        package = manifest["package"]
        if (package["name"], package["version"]) != ("texthue", version):
            raise ValueError("Mismatched crate identity")
        readme = bundle.extractfile(prefix + package["readme"]).read().decode()
    deps = []
    if "target" in manifest:
        raise ValueError("Target-specific dependencies require a registry metadata mapping")
    for section, kind in (
        ("dependencies", "normal"),
        ("dev-dependencies", "dev"),
        ("build-dependencies", "build"),
    ):
        for alias, spec in manifest.get(section, {}).items():
            if spec.keys() - {"version", "features", "optional", "default-features", "package"}:
                raise ValueError(f"Unsupported dependency metadata for {alias}")
            deps.append(
                dict(
                    name=spec.get("package", alias),
                    version_req=spec["version"],
                    kind=kind,
                    features=spec.get("features", []),
                    optional=spec.get("optional", False),
                    default_features=spec.get("default-features", True),
                    target=None,
                    registry=None,
                    explicit_name_in_toml=alias if "package" in spec else None,
                )
            )
    metadata = dict(
        name="texthue",
        vers=version,
        deps=deps,
        features=manifest.get("features", {}),
        readme=readme,
        readme_file=package["readme"],
        license_file=package.get("license-file"),
        badges=manifest.get("badges", {}),
        links=package.get("links"),
        rust_version=package.get("rust-version"),
    )
    for field in ("description", "repository", "documentation", "homepage", "license"):
        metadata[field] = package.get(field)
    for field in ("authors", "keywords", "categories"):
        metadata[field] = package.get(field, [])
    header = json.dumps(metadata).encode()
    return struct.pack("<I", len(header)) + header + struct.pack("<I", len(data)) + data


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("version")
    parser.add_argument("archive", type=Path)
    parser.add_argument("--upload", action="store_true")
    args = parser.parse_args()
    body = publish_body(args.archive, args.version)
    if not args.upload:
        print(f"Validated {len(body)}-byte publication request")
        return
    request = urllib.request.Request(
        "https://crates.io/api/v1/crates/new",
        data=body,
        method="PUT",
        headers={
            "Authorization": os.environ["CARGO_REGISTRY_TOKEN"],
            "Content-Type": "application/octet-stream",
            "Accept": "application/json",
            "User-Agent": "TextHue release (github.com/HusteDev/texthue)",
        },
    )
    with urllib.request.urlopen(request, timeout=90) as response:
        result = json.load(response)
    if not isinstance(result, dict) or "errors" in result:
        raise ValueError(f"Cargo registry rejected publication: {result}")


if __name__ == "__main__":
    main()
