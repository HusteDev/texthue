using System.Text;
using System.Text.Json;
using TextHue;

using var document = JsonDocument.Parse(File.ReadAllBytes(Path.Combine(AppContext.BaseDirectory, "vectors.json")));
var vectors = document.RootElement.GetProperty("vectors");
if (vectors.GetArrayLength() != 32) throw new InvalidDataException("Unexpected identity corpus size.");
foreach (var row in vectors.EnumerateArray())
{
    var options = row.GetProperty("options");
    var scope = options.TryGetProperty("namespace", out var ns) ? ns.GetString()! : "";
    var seed = options.TryGetProperty("seed", out var value) ? value.GetUInt32() : 0u;
    var digest = Identity.Digest(row.GetProperty("text").GetString()!, scope, seed);
    var hex = Convert.ToHexStringLower(digest);
    var actual = Identity.Fractions(digest);
    var expected = row.GetProperty("fractions");
    if (hex != row.GetProperty("encoding").GetProperty("sha256").GetString()
        || actual != (expected[0].GetDouble(), expected[1].GetDouble(), expected[2].GetDouble()))
        throw new InvalidDataException($"Identity mismatch for {row.GetProperty("id")}");
}
foreach (var malformed in new[] { "\ud800", "\udc00", "\ud800x" })
{
    foreach (var (label, scope) in new[] { (malformed, ""), ("", malformed) })
    {
        try { Identity.Digest(label, scope, 0); }
        catch (EncoderFallbackException) { continue; }
        throw new InvalidDataException("Accepted malformed UTF-16.");
    }
}
Console.WriteLine($"Passed {vectors.GetArrayLength()} shared identity vectors and malformed UTF-16 checks.");

static Rgb ReadRgb(JsonElement values, int i = 0) =>
    new(values[i].GetByte(), values[i + 1].GetByte(), values[i + 2].GetByte());

static Rgb FixtureRgb(JsonElement row, string field)
{
    var bytes = Convert.FromHexString(row.GetProperty(field).GetString()![1..]);
    return new Rgb(bytes[0], bytes[1], bytes[2]);
}

using var composites = JsonDocument.Parse(File.ReadAllBytes(Path.Combine(AppContext.BaseDirectory, "composite-v1.json")));
if (composites.RootElement.GetArrayLength() != 6) throw new InvalidDataException("Unexpected composite corpus size.");
foreach (var row in composites.RootElement.EnumerateArray())
{
    var source = new Color(FixtureRgb(row, "source"));
    var blended = source.CompositeOver(row.GetProperty("alpha").GetDouble(), FixtureRgb(row, "backdrop"));
    if (blended.Hex != row.GetProperty("expected").GetString())
        throw new InvalidDataException($"Composite mismatch: {row} yielded {blended.Hex}");
}
foreach (var invalid in new[] { -0.1, 1.1, double.NaN, double.PositiveInfinity, double.NegativeInfinity })
{
    try { new Color(default).CompositeOver(invalid, default); }
    catch (ArgumentOutOfRangeException) { continue; }
    throw new InvalidDataException($"Accepted invalid alpha {invalid}");
}
Console.WriteLine("Passed six linear-light sRGB composites and invalid alpha checks.");

int measurements = 0;
void Check(Rgb text, Rgb bg, ContrastModel model, Gamut gamut, double expected)
{
    double actual = Contrast.Measure(text, bg, model, gamut);
    if (!double.IsFinite(actual) || Math.Abs(actual - expected) > 1e-12)
        throw new InvalidDataException($"{model} {gamut} {text} on {bg}: expected {expected}, got {actual}.");
    measurements++;
}
using var srgb = JsonDocument.Parse(File.ReadAllBytes(Path.Combine(AppContext.BaseDirectory, "apca-srgb-v1.json")));
foreach (var row in srgb.RootElement.EnumerateArray())
    Check(ReadRgb(row), ReadRgb(row, 3), ContrastModel.Apca, Gamut.SRgb, row[6].GetDouble());
