"""Build the npm tarball, Python wheel and sdist, and test them in isolated consumers.

Outputs go to the ignored ``artifacts/`` directory with a ``SHA256SUMS`` file.
Each archive is installed into a temporary consumer and checked against the
frozen conformance vectors; the sdist is rebuilt and compared to the wheel;
and a separate Go module consumes the package through a local replacement.
Nothing is uploaded.
"""

import hashlib
import json
import os
import shutil
import sys
import tarfile
import tempfile
import zipfile
from email.parser import BytesHeaderParser
from pathlib import Path

from verify import ROOT, environment, load_packages, run

ARTIFACTS = ROOT / "artifacts"


def manifest_package(package_id):
    """Return the tools/packages.json entry for the given package ID."""
    for package in load_packages():
        if package["id"] == package_id:
            return package
    raise SystemExit(f"No package with ID {package_id!r} in tools/packages.json")


def write(path, content):
    """Write UTF-8 text to path, creating parent directories as needed."""
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")


def python_build(package, destination, env, *, source=False):
    """Build a wheel (and optionally an sdist) from package into destination using setuptools directly.

    Stale ``build/`` and ``*.egg-info`` outputs from earlier runs are removed
    first; setuptools would otherwise package files that no longer exist in
    the source tree.
    """
    for stale in [package / "build", *(package / "src").glob("*.egg-info")]:
        shutil.rmtree(stale, ignore_errors=True)
    script = (
        "import setuptools.build_meta as backend; "
        f"backend.build_wheel({str(destination)!r}); "
        + (f"backend.build_sdist({str(destination)!r})" if source else "")
    )
    run("Python distribution build", [sys.executable, "-c", script], cwd=package, env=env)


def check_roster(label, command, directory, env):
    """Run three fresh processes and check both visible colors and the saved placements."""
    expected = {
        "@mira": "@mira #a79de9 #000000 #a79de9",
        "@lee": "@lee #dbb2ee #000000 #cfc163",
        "@nico": "@nico #ec9d89 #000000 #5ec3a5",
    }
    previous = {}
    for users in (["@mira", "@lee"], ["@mira", "@nico"], ["@lee", "@nico", "@mira"]):
        output = run(label, [*command, *users], cwd=directory, env=env)
        if output.splitlines() != [expected[user] for user in users]:
            raise SystemExit(f"{label} produced unexpected badge or board colors: {output}")
        saved = json.loads((directory / "roster.json").read_text(encoding="utf-8"))
        pins = saved["registry"]["assignments"]
        if set(pins) != set(previous).union(users) or any(
            pins[k] != v for k, v in previous.items()
        ):
            raise SystemExit(f"{label} lost or changed a saved placement")
        previous = pins


