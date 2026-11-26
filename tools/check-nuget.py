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
        ET.SubElement(settings, "TargetFramework").text = "net10.0"
        ET.SubElement(settings, "OutputType").text = "Exe"
        ET.SubElement(
            ET.SubElement(project, "ItemGroup"),
            "PackageReference",
            Include=package_id,
            Version=f"[{version}]",
        )
        ET.ElementTree(project).write(app / "Consumer.csproj", encoding="utf-8")
        (app / "Program.cs").write_text(
            """using System;
using System.Collections.Generic;
using TextHue;

var renderer = new Renderer(scope: "project", seed: 42);
var apple = renderer.Batch(["apple", "pear", "apple"])[0];
var fill = renderer.Hex("apple");
var foreground = renderer.ResolveColor("apple", dark: true, role: "onFill");
if (fill != apple.Light["fill"].Hex || foreground.Rgb != apple.Dark["onFill"].Rgb)
    throw new InvalidOperationException("Single-role and batch outputs differ");

var gray = new Rgb(119, 119, 119);
var constrained = new Renderer(contrastModel: ContrastModel.Apca, foregrounds: [gray],
    overrides: new Dictionary<string, BrandColors> { ["fixed"] = new(gray, gray) });
var first = constrained.Assign(["fixed", "apple"]);
var extended = constrained.Assign(["fixed", "apple", "pear"], first.Assignments);
if (extended.Assignments["apple"] != first.Assignments["apple"])
    throw new InvalidOperationException("Replay moved a pinned label");
var palette = extended.Colors["fixed"];
foreach (var report in new[] { palette.LightContrast, palette.DarkContrast })
{
    var pair = report["fill"];
    if (pair.Model != ContrastModel.Apca || pair.MeetsTarget || pair.Value != 0 ||
        pair.Ratio != 1 || pair.Fallback != "palette-constraint")
        throw new InvalidOperationException("Missing fixed-fill diagnostics");
}
bool rejected = false;
try { constrained.HexStrict("fixed", role: "onFill"); }
catch (InvalidOperationException) { rejected = true; }
if (!rejected) throw new InvalidOperationException("Strict selection accepted an unmet target");
Console.WriteLine($"{fill} {foreground.Hex}");
""",
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
