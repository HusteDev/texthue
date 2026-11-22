"""Run every local verification check for all three libraries.

Compiles the npm package, type-checks the TypeScript examples, runs the
JavaScript, Python, and Go test suites and examples, checks the frozen
vectors, and validates shared-file copies and documentation links. It never
publishes or uploads anything.
"""

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def load_packages():
    """Return the package list from tools/packages.json."""
    manifest = json.loads((ROOT / "tools/packages.json").read_text(encoding="utf-8"))
    return manifest["packages"]


def package_dir(language):
    """Return the directory (relative to ROOT) of the manifest package with the given language."""
    for package in load_packages():
        if package["language"] == language:
            return package["dir"]
    raise SystemExit(f"No package with language {language!r} in tools/packages.json")


def run(label, command, *, cwd=ROOT, env=None, timeout=180):
    """Run a command, print PASS or FAIL with its label, and exit on failure.

    Returns the command's standard output on success. Output is only echoed
    when the command fails.
    """
    print(f"Checking {label}...", flush=True)
    result = subprocess.run(
        [str(part) for part in command],
        cwd=cwd,
        env=env,
        text=True,
        encoding="utf-8",
        errors="replace",
        capture_output=True,
        timeout=timeout,
    )
    if result.returncode:
        print(result.stdout)
        print(result.stderr, file=sys.stderr)
        raise SystemExit(f"FAILED: {label} ({result.returncode})")
    print(f"PASS: {label}", flush=True)
    return result.stdout


def environment():
    """Return a subprocess environment that keeps Go caches inside the workspace and forces UTF-8 for Python."""
    env = os.environ.copy()
    env.setdefault("GOCACHE", str(ROOT / ".cache/go-build"))
    env.setdefault("GOPATH", str(ROOT / ".cache/go-path"))
    env.setdefault("GOTOOLCHAIN", "local")
    env.setdefault("PYTHONUTF8", "1")
    env["PYTHONDONTWRITEBYTECODE"] = "1"
    return env


def check_links():
    """Fail if any relative Markdown link in the documentation points at a missing file."""
    paths = [ROOT / "README.md", ROOT / "SPECIFICATION.md"]
    paths.extend((ROOT / "docs").glob("*.md"))
    paths.extend((ROOT / "packages").glob("*/README.md"))
    paths.extend((ROOT / "packages").glob("*/SPECIFICATION.md"))
    for path in paths:
        content = re.sub(r"```.*?```", "", path.read_text(encoding="utf-8"), flags=re.DOTALL)
        content = re.sub(r"`[^`]*`", "", content)
        for target in re.findall(r"\[[^\]\n]*\]\(([^)]+)\)", content):
            if "://" in target or target.startswith("#"):
                continue
            destination = path.parent / target.split("#", 1)[0]
            if not destination.exists():
                raise SystemExit(f"Broken local link in {path.relative_to(ROOT)}: {target}")
    print(f"PASS: local links in {len(paths)} documents")