def main():
    """Build all distributions, verify their contents, and exercise each in an isolated consumer."""
    ARTIFACTS.mkdir(exist_ok=True)
    cache = ROOT / ".cache"
    cache.mkdir(exist_ok=True)
    env = environment()
    npm = shutil.which("npm.cmd" if os.name == "nt" else "npm")
    if not npm:
        raise SystemExit("npm is required; run npm ci first.")
    run("shared package files", [sys.executable, "tools/sync-shared.py", "--check"], env=env)
    run(
        "npm tarball build",
        [
            npm,
            "pack",
            "--workspace",
            manifest_package("npm")["publish"]["packageName"],
            "--pack-destination",
            ARTIFACTS,
        ],
        env=env,
    )
    python_build(ROOT / "packages/python", ARTIFACTS, env, source=True)
    npm_version = json.loads((ROOT / "packages/npm/package.json").read_text(encoding="utf-8"))[
        "version"
    ]
    import tomllib

    python_version = tomllib.loads(
        (ROOT / "packages/python/pyproject.toml").read_text(encoding="utf-8")
    )["project"]["version"]
    npm_archive = ARTIFACTS / f"texthue-{npm_version}.tgz"
    wheel = ARTIFACTS / f"texthue-{python_version}-py3-none-any.whl"
    sdist = ARTIFACTS / f"texthue-{python_version}.tar.gz"
    with tarfile.open(npm_archive) as archive:
        names = set(archive.getnames())
        required = {"package/" + path for path in manifest_package("npm")["archiveRequiredFiles"]}
        if not required <= names:
            raise SystemExit(f"npm archive missing: {required - names}")
        with archive.extractfile("package/package.json") as manifest:
            metadata = json.load(manifest)
        for field in ("dependencies", "optionalDependencies", "peerDependencies"):
            if metadata.get(field):
                raise SystemExit(f"Packed npm library declares {field}: {metadata[field]}")
    with zipfile.ZipFile(wheel) as archive:
        names = set(archive.namelist())
        required = {
            "texthue/" + path for path in manifest_package("python")["archiveRequiredFiles"]
        }
        if not required <= names:
            raise SystemExit(f"Python wheel missing: {required - names}")
        if any(name.endswith(".py") and "/_docs/" in name for name in names):
            raise SystemExit("Python wheel must not bundle example scripts")
        metadata_name = f"texthue-{python_version}.dist-info/METADATA"
        headers = BytesHeaderParser().parsebytes(archive.read(metadata_name))
        if requirements := headers.get_all("Requires-Dist"):
            raise SystemExit(f"Python wheel declares runtime dependencies: {requirements}")
    with tempfile.TemporaryDirectory(prefix="package-check-", dir=cache) as temporary:
        consumer = Path(temporary).resolve()
        if not consumer.is_relative_to(cache.resolve()):
            raise SystemExit("Temporary consumer escaped the workspace cache.")
        write(
            consumer / "package.json",
            '{"name":"texthue-local-consumer","private":true,"type":"module"}\n',
        )
        run(
            "isolated npm installation",
            [
                npm,
                "install",
                "--ignore-scripts",
                "--no-audit",
                "--no-fund",
                "--offline",
                npm_archive,
            ],
            cwd=consumer,
            env=env,
        )
        shutil.copy2(ROOT / "conformance/vectors.json", consumer / "vectors.json")
        write(
            consumer / "check.mjs",
            """import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolveTextColors, TextColorError } from 'texthue';
import { resolveTextColor, resolveTextColors as single } from 'texthue/single';
const fixture = JSON.parse(readFileSync(new URL('./vectors.json', import.meta.url), 'utf8'));
for (const item of fixture.vectors) {
  const actual = resolveTextColors(item.text, item.options);
  assert.deepEqual(single(item.text, item.options), actual);
  for (const theme of ['light', 'dark']) for (const role of ['background', 'fill', 'onFill', 'text']) {
    assert.deepEqual(resolveTextColor(item.text, {theme, role}, item.options), actual[theme][role]);
    assert.equal(actual[theme][role].hex, item.expected[theme][role].hex);
    assert.deepEqual(actual[theme][role].rgb, item.expected[theme][role].rgb);
  }
}
for (const item of fixture.invalid) {
  assert.throws(() => single(item.text, item.options), error => error instanceof TextColorError && error.code === item.code);
  assert.throws(() => resolveTextColors(item.text, item.options), error => error instanceof TextColorError && error.code === item.code);
}
console.log('Packed npm package passed all valid and invalid fixtures.');
""",
        )
        run("packed npm conformance", ["node", "check.mjs"], cwd=consumer, env=env)
        write(
            consumer / "check.ts",
            """import { resolveTextColors, type TextColorOptions, type ColorSet } from 'texthue';
import { resolveTextColor, type Selection } from 'texthue/single';
const selection: Selection = {theme: 'dark', role: 'text'};
const hex: string = resolveTextColor('research', selection).hex;
void hex;
const options: TextColorOptions = { namespace: 'consumer', profiles: { light: { fill: { chromaScale: [0, 0] } } } };
const result: ColorSet = resolveTextColors('research', options);
console.log(result.light.fill.hex);
// @ts-expect-error contrastTarget is numeric, never a string.
const invalid: TextColorOptions = { contrastTarget: '7' };
void invalid;
""",
        )
        write(
            consumer / "tsconfig.json",
            json.dumps(
                {
                    "compilerOptions": {
                        "module": "NodeNext",
                        "moduleResolution": "NodeNext",
                        "target": "ES2022",
                        "strict": True,
                        "noEmit": True,
                    },
                    "files": ["check.ts"],
                }
            ),
        )
        tsc = ROOT / "node_modules/.bin" / ("tsc.cmd" if os.name == "nt" else "tsc")
        run(
            "packed TypeScript declarations",
            [tsc, "-p", consumer / "tsconfig.json"],
            cwd=consumer,
            env=env,
        )
        target = consumer / "python-installed"
        run(
            "isolated wheel installation",
            [
                sys.executable,
                "-m",
                "pip",
                "install",
                "--disable-pip-version-check",
                "--no-index",
                "--no-deps",
                "--target",
                target,
                wheel,
            ],
            cwd=consumer,
            env=env,
        )
        write(
            consumer / "check.py",
            """import json
from pathlib import Path
import texthue
from texthue import resolve_text_colors, TextColorError
assert Path(texthue.__file__).resolve().is_relative_to(Path('python-installed').resolve())
fixture = json.loads(Path('vectors.json').read_text(encoding='utf-8'))
for item in fixture['vectors']:
    actual = resolve_text_colors(item['text'], item['options']).to_dict()
    for theme in ('light', 'dark'):
        for role in ('background', 'fill', 'onFill', 'text'):
            assert actual[theme][role]['hex'] == item['expected'][theme][role]['hex']
            assert actual[theme][role]['rgb'] == item['expected'][theme][role]['rgb']
for item in fixture['invalid']:
    try:
        resolve_text_colors(item['text'], item.get('options', {}))
    except TextColorError as error:
        assert error.code == item['code']
    else:
        raise AssertionError(item['id'])
print('Installed Python wheel passed all valid and invalid fixtures.')
""",
        )
        run(
            "installed wheel conformance",
            [sys.executable, "check.py"],
            cwd=consumer,
            env=dict(env, PYTHONPATH=str(target)),
        )
        source_root = consumer / "source"
        source_root.mkdir()
        with tarfile.open(sdist) as archive:
            archive.extractall(source_root, filter="data")
        rebuilt = consumer / "rebuilt"
        rebuilt.mkdir()
        python_build(source_root / f"texthue-{python_version}", rebuilt, env)
        with zipfile.ZipFile(wheel) as original, zipfile.ZipFile(rebuilt / wheel.name) as second:
            expected, actual = set(original.namelist()), set(second.namelist())
            if expected != actual:
                raise SystemExit(
                    f"Source distribution rebuild changed wheel contents: "
                    f"missing={sorted(expected - actual)}, added={sorted(actual - expected)}"
                )
            for name in sorted(expected):
                if original.read(name) != second.read(name):
                    raise SystemExit(f"Source distribution rebuild changed {name}")
        module = manifest_package("go")["publish"]["modulePath"]
        write(
            consumer / "go.mod",
            f'module example.com/texthue-consumer\n\ngo 1.23.0\n\nrequire {module} v0.0.0\nreplace {module} => "{(ROOT / "packages/go").as_posix()}"\n',
        )
        write(
            consumer / "main.go",
            f"""package main
import (
    "fmt"
    texthue "{module}"
)
func main() {{
    colors, err := texthue.Resolve("research", nil)
    if err != nil {{ panic(err) }}
    if colors.Light.Fill.Hex != "#59b8d8" {{ panic("unexpected color") }}
    fmt.Println(colors.Light.Fill.Hex)
}}
""",
        )
        run("resolve consumer dependencies", ["go", "mod", "tidy"], cwd=consumer, env=env)
        run("isolated Go module consumer", ["go", "run", "."], cwd=consumer, env=env)
        examples = ROOT / "examples/roster"
        js = consumer / "javascript"
        shutil.copytree(examples / "javascript", js)
        check_roster("npm tarball roster", ["node", "roster.mjs"], js, env)
        run(
            "compile TypeScript roster against packed declarations",
            [tsc, "-p", "tsconfig.json"],
            cwd=js,
            env=env,
        )
        check_roster("compiled TypeScript roster", ["node", "typed.mjs"], js / "compiled", env)
        py = consumer / "python"
        shutil.copytree(examples / "python", py)
        check_roster(
            "installed wheel roster",
            [sys.executable, "roster.py"],
            py,
            dict(env, PYTHONPATH=str(target)),
        )
        shutil.copy2(examples / "go/main.go", consumer / "main.go")
        run("vendor Go consumer dependencies", ["go", "mod", "vendor"], cwd=consumer, env=env)
        binary = consumer / ("roster.exe" if os.name == "nt" else "roster")
        run(
            "build Go roster from vendored module",
            ["go", "build", "-mod=vendor", "-o", binary, "."],
            cwd=consumer,
            env=env,
        )
        check_roster("compiled Go roster", [binary], consumer, env)
    checksums = {
        path.name: hashlib.sha256(path.read_bytes()).hexdigest()
        for path in (npm_archive, wheel, sdist)
    }
    write(
        ARTIFACTS / "SHA256SUMS",
        "".join(f"{digest}  {name}\n" for name, digest in checksums.items()),
    )
    print(
        "Package builds and isolated consumers passed. Artifacts are in artifacts/. Nothing was published."
    )


if __name__ == "__main__":
    main()
