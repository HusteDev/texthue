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
    if (fit.Bytes != ReadRgb(row.GetProperty("rgb")) || fallback.Bytes != ReadRgb(row.GetProperty("fallback"))
        || fallback.Clipped != row.GetProperty("clipped").GetBoolean())
        throw new InvalidDataException($"Display-P3 fit or fallback mismatch for {row}");
}
if (fits.RootElement.GetArrayLength() != 108) throw new InvalidDataException("Unexpected fit corpus size.");
Console.WriteLine("Passed 108 Display-P3 fits and sRGB fallbacks.");