using var p3 = JsonDocument.Parse(File.ReadAllBytes(Path.Combine(AppContext.BaseDirectory, "p3-contrast-v1.json")));
foreach (var row in p3.RootElement.EnumerateArray())
{
    var text = ReadRgb(row.GetProperty("text"));
    var bg = ReadRgb(row.GetProperty("background"));
    Check(text, bg, ContrastModel.Apca, Gamut.DisplayP3, row.GetProperty("lc").GetDouble());
    Check(text, bg, ContrastModel.Wcag2, Gamut.DisplayP3, row.GetProperty("ratio").GetDouble());
}
Check(new(0, 0, 0), new(255, 255, 255), ContrastModel.Wcag2, Gamut.SRgb, 21);
Check(new(255, 0, 0), new(0, 0, 0), ContrastModel.Wcag2, Gamut.SRgb, 5.252);
if (measurements != 1137) throw new InvalidDataException("Unexpected contrast corpus size.");
Console.WriteLine($"Passed {measurements} contrast measurements.");

int colorCount = 0;
double tolerance = document.RootElement.GetProperty("numericTolerance").GetDouble();
foreach (var vector in vectors.EnumerateArray())
foreach (var theme in new[] { "light", "dark" })
foreach (var role in vector.GetProperty("expected").GetProperty(theme).EnumerateObject())
{
    if (role.Name == "contrast") continue;
    var expected = role.Value;
    var rgb = expected.GetProperty("rgb");
    var color = new Color(new(rgb.GetProperty("r").GetByte(), rgb.GetProperty("g").GetByte(), rgb.GetProperty("b").GetByte()));
    bool Matches(double actual, string format, string field) =>
        Math.Abs(actual - expected.GetProperty(format).GetProperty(field).GetDouble()) <= tolerance + 1e-12;
    if (color.Hex != expected.GetProperty("hex").GetString() ||
        !Matches(color.Hsl.H, "hsl", "h") || !Matches(color.Hsl.S, "hsl", "s") || !Matches(color.Hsl.L, "hsl", "l") ||
        !Matches(color.Oklch.L, "oklch", "l") || !Matches(color.Oklch.C, "oklch", "c") || !Matches(color.Oklch.H, "oklch", "h"))
        throw new InvalidDataException($"Format mismatch for {vector.GetProperty("id")} {theme} {role.Name}");
    colorCount++;
}
if (colorCount != 640) throw new InvalidDataException("Unexpected role count.");
Console.WriteLine($"Passed {colorCount} shared role color formats.");

using var fits = JsonDocument.Parse(File.ReadAllBytes(Path.Combine(AppContext.BaseDirectory, "p3-fit-v1.json")));
foreach (var row in fits.RootElement.EnumerateArray())
{
    var fit = Gamut.DisplayP3.Fit(row.GetProperty("l").GetDouble(), row.GetProperty("c").GetDouble(),
                                  row.GetProperty("h").GetDouble());
    var fallback = GamutFit.P3Fallback(fit.Bytes);
    var native = Color.FromDisplayP3(new(fit.Bytes.R / 255.0, fit.Bytes.G / 255.0, fit.Bytes.B / 255.0));
    if (native.Rgb != fallback.Bytes || native.SrgbClipped != fallback.Clipped || native.P3 is null)
        throw new InvalidDataException($"Native Display-P3 rendition mismatch for {row}");
    if (fit.Bytes != ReadRgb(row.GetProperty("rgb")) || fallback.Bytes != ReadRgb(row.GetProperty("fallback"))
        || fallback.Clipped != row.GetProperty("clipped").GetBoolean())
        throw new InvalidDataException($"Display-P3 fit or fallback mismatch for {row}");
}
if (fits.RootElement.GetArrayLength() != 108) throw new InvalidDataException("Unexpected fit corpus size.");
var cssRed = new Color(new Rgb(255, 0, 0));
if (cssRed.ToCss() != "#ff0000" || cssRed.ToCss(CssFormat.Rgb) != "rgb(255 0 0)"
    || cssRed.ToCss(CssFormat.Hsl) != "hsl(0 100% 50%)"
    || cssRed.ToCss(CssFormat.Oklch) != "oklch(0.627955 0.257683 29.23388)"
    || cssRed.ToCss(CssFormat.DisplayP3) != "color(display-p3 0.917488 0.200287 0.138561)")
    throw new InvalidDataException("CSS output differs from the reference renderer.");
