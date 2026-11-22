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
