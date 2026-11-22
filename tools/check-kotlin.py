"""Compile Kotlin production and test sources, then execute all shared JVM checks."""

import argparse
import contextlib
import json
import os
import shutil
import subprocess
import sys
import tempfile
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


@contextlib.contextmanager
def runtime(args, jar):
    if args.android_serial is None:
        yield [args.java, "-cp", jar]
        return
    dex = jar.with_name("tests.zip")
    subprocess.run(
        [args.d8, "--min-api", "34", "--lib", args.android_jar, "--output", dex, jar], check=True
    )
    adb = [args.adb, "-s", args.android_serial]
    remote = f"/data/local/tmp/texthue-{uuid.uuid4().hex}.jar"
    subprocess.run([*adb, "push", dex, remote], check=True)
    try:
        subprocess.run([*adb, "shell", "chmod", "444", remote], check=True)
        yield [*adb, "shell", "-T", f"CLASSPATH={remote}", "app_process", "/system/bin"]
    finally:
        subprocess.run([*adb, "shell", "rm", "-f", remote], check=True)


def run_suites(runner):
    composites = json.loads((ROOT / "conformance/composite-v1.json").read_text(encoding="utf-8"))
    rows = "".join(
        "{source}\t{alpha}\t{backdrop}\t{expected}\n".format(**row) for row in composites
    )
    subprocess.run(
        [*runner, "com.hustedev.texthue.CompositeTestKt"], input=rows.encode(), check=True
    )
    for corpus, entry in (
        ("identity", "IdentityTestKt"),
        ("gamut", "ColorMathTestKt"),
        ("contrast", "ContrastTestKt"),
        ("formats", "FormatsTestKt"),
        ("repair", "ToneRepairTestKt"),
        ("kotlin-resolver", "ResolverTestKt"),
    ):
        generator = (
            ["node", ROOT / f"tools/{corpus}-vectors.mjs"]
            if corpus in ("repair", "kotlin-resolver")
            else [sys.executable, ROOT / f"tools/{corpus}-vectors.py"]
        )
        rows = subprocess.check_output(generator)
        subprocess.run([*runner, f"com.hustedev.texthue.{entry}"], input=rows, check=True)


def toolchain_defaults():
    if os.name != "nt":
        return "kotlinc", "java"
    studio = Path(os.environ.get("ProgramFiles", "C:/Program Files")) / "Android/Android Studio"
    compiler = studio / "plugins/Kotlin/kotlinc/bin/kotlinc.bat"
    java = studio / "jbr/bin/java.exe"
    return (
        shutil.which("kotlinc.bat") or (str(compiler) if compiler.is_file() else "kotlinc.bat"),
        shutil.which("java") or (str(java) if java.is_file() else "java"),
    )


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    compiler, java = toolchain_defaults()
    parser.add_argument("--kotlinc", default=compiler)
    parser.add_argument("--java", default=java)
    parser.add_argument("--android-serial", help="Run the suite on this API 34+ adb device")
    parser.add_argument("--adb", default="adb")
    parser.add_argument("--d8", default="d8")
    parser.add_argument("--android-jar", help="Android SDK platform android.jar")
    parser.add_argument("--classpath", help="Run suites against Gradle-compiled classes on the JVM")
    args = parser.parse_args()
    if args.classpath:
        if args.android_serial:
            parser.error("--classpath is only supported on the JVM")
        run_suites([args.java, "-cp", args.classpath])
        return
    if args.android_serial and not args.android_jar:
        parser.error("--android-jar is required for Android execution")
    sources = sorted((ROOT / "packages/kotlin/src").rglob("*.kt"))
    cache = ROOT / ".cache"
    cache.mkdir(exist_ok=True)
    with tempfile.TemporaryDirectory(dir=cache) as directory:
        jar = Path(directory) / "conformance.jar"
        env = os.environ.copy()
        java_path = shutil.which(args.java)
        if os.name == "nt" and java_path and not env.get("JAVA_HOME"):
            env["JAVA_HOME"] = str(Path(java_path).resolve().parent.parent)
        subprocess.run([args.kotlinc, *sources, "-include-runtime", "-d", jar], check=True, env=env)
        with runtime(args, jar) as runner:
            run_suites(runner)


if __name__ == "__main__":
    main()