var redP3 = Color.FromDisplayP3(new(1, 0, 0));
if (redP3.ToCss(CssFormat.DisplayP3) != redP3.Css || redP3.Css != "color(display-p3 1 0 0)" || redP3.Hex != "#ff0000" || redP3.SrgbClipped != true
    || Math.Abs(redP3.Oklch.L - 0.648574) > 0.000001)
    throw new InvalidDataException("Display-P3 red serialization or native OKLCH mismatch.");
Console.WriteLine("Passed 108 Display-P3 fits and sRGB fallbacks plus native red serialization.");

int repairs = 0;
foreach (var line in File.ReadLines(Path.Combine(AppContext.BaseDirectory, "tone-repair-v1.tsv")))
{
    var fields = line.Split('\t');
    var gamut = fields[0] switch { "SRGB" => Gamut.SRgb, "DISPLAY_P3" => Gamut.DisplayP3, _ => throw new InvalidDataException(line) };
    var model = Enum.Parse<ContrastModel>(fields[1], ignoreCase: true);
    double Number(int i) => double.Parse(fields[i], System.Globalization.CultureInfo.InvariantCulture);
    Rgb Triplet(int i)
    {
        var bytes = fields[i].Split(',');
        return new(byte.Parse(bytes[0]), byte.Parse(bytes[1]), byte.Parse(bytes[2]));
    }
    var background = Triplet(5);
    var tone = gamut.Repair(Number(2), Number(3), Number(4), Number(6),
        rgb => Math.Abs(Contrast.Measure(rgb, background, model, gamut)));
    if (tone.Color.Bytes != Triplet(7) || tone.Color.Lightness != Number(8) ||
        !(Math.Abs(tone.Color.Chroma - Number(9)) <= 1e-12 && Math.Abs(tone.Score - Number(10)) <= 1e-12) ||
        (tone.Fallback ?? "-") != fields[11])
        throw new InvalidDataException($"Repair mismatch for {line}");
    repairs++;
}
var tie = Gamut.SRgb.Repair(0.5, 0, 0, 1, _ => 0);
if (repairs != 192 || tie.Color.Bytes != new Rgb(0, 0, 0) || tie.Fallback != "unattainable-contrast")
    throw new InvalidDataException("Repair corpus size or fallback tie mismatch.");
Console.WriteLine($"Passed {repairs} shared repairs and the tied fallback check.");

