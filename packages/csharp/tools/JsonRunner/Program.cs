using System.Text.Json;
using System.Text.Json.Nodes;
using TextHue;

try
{
    var requests = JsonNode.Parse(Console.OpenStandardInput())!.AsArray();
    var results = requests.Select(request =>
    {
        if (request!["config"] != null || request["exportConfig"]?.GetValue<bool>() == true)
            throw new ArgumentException("Configuration replay is unsupported.");
        var options = request["options"]?.AsObject() ?? new JsonObject();
        var renderer = Compile(options);
        var palette = renderer.Resolve((string)request["text"]!);
        var target = (double?)options["contrastTarget"] ?? ((string?)options["contrastModel"] == "apca"
            ? 60 : (string?)options["preset"] == "controls" ? 7 : 4.5);
        return new { palette.Version, palette.Source, palette.Hue, palette.HueFraction,
            Light = Theme(palette.Light, palette.LightContrast, target),
            Dark = Theme(palette.Dark, palette.DarkContrast, target) };
    }).ToArray();
    Console.Write(JsonSerializer.Serialize(results, new JsonSerializerOptions(JsonSerializerDefaults.Web)));
    return 0;
}
catch (Exception error)
{
    Console.Error.WriteLine(error.Message);
    return 1;
}

static object Theme(IReadOnlyDictionary<string, Color> colors, IReadOnlyDictionary<string, ContrastRelationship> report, double target)
{
    var contrast = new Dictionary<string, object> { ["target"] = target };
    foreach (var (key, pair) in report)
    {
        var fields = new Dictionary<string, object?> {
            ["ratio"] = pair.Ratio, ["meetsTarget"] = pair.MeetsTarget, ["fallback"] = pair.Fallback,
            ["lightnessAdjusted"] = pair.LightnessAdjusted, ["chromaCapped"] = pair.ChromaCapped,
            ["chromaReduced"] = pair.ChromaReduced
        };
        if (pair.Model == ContrastModel.Apca) { fields["model"] = "apca"; fields["value"] = pair.Value; }
        contrast[key] = fields;
    }
    var theme = colors.ToDictionary(e => e.Key, e => (object)e.Value);
    theme["contrast"] = contrast;
    return theme;
}

static Renderer Compile(JsonObject o)
{
    static Rgb Hex(JsonNode? node)
    {
        string hex = (string)node!;
        if (hex.Length != 7 || hex[0] != '#') throw new ArgumentException("Invalid hex color");
        var bytes = Convert.FromHexString(hex[1..]);
        return new(bytes[0], bytes[1], bytes[2]);
    }
    static Rgb? OptionalHex(JsonNode? value) => value == null ? null : Hex(value);
    static (double, double)? Range(JsonNode? value) => value == null ? null : ((double)value[0]!, (double)value[1]!);
    static HueArc Arc(JsonNode? value) => new((double)value![0]!, (double)value[1]!);
    static T Choice<T>(JsonNode? node, T fallback) where T : struct, Enum =>
        node == null ? fallback : Enum.Parse<T>(node.GetValue<string>(), true);
    static RoleProfile? Role(JsonNode? node) => node == null ? null : new(Range(node["lightness"]),
        Range(node["chromaScale"]), (double?)node["chromaCap"]);
    ThemeProfile? Profile(string theme) => o["profiles"]?[theme] is JsonNode node
        ? new(Role(node["fill"]), Role(node["text"])) : null;
    var normal = o["normalize"];
    var policy = (string?)o["foregroundPolicy"] switch {
        "first-passing" => ForegroundPolicy.FirstPassing, null or "best" => ForegroundPolicy.Best,
        _ => throw new ArgumentException("Unknown foreground policy") };
    if (o["gamut"] != null && (string?)o["gamut"] != "srgb") throw new ArgumentException("Renderer supports sRGB");
    return new Renderer(scope: (string?)o["namespace"] ?? "", seed: (uint?)o["seed"] ?? 0,
        contrastTarget: (double?)o["contrastTarget"], lightBackground: OptionalHex(o["backgrounds"]?["light"]),
        darkBackground: OptionalHex(o["backgrounds"]?["dark"]), lightProfile: Profile("light"), darkProfile: Profile("dark"),
        contrastTargets: o["contrastTargets"]?.AsObject().ToDictionary(e => e.Key, e => (double)e.Value!),
        contrastModel: Choice(o["contrastModel"], ContrastModel.Wcag2), preset: Choice(o["preset"], Preset.Labels),
        foregrounds: o["foregrounds"]?.AsArray().Select(Hex), foregroundPolicy: policy,
        hueRange: o["hueRange"] is JsonNode range ? Arc(range) : null, excludeHues: o["excludeHues"]?.AsArray().Select(Arc).ToArray(),
        overrides: o["overrides"]?.AsObject().ToDictionary(e => e.Key, e => e.Value is JsonValue
            ? new BrandColors(Hex(e.Value), Hex(e.Value)) : new(Hex(e.Value!["light"]), Hex(e.Value["dark"]))),
        palette: o["palette"]?.AsArray().Select(e => new PaletteEntry((string)e!["id"]!, OptionalHex(e["light"]), OptionalHex(e["dark"]))),
        normalization: new Normalization(Choice(normal?["unicode"], UnicodeForm.None), (string?)normal?["case"] == "lower",
            Choice(normal?["whitespace"], Whitespace.None)));
}
