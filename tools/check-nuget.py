"""Install one staged TextHue NuGet archive into an isolated .NET consumer."""

import argparse
import os
import shutil
import subprocess
import tempfile
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path


def verify(archive):
    with zipfile.ZipFile(archive) as package:
        manifests = [name for name in package.namelist() if name.endswith(".nuspec")]
        [manifest] = manifests
        metadata = ET.fromstring(package.read(manifest)).find("{*}metadata")
        package_id = metadata.findtext("{*}id")
        version = metadata.findtext("{*}version")
        if package_id != "TextHue" or not version:
            raise ValueError("Unexpected NuGet identity")
    with tempfile.TemporaryDirectory() as tmp:
        app = Path(tmp)
        feed = app / "feed"
        feed.mkdir()
        shutil.copy2(archive, feed)
        env = dict(os.environ, NUGET_PACKAGES=str(app / "cache"), DOTNET_NOLOGO="1")
        project = ET.Element("Project", Sdk="Microsoft.NET.Sdk")
        settings = ET.SubElement(project, "PropertyGroup")
        ET.SubElement(settings, "TargetFramework").text = "net9.0"
        ET.SubElement(settings, "OutputType").text = "Exe"
        ET.SubElement(
            ET.SubElement(project, "ItemGroup"),
            "PackageReference",
            Include=package_id,
            Version=f"[{version}]",
        )
        ET.ElementTree(project).write(app / "Consumer.csproj", encoding="utf-8")
        (app / "Program.cs").write_text(
            'var renderer = new TextHue.Renderer(scope: "project", seed: 42);\n'
            'var apple = renderer.Batch(["apple", "pear", "apple"])[0];\n'
            'var fill = renderer.Hex("apple");\n'
            'var foreground = renderer.ResolveColor("apple", dark: true, role: "onFill");\n'
            'if (fill != apple.Light["fill"].Hex || foreground.Rgb != apple.Dark["onFill"].Rgb)\n'
            '    throw new System.InvalidOperationException("Single-role and batch outputs differ");\n'
            'System.Console.WriteLine($"{fill} {foreground.Hex}");\n',
            encoding="utf-8",
        )
        subprocess.run(["dotnet", "restore", "--source", str(feed)], cwd=app, env=env, check=True)
        output = subprocess.check_output(
            ["dotnet", "run", "--no-restore", "-c", "Release"], cwd=app, env=env, text=True
        )
        if output.strip() != "#5ab95a #ffffff":
            raise ValueError(f"Unexpected consumer output: {output!r}")
        print(f"PASS: {package_id} {version} isolated NuGet consumer")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", type=Path)
    [archive] = parser.parse_args().directory.glob("*.nupkg")
    verify(archive)