int rendered = 0;
foreach (var row in vectors.EnumerateArray())
{
    var options = row.GetProperty("options");
    ThemeProfile? Profile(string theme)
    {
        if (!options.TryGetProperty("profiles", out var profiles) || !profiles.TryGetProperty(theme, out var roles)) return null;
        RoleProfile? Role(string name)
        {
            if (!roles.TryGetProperty(name, out var role)) return null;
            (double, double)? Range(string key) => role.TryGetProperty(key, out var pair)
                ? (pair[0].GetDouble(), pair[1].GetDouble()) : null;
            return new(Range("lightness"), Range("chromaScale"), role.TryGetProperty("chromaCap", out var cap) ? cap.GetDouble() : null);
        }
        return new(Role("fill"), Role("text"));
    }
    Rgb? Background(string theme)
    {
        if (!options.TryGetProperty("backgrounds", out var backgrounds) || !backgrounds.TryGetProperty(theme, out var hex)) return null;
        var bytes = Convert.FromHexString(hex.GetString()![1..]);
        return new(bytes[0], bytes[1], bytes[2]);
    }
    var renderer = new Renderer(options.TryGetProperty("namespace", out var scope) ? scope.GetString()! : "",
        options.TryGetProperty("seed", out var seed) ? seed.GetUInt32() : 0,
        options.TryGetProperty("contrastTarget", out var target) ? target.GetDouble() : 4.5,
        Background("light"), Background("dark"), Profile("light"), Profile("dark"),
        options.TryGetProperty("contrastTargets", out var targets)
            ? targets.EnumerateObject().ToDictionary(p => p.Name, p => p.Value.GetDouble()) : null);
    var palette = renderer.Resolve(row.GetProperty("text").GetString()!);
    var expected = row.GetProperty("expected");
    if (palette.Hue != expected.GetProperty("hue").GetDouble() || palette.HueFraction != expected.GetProperty("hueFraction").GetDouble() ||
        palette.Version != expected.GetProperty("version").GetString() || palette.Source != expected.GetProperty("source").GetString())
        throw new InvalidDataException($"Renderer identity mismatch for {row.GetProperty("id")}");
    foreach (var (theme, colors) in new[] { ("light", palette.Light), ("dark", palette.Dark) })
    {
        var report = theme == "light" ? palette.LightContrast : palette.DarkContrast;
        if (report.Count != 7) throw new InvalidDataException("Missing contrast relationships.");
        foreach (var (pair, result) in report)
        {
            var reference = expected.GetProperty(theme).GetProperty("contrast").GetProperty(pair);
            if (Math.Abs(result.Ratio - reference.GetProperty("ratio").GetDouble()) > 1e-10 ||
                result.MeetsTarget != reference.GetProperty("meetsTarget").GetBoolean() ||
                result.LightnessAdjusted != reference.GetProperty("lightnessAdjusted").GetBoolean() ||
                result.ChromaCapped != reference.GetProperty("chromaCapped").GetBoolean() ||
                result.ChromaReduced != reference.GetProperty("chromaReduced").GetBoolean() ||
                result.Fallback != reference.GetProperty("fallback").GetString())
                throw new InvalidDataException($"Contrast report mismatch for {row.GetProperty("id")} {theme} {pair}: {result} vs {reference}");
        }
        if (colors.Count != 10) throw new InvalidDataException("Missing roles.");
        foreach (var (role, color) in colors)
            if (renderer.Hex(row.GetProperty("text").GetString()!, theme == "dark", role) != color.Hex ||
                renderer.ResolveColor(row.GetProperty("text").GetString()!, theme == "dark", role).Oklch != color.Oklch ||
                color.Hex != expected.GetProperty(theme).GetProperty(role).GetProperty("hex").GetString())
                throw new InvalidDataException($"Renderer mismatch for {row.GetProperty("id")} {theme} {role}");
    }
    rendered++;
}
if (rendered != 32) throw new InvalidDataException("Unexpected renderer corpus size.");
Console.WriteLine($"Passed {rendered} two-theme renderer cases.");

var batchRenderer = new Renderer("scope", 42);
string[] labels = ["é", "", "e\u0301", "é", "\0", "e\u0301"];
var batch = batchRenderer.Batch(labels.Where(_ => true));
if (batch.Count != labels.Length || batchRenderer.Batch([]).Count != 0 ||
    !ReferenceEquals(batch[0], batch[3]) || !ReferenceEquals(batch[2], batch[5]) || batch[0].Hue == batch[2].Hue)
    throw new InvalidDataException("Batch identity or duplicate reuse mismatch.");
for (int i = 0; i < labels.Length; i++)
{
    var single = batchRenderer.Resolve(labels[i]);
    if (batch[i].Hue != single.Hue || batch[i].HueFraction != single.HueFraction)
        throw new InvalidDataException($"Batch identity mismatch at {i}");
    foreach (var (actual, expected) in new[] { (batch[i].Light, single.Light), (batch[i].Dark, single.Dark) })
        foreach (var (role, color) in expected)
            if (actual[role].Hex != color.Hex) throw new InvalidDataException($"Batch role mismatch at {i}: {role}");
}
try
{
    batchRenderer.Batch(["ok", "\ud800"]);
    throw new InvalidDataException("Batch accepted malformed UTF-16.");
}
catch (EncoderFallbackException) { }
if (batchRenderer.Batch(["ok"])[0].Hue != batchRenderer.Resolve("ok").Hue)
    throw new InvalidDataException("Failed batch affected later resolution.");