def main():
    """Run all checks in dependency order and exit nonzero on the first failure."""
    ports = {p["id"]: p for p in load_packages() if "verifyCommands" in p}
    parser = argparse.ArgumentParser(description="Verify the primary libraries or a native port.")
    parser.add_argument("--port", choices=sorted(ports), help="Run one port's manifest checks")
    options = parser.parse_args()
    if options.port:
        package = ports[options.port]
        cwd = ROOT / package["dir"]
        for command in package["verifyCommands"]:
            program, *args = command
            if program == "python":
                program = sys.executable
            elif program.startswith("./"):
                program = str(cwd / (program[2:] + (".bat" if os.name == "nt" else "")))
            else:
                program = shutil.which(program + ".exe") if os.name == "nt" else None
                program = program or shutil.which(command[0])
                if not program:
                    raise SystemExit(f"Missing executable: {command[0]}")
            suites = sorted(cwd.glob(package["verifySuites"])) if "{suite}" in args else [None]
            if not suites:
                raise SystemExit(f"No conformance suites matched {package['verifySuites']}")
            for suite in suites:
                argv = [str(suite) if arg == "{suite}" else arg for arg in args]
                run(f"{options.port} {' '.join(argv)}", [program, *argv], cwd=cwd, timeout=1200)
        return
    npm = shutil.which("npm.cmd" if os.name == "nt" else "npm")
    if not npm or not shutil.which("node") or not shutil.which("go"):
        raise SystemExit("Install Node.js 22+, npm, and Go 1.23+ first.")
    env = environment()
    run(
        "shared specifications, notices, and fixtures",
        [sys.executable, "tools/sync-shared.py", "--check"],
        env=env,
    )
    run("TypeScript compilation", [npm, "run", "build"], env=env)
    run("swatch gallery", ["node", "tools/render-gallery.mjs", "--check"], env=env)
    run("assignment vectors", ["node", "tools/build-assign-vectors.mjs", "--check"], env=env)
    run(
        "normalization vectors",
        ["node", "tools/build-normalization-vectors.mjs", "--check"],
        env=env,
    )
    run("preset vectors", ["node", "tools/build-preset-vectors.mjs", "--check"], env=env)
    run("tone repair vectors", ["node", "tools/repair-vectors.mjs", "--check"], env=env)
    run("renderer vectors", ["node", "tools/build-renderer-vectors.mjs", "--check"], env=env)
    run("pinned color tables", ["node", "tools/tune-tables.mjs", "--check"], env=env)
    run("TypeScript public API and examples", [npm, "run", "test:types"], env=env)
    run(
        "JavaScript conformance and color sweeps",
        ["node", "--test", *sorted((ROOT / "tests").glob("*.test.mjs"))],
        env=env,
    )
    run("frozen vector regeneration check", ["node", "tools/build-vectors.mjs", "--check"], env=env)
    run(
        "Python conformance and three-language parity",
        [sys.executable, "-m", "unittest", "discover", "-s", "tests", "-p", "test_*.py"],
        env=env,
    )
    go_dir = package_dir("go")
    run(
        "Go conformance, concurrency, sweeps, and examples",
        ["go", "-C", go_dir, "test", "-count=1", "./..."],
        env=env,
    )
    run("Go static checks", ["go", "-C", go_dir, "vet", "./..."], env=env)
    formatted = run("Go formatting", ["gofmt", "-l", go_dir], env=env)
    if formatted.strip():
        raise SystemExit("Go files need gofmt:\n" + formatted)
    run("Python lint (ruff)", [sys.executable, "-m", "ruff", "check", "."], env=env)
    run("Python formatting (black)", [sys.executable, "-m", "black", "--check", "."], env=env)
    run(
        "JavaScript and TypeScript lint (biome)",
        [npm, "exec", "--no", "--", "biome", "check", "--error-on-warnings", "."],
        env=env,
    )
    if shutil.which("golangci-lint"):
        run(
            "Go lint (golangci-lint)",
            ["golangci-lint", "run", "./..."],
            cwd=ROOT / go_dir,
            env=env,
        )
    else:
        print("SKIP: Go lint (golangci-lint not on PATH; the pre-commit hook and CI run it)")
    npm_package = next(p for p in load_packages() if p["language"] == "javascript")["publish"][
        "packageName"
    ]
    run(
        "JavaScript and CommonJS examples",
        [npm, "run", "examples", "--workspace", npm_package],
        env=env,
    )
    python_dir = package_dir("python")
    python_env = dict(env, PYTHONPATH=str(ROOT / python_dir / "src"))
    for path in sorted((ROOT / python_dir / "examples").glob("*.py")):
        run(f"Python example {path.name}", [sys.executable, path], env=python_env)
    check_links()
    print("All local verification checks passed. No packages were published.")


if __name__ == "__main__":
    main()
