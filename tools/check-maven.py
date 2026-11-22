"""Run a separate Kotlin/JVM application against the local Maven staging repository."""

import argparse
import os
import subprocess
import tempfile
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
KOTLIN = ROOT / "packages/kotlin"


def check_consumer(repository, version):
    with tempfile.TemporaryDirectory() as temp:
        app = Path(temp)
        (app / "settings.gradle").write_text(
            """pluginManagement { repositories { gradlePluginPortal(); mavenCentral() } }
dependencyResolutionManagement {
    repositories {
        exclusiveContent {
            forRepository { maven { url = uri(System.getenv('TEXTHUE_STAGING_REPO')) } }
            filter { includeGroup 'com.hustedev' }
        }
        mavenCentral()
    }
}
rootProject.name = 'consumer'
""",
            encoding="utf-8",
        )
        (app / "build.gradle").write_text(
            """plugins {
    id 'org.jetbrains.kotlin.jvm' version '2.2.21'
    id 'application'
}
dependencies { implementation "com.hustedev:texthue:${System.getenv('TEXTHUE_STAGING_VERSION')}" }
application { mainClass = 'MainKt' }
""",
            encoding="utf-8",
        )
        sources = app / "src/main/kotlin"
        sources.mkdir(parents=True)
        (sources / "Main.kt").write_text(
            """import com.hustedev.texthue.Resolver

fun main() {
    val tones = Resolver(namespace = "project", seed = 42u).batch(listOf("apple", "pear", "apple"))
    check(tones[0] == tones[2])
    println(tones[0].light.color("fill").hex + " " + tones[0].dark.color("onFill").hex)
}
""",
            encoding="utf-8",
        )
        env = dict(
            os.environ, TEXTHUE_STAGING_REPO=repository.as_uri(), TEXTHUE_STAGING_VERSION=version
        )
        wrapper = KOTLIN / ("gradlew.bat" if os.name == "nt" else "gradlew")
        output = subprocess.check_output(
            [str(wrapper), "--quiet", "--console=plain", "-p", str(app), "run"], env=env, text=True
        )
        if output.strip() != "#5ab95a #ffffff":
            raise ValueError(f"Unexpected packaged consumer output: {output!r}")
        print(f"PASS: com.hustedev:texthue:{version} Maven consumer")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--stage", type=Path, help="Save the consumer-tested repository ZIP")
    args = parser.parse_args()
    repository = KOTLIN / "build/repository"
    coordinate = Path("com/hustedev/texthue")
    version = ET.parse(repository / coordinate / "maven-metadata.xml").findtext(
        "./versioning/release"
    )
    if not version or not all(part.isdecimal() for part in version.split(".")):
        raise ValueError("Expected a numeric Maven release version")
    if args.stage is None:
        check_consumer(repository, version)
        return
    with tempfile.TemporaryDirectory() as temp:
        root = Path(temp)
        bundle = root / f"texthue-{version}-maven.zip"
        with zipfile.ZipFile(bundle, "w") as archive:
            for suffix in (".jar", "-sources.jar", "-javadoc.jar", ".pom", ".module"):
                member = coordinate / version / f"texthue-{version}{suffix}"
                archive.write(repository / member, member.as_posix())
        extracted = root / "repository"
        with zipfile.ZipFile(bundle) as archive:
            archive.extractall(extracted)
        check_consumer(extracted, version)
        args.stage.mkdir(parents=True, exist_ok=True)
        with (args.stage / bundle.name).open("xb") as output:
            output.write(bundle.read_bytes())


if __name__ == "__main__":
    main()