Console.WriteLine("Passed ordered batch, duplicate, Unicode and failure checks.");

using var presets = JsonDocument.Parse(File.ReadAllBytes(Path.Combine(AppContext.BaseDirectory, "presets-v1.json")));
foreach (var row in presets.RootElement.EnumerateArray())
{
    var options = row.GetProperty("options");
    var preset = Enum.Parse<Preset>(options.GetProperty("preset").GetString()!, true);
    var model = Enum.Parse<ContrastModel>(options.GetProperty("contrastModel").GetString()!, true);
    var renderer = new Renderer(preset: preset, contrastModel: model,
        contrastTarget: options.TryGetProperty("contrastTarget", out var target) ? target.GetDouble() : null);
    var palette = renderer.Resolve(row.GetProperty("text").GetString()!);
    foreach (var (theme, colors) in new[] { ("light", palette.Light), ("dark", palette.Dark) })
        foreach (var role in row.GetProperty(theme).EnumerateObject())
            if (colors[role.Name].Hex != role.Value.GetString())
                throw new InvalidDataException($"Preset mismatch for {options} {theme} {role.Name}");
}
if (presets.RootElement.GetArrayLength() != 20) throw new InvalidDataException("Unexpected preset corpus size.");
Console.WriteLine("Passed 20 two-theme preset cases.");

foreach (var model in Enum.GetValues<ContrastModel>())
foreach (var policy in Enum.GetValues<ForegroundPolicy>())
foreach (bool high in new[] { false, true })
{
    Rgb[] candidates = [new(85, 102, 119), new(0, 0, 0), new(255, 255, 255)];
    var renderer = new Renderer(contrastModel: model, foregroundPolicy: policy, foregrounds: candidates,
        contrastTarget: model == ContrastModel.Apca ? (high ? 106 : 0) : (high ? 21 : 1));
    candidates[0] = new(255, 0, 0);
    var palette = renderer.Resolve("foreground");
    var actual = from theme in new[] { palette.Light, palette.Dark }
                 from role in new[] { "fill", "onFill", "fillHover" }
                 select theme[role].Hex;
    string darkFill = model == ContrastModel.Apca ? "#002206" : "#000000";
    string[] expected = high
        ? ["#ffffff", "#000000", "#ffffff", darkFill, "#ffffff", darkFill]
        : ["#72da7e", policy == ForegroundPolicy.Best ? "#000000" : "#556677", "#6ad277",
           "#2e7137", policy == ForegroundPolicy.Best ? "#ffffff" : "#556677", "#32793c"];
    if (!actual.SequenceEqual(expected)) throw new InvalidDataException($"Foreground mismatch for {model} {policy} {high}.");
}
try
{
    _ = new Renderer(foregrounds: []);
    throw new InvalidDataException("Empty foreground list accepted.");
}
catch (ArgumentException) { }
Console.WriteLine("Passed eight foreground selection cases, input snapshot and empty-list checks.");

(HueArc Allowed, HueArc[] Excluded, double Hue, string Light, string Dark)[] hueCases =
[
    (new(300, 60), [new(350, 10)], 341.06283164159765, "#e496c8", "#7e3668"),
    (new(10, 220), [new(30, 80), new(70, 120), new(190, 240)], 181.9565484774379, "#6dbbae", "#2f5650"),
    (new(0, 360), [new(120, 110)], 119.10628316415976, "#a4b566", "#4b532c"),
    (new(35.125, 35.25), [], 35.238828539551996, "#e39d8b", "#7f3e2e"),
    (new(0, 360), [new(50, 50)], 327.8261939097516, "#e491e2", "#793778")
];
foreach (var test in hueCases)
{
    var palette = new Renderer(hueRange: test.Allowed, excludeHues: test.Excluded).Resolve("a");
    if (Math.Abs(palette.Hue - test.Hue) > 1e-12 || palette.Light["fill"].Hex != test.Light || palette.Dark["fill"].Hex != test.Dark)
        throw new InvalidDataException($"Hue mismatch for {test.Allowed}");
}
(HueArc Allowed, HueArc[] Excluded)[] invalidDomains =
[
    (new(0, 0), []), (new(360, 0), []), (new(0, 360), [new(0, 360)]),
    (new(0, 360), new HueArc[17]), (new(0, 361), []), (new(0, 360), [new(double.NaN, 2)])
];
foreach (var test in invalidDomains)
{
    try { _ = new Renderer(hueRange: test.Allowed, excludeHues: test.Excluded); }
    catch (ArgumentException) { continue; }
    throw new InvalidDataException("Accepted invalid hue domain.");
}
Console.WriteLine("Passed five reference hue assignments and six invalid domains.");

PaletteEntry[] entries = [new("red", new(171,18,52)), new("gray", Dark: new(119,119,119)),
    new("blue", new(16,32,171), new(34,51,205))];
foreach (var order in new[] { entries, entries.Reverse().ToArray() })
{
    var results = new Renderer(palette: order).Batch(["apple","pear","a","b","x","z"]);
    string[] expected = ["#1020ab","#ab1234","#1020ab","#1020ab","#ab1234","#777777"];
    if (!results.Select(p => p.Light["fill"].Hex).SequenceEqual(expected) ||
        results[0].Dark["fill"].Hex != "#2233cd" || results.Any(p => p.Source != "palette"))
        throw new InvalidDataException("Approved palette rank mismatch.");
}
var brand = new Renderer(palette: entries, overrides: new Dictionary<string, BrandColors> {
    ["team"] = new(new(171,18,52), new(119,119,119)) }).Resolve("team");
if (brand.Source != "override" || brand.HueFraction != 0.01669445425766595 ||
    brand.Light["fillHover"].Hex != "#8e313b" || brand.Dark["fillActive"].Hex != "#868686")
    throw new InvalidDataException("Brand override mismatch.");
var filtered = new Renderer(contrastTarget: 21, foregrounds: [new(255,255,255)],
    palette: [new("red",new(0,0,0),new(255,255,255)),new("gray",new(0,0,0))]);
if (filtered.Resolve("pear").Dark["fill"].Hex != "#000000" ||
    new Renderer(contrastTarget: 21, foregrounds: [new(255,255,255)], palette: entries)
    .Resolve("pear").Light["fill"].Hex != "#ab1234")
    throw new InvalidDataException("Palette contrast filter mismatch.");
foreach (var invalid in new PaletteEntry[][] { [], [entries[0], entries[0]], [new("missing")] })
{
    try { _ = new Renderer(palette: invalid); }
    catch (ArgumentException) { continue; }
    throw new InvalidDataException("Invalid palette accepted.");
}
Console.WriteLine("Passed approved palette ranks, contrast filtering, fixed overrides and validation.");
using var normalizedCases = JsonDocument.Parse(File.ReadAllBytes(Path.Combine(AppContext.BaseDirectory, "normalization-v1.json")));
if (normalizedCases.RootElement.GetArrayLength() != 90) throw new InvalidDataException("Unexpected normalization corpus size.");
foreach (var row in normalizedCases.RootElement.EnumerateArray())
{
    var rules = row.GetProperty("normalize");
    var norm = new Normalization(Enum.Parse<UnicodeForm>(rules.GetProperty("unicode").GetString()!, true),
        rules.GetProperty("case").GetString() == "lower", Enum.Parse<Whitespace>(rules.GetProperty("whitespace").GetString()!, true));
    var label = row.GetProperty("text").GetString()!;
    var scope = row.GetProperty("namespace").GetString()!;
    var seed = row.GetProperty("seed").GetUInt32();
    var hash = Identity.Digest(norm.Apply(label), norm.Apply(scope), seed);
    if (Convert.ToHexStringLower(hash) != row.GetProperty("digest").GetString() ||
        Math.Abs(new Renderer(scope, seed, normalization: norm).Resolve(label).Hue - row.GetProperty("hue").GetDouble()) > 1e-12)
        throw new InvalidDataException($"Normalization mismatch: {row}");
}
var folding = new Normalization(UnicodeForm.NFC, true);
var pins = new Dictionary<string, BrandColors> { ["É"] = new(new(1,2,3),new(4,5,6)) };
var same = new Renderer(overrides: pins, normalization: folding).Batch(["É","e\u0301"]);
if (same[0].Source != "override" || !ReferenceEquals(same[0], same[1])) throw new InvalidDataException("Normalized lookup failed.");
pins.Add("é", default);
try { _ = new Renderer(overrides: pins, normalization: folding); throw new InvalidDataException("Normalized collision accepted."); }
catch (ArgumentException) { }
Console.WriteLine("Passed 90 normalization vectors, normalized overrides and batch reuse.");
using var collections = JsonDocument.Parse(File.ReadAllBytes(Path.Combine(AppContext.BaseDirectory, "assign-vectors.json")));
using var corpus = args.Length == 0 ? null : JsonDocument.Parse(File.ReadAllBytes(args.Single()));
if (corpus != null && corpus.RootElement.GetArrayLength() != 300)
    throw new InvalidDataException("Expected 300 separation cases");
var collectionRows = collections.RootElement.EnumerateArray().AsEnumerable();
if (corpus != null) collectionRows = collectionRows.Concat(corpus.RootElement.EnumerateArray());
foreach (var row in collectionRows)
{
    bool lower = false;
    var collectionOverrides = new Dictionary<string, BrandColors>();
    if (row.TryGetProperty("options", out var opts))
    {
        lower = opts.TryGetProperty("normalize", out var norm) && norm.GetProperty("case").GetString() == "lower";
        if (opts.TryGetProperty("overrides", out var overrides))
            foreach (var e in overrides.EnumerateObject())
            {
                Rgb ReadHex(string theme)
                {
                    string value = (e.Value.ValueKind == JsonValueKind.String ? e.Value : e.Value.GetProperty(theme)).GetString()!;
                    var bytes = Convert.FromHexString(value[1..]);
                    return new(bytes[0], bytes[1], bytes[2]);
                }
                collectionOverrides.Add(e.Name, new(ReadHex("light"), ReadHex("dark")));
            }
    }
    static Dictionary<string, Placement> Placements(JsonElement value) =>
        value.EnumerateObject().ToDictionary(e => e.Name, e => new Placement(e.Value.GetProperty("hueFraction").GetDouble(),
            e.Value.GetProperty("ring").GetInt64(), e.Value.GetProperty("moved").GetBoolean()));
    var registry = row.TryGetProperty("pinned", out var previous) ? Placements(previous) : null;
    bool generated = row.TryGetProperty("labels", out var generatedLabels);
    var collectionLabels = (generated ? generatedLabels : row.GetProperty("texts")).EnumerateArray().Select(s => s.GetString()!).ToArray();
    var result = new Renderer(normalization: new Normalization(Lowercase: lower), overrides: collectionOverrides)
        .Assign(collectionLabels, registry);
    var expected = Placements(row.GetProperty("assignments"));
    if (expected.Count != result.Assignments.Count || expected.Any(e => result.Assignments[e.Key] != e.Value))
        throw new InvalidDataException("Placement mismatch");
    if (generated)
    {
        var fills = row.GetProperty("fills");
        for (int i = 0; i < collectionLabels.Length; i++)
        {
            var palette = result.Colors[collectionLabels[i]];
            if (palette.Light["fill"].Hex != fills[i][0].GetString() || palette.Dark["fill"].Hex != fills[i][1].GetString())
                throw new InvalidDataException($"Assigned fills differ for {collectionLabels[i]}");
        }
    }
    else foreach (var fill in row.GetProperty("lightFills").EnumerateObject())
        if (result.Colors[fill.Name].Light["fill"].Hex != fill.Value.GetString()) throw new InvalidDataException("Assigned fill mismatch");
    var report = row.GetProperty("report");
    var closest = report.GetProperty("closestPairs").EnumerateArray().Select(pair => (pair[0].GetString()!, pair[1].GetString()!));
    if (result.Report.MinDistance is not double distance || Math.Abs(distance - report.GetProperty("minDistance").GetDouble()) > 1e-12 ||
        result.Report.WithinRingCapacity != report.GetProperty("withinRingCapacity").GetBoolean() ||
        result.Report.DistinctFills != report.GetProperty("distinctFills").GetBoolean() || !closest.SequenceEqual(result.Report.ClosestPairs))
        throw new InvalidDataException("Assignment report mismatch");
}
Console.WriteLine($"Passed {collectionRows.Count()} collection assignment vectors.");

var gray = new Rgb(119, 119, 119);
foreach (var model in new[] { ContrastModel.Wcag2, ContrastModel.Apca })
{
    var strictRenderer = new Renderer(contrastModel: model, foregrounds: [gray],
        overrides: new Dictionary<string, BrandColors> { ["fixed"] = new(gray, gray) });
    foreach (var role in new[] { "fill", "onFill" })
    {
        if (strictRenderer.Hex("fixed", role: role) != "#777777") throw new InvalidDataException("Fallback changed");
        try { strictRenderer.HexStrict("fixed", role: role); }
        catch (InvalidOperationException) { continue; }
        throw new InvalidDataException($"Expected strict contrast failure for {model} {role}");
    }
    if (strictRenderer.HexStrict("fixed", role: "background") != "#ffffff")
        throw new InvalidDataException("Unconstrained background changed");
}
Console.WriteLine("Passed strict WCAG and APCA role selection.");

using var rendererVectors = JsonDocument.Parse(File.ReadAllBytes(Path.Combine(AppContext.BaseDirectory, "renderer-v1.json")));
int checkedApcaReports = 0;
foreach (var row in rendererVectors.RootElement.GetProperty("vectors").EnumerateArray())
{
    var options = row.GetProperty("options");
    if (!options.TryGetProperty("contrastModel", out var model) || model.GetString() != "apca") continue;
    Rgb ReadHexColor(JsonElement hex)
    {
        var bytes = Convert.FromHexString(hex.GetString()![1..]);
        return new(bytes[0], bytes[1], bytes[2]);
    }
    var renderer = new Renderer(contrastModel: ContrastModel.Apca,
        contrastTarget: options.GetProperty("contrastTarget").GetDouble(),
        foregrounds: options.TryGetProperty("foregrounds", out var candidates)
            ? candidates.EnumerateArray().Select(ReadHexColor) : null,
        overrides: options.TryGetProperty("overrides", out var fixedColors)
            ? fixedColors.EnumerateObject().ToDictionary(e => e.Name, e => new BrandColors(ReadHexColor(e.Value), ReadHexColor(e.Value))) : null);
    var palette = renderer.Resolve(row.GetProperty("text").GetString()!);
    var role = row.GetProperty("role").GetString()!;
    foreach (var (theme, report) in new[] { ("light", palette.LightContrast), ("dark", palette.DarkContrast) })
    {
        var expected = row.GetProperty("themes").GetProperty(theme).GetProperty("contrast");
        var actual = report[role];
        if (actual.Model != ContrastModel.Apca ||
            Math.Abs(actual.Value - expected.GetProperty("value").GetDouble()) > 1e-10 ||
            Math.Abs(actual.Ratio - expected.GetProperty("ratio").GetDouble()) > 1e-10 ||
            actual.MeetsTarget != expected.GetProperty("meetsTarget").GetBoolean() ||
            actual.LightnessAdjusted != expected.GetProperty("lightnessAdjusted").GetBoolean() ||
            actual.ChromaCapped != expected.GetProperty("chromaCapped").GetBoolean() ||
            actual.ChromaReduced != expected.GetProperty("chromaReduced").GetBoolean() ||
            actual.Fallback != expected.GetProperty("fallback").GetString())
            throw new InvalidDataException($"APCA report mismatch for {theme} {role}: {actual} vs {expected}");
        checkedApcaReports++;
    }
}
if (checkedApcaReports < 10) throw new InvalidDataException("Missing APCA report fixtures");
Console.WriteLine($"Passed {checkedApcaReports} frozen APCA relationship reports.");
