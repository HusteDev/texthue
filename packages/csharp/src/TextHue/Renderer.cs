using System.Collections.Frozen;
using System.Security.Cryptography;
using System.Text;

namespace TextHue;

public sealed record RenderedPalette(double HueFraction, double Hue,
    IReadOnlyDictionary<string, Color> Light, IReadOnlyDictionary<string, Color> Dark)
{
    public string Version => "text-to-color-v1";
    public string Source { get; internal init; } = "hash";
}

public sealed record RoleProfile((double Low, double High)? Lightness = null,
    (double Low, double High)? ChromaScale = null, double? ChromaCap = null)
{
    internal void Validate()
    {
        foreach (var range in new[] { Lightness, ChromaScale })
            if (range is { } r && !(r.Low >= 0 && r.Low <= r.High && r.High <= 1))
                throw new ArgumentException("Profile ranges must increase within [0, 1].");
        if (ChromaCap is double cap && !(cap >= 0 && cap <= 0.4))
            throw new ArgumentOutOfRangeException(nameof(ChromaCap));
    }
}

public sealed record ThemeProfile(RoleProfile? Fill = null, RoleProfile? Text = null);

public enum ForegroundPolicy { Best, FirstPassing }
public enum Preset { Labels, Controls, Chart, Subdued, Mono }

public readonly record struct BrandColors(Rgb Light, Rgb Dark);
public sealed record PaletteEntry(string Id, Rgb? Light = null, Rgb? Dark = null);

public sealed partial class Renderer
{
    private sealed class FixedTone(Rgb rgb)
    {
        private readonly Color color = new(rgb);
        public Rgb Bytes => color.Rgb;
        public bool Neutral => color.Oklch.C == 0;
        public double Hue => Math.Floor(color.Oklch.H * 1024 + 0.5) / 1024 % 360;
        public double Lightness => Math.Floor(color.Oklch.L * 4096 + 0.5) / 4096;
    }

    private readonly FrozenDictionary<string, (FixedTone Light, FixedTone Dark)> overrides;
    private readonly List<(byte[] Id, FixedTone Light, FixedTone Dark)> palette = [];
    private readonly Normalization normalization;
    private readonly string scope;
    private readonly HueDomain hueDomain;
    private readonly uint seed;
    private readonly Rgb[] candidates;
    private readonly ForegroundPolicy foregroundPolicy;
    private readonly ContrastModel contrastModel;
    private readonly (double Low, double High) chromaScale;
    private readonly double contrastTarget;
    private readonly FrozenDictionary<string, double> targets;
    private readonly ThemeProfile lightProfile, darkProfile;
    private readonly Color lightBackground, darkBackground;

    public Renderer(string scope = "", uint seed = 0, double? contrastTarget = null,
                    Rgb? lightBackground = null, Rgb? darkBackground = null,
                    ThemeProfile? lightProfile = null, ThemeProfile? darkProfile = null,
                    IReadOnlyDictionary<string, double>? contrastTargets = null,
                    ContrastModel contrastModel = ContrastModel.Wcag2, Preset preset = Preset.Labels,
                    IEnumerable<Rgb>? foregrounds = null, ForegroundPolicy foregroundPolicy = ForegroundPolicy.Best,
                    HueArc? hueRange = null, IReadOnlyList<HueArc>? excludeHues = null,
                    IReadOnlyDictionary<string, BrandColors>? overrides = null, IEnumerable<PaletteEntry>? palette = null,
                    Normalization? normalization = null)
    {
        if (!Enum.IsDefined(contrastModel)) throw new ArgumentOutOfRangeException(nameof(contrastModel));
        if (!Enum.IsDefined(foregroundPolicy)) throw new ArgumentOutOfRangeException(nameof(foregroundPolicy));
        hueDomain = new(hueRange ?? new HueArc(0, 360), excludeHues ?? []);
        this.foregroundPolicy = foregroundPolicy;
        candidates = foregrounds?.ToArray() ?? [new(0, 0, 0), new(255, 255, 255)];
        if (candidates.Length == 0) throw new ArgumentException("Expected at least one foreground.", nameof(foregrounds));
        this.contrastModel = contrastModel;
        chromaScale = preset switch
        {
            Preset.Labels or Preset.Controls => (0.6, 0.8),
            Preset.Chart => (0.8, 1), Preset.Subdued => (0.2, 0.4), Preset.Mono => (0, 0),
            _ => throw new ArgumentOutOfRangeException(nameof(preset))
        };
        this.contrastTarget = contrastTarget ?? (contrastModel == ContrastModel.Apca ? 60 : preset == Preset.Controls ? 7 : 4.5);
        bool Valid(double x) => contrastModel == ContrastModel.Apca ? x is >= 0 and <= 106 : x is >= 1 and <= 21;
        if (!Valid(this.contrastTarget))
            throw new ArgumentOutOfRangeException(nameof(contrastTarget));
        targets = contrastTargets?.ToFrozenDictionary(StringComparer.Ordinal) ?? FrozenDictionary<string, double>.Empty;
        foreach (var (role, value) in targets)
            if (role is not ("fill" or "fillHover" or "fillActive" or "border" or "text" or "textOnSubtle" or "strong")
                || !Valid(value))
                throw new ArgumentException("Invalid contrast relationship or target.", nameof(contrastTargets));
        this.lightProfile = lightProfile ?? new();
        this.darkProfile = darkProfile ?? new();
        foreach (var profile in new[] { this.lightProfile, this.darkProfile })
        {
            profile.Fill?.Validate();
            profile.Text?.Validate();
        }
        var utf8 = new UTF8Encoding(false, true);
        this.normalization = normalization ?? new();
        var normalized = new Dictionary<string,(FixedTone Light, FixedTone Dark)>(StringComparer.Ordinal);
        if (overrides is not null)
            foreach (var (key, colors) in overrides)
                normalized.Add(this.normalization.Apply(key), (new(colors.Light), new(colors.Dark)));
        this.overrides = normalized.ToFrozenDictionary(StringComparer.Ordinal);
        if (palette is not null)
        {
            var ids = new HashSet<string>(StringComparer.Ordinal);
            foreach (var entry in palette)
            {
                if (!ids.Add(entry.Id)) throw new ArgumentException("Duplicate palette ID.", nameof(palette));
                var light = entry.Light ?? entry.Dark ?? throw new ArgumentException("Missing palette color.", nameof(palette));
                this.palette.Add((utf8.GetBytes(entry.Id), new(light), new(entry.Dark ?? light)));
            }
            if (this.palette.Count == 0) throw new ArgumentException("Empty palette.", nameof(palette));
            double threshold = targets.GetValueOrDefault("fill", this.contrastTarget);
            bool Passes(FixedTone tone) => candidates.Any(candidate =>
                Math.Abs(Contrast.Measure(candidate, tone.Bytes, contrastModel)) >= threshold);
            var passing = this.palette.FindAll(entry => Passes(entry.Light) && Passes(entry.Dark));
            if (passing.Count > 0) this.palette = passing;
        }
        this.scope = this.normalization.Apply(scope);
        this.seed = seed;
        this.lightBackground = new(lightBackground ?? new Rgb(255, 255, 255));
        this.darkBackground = new(darkBackground ?? new Rgb(18, 18, 18));
    }

    public IReadOnlyList<RenderedPalette> Batch(IEnumerable<string> labels)
    {
        ArgumentNullException.ThrowIfNull(labels);
        var cache = new Dictionary<string, RenderedPalette>(StringComparer.Ordinal);
        var result = new List<RenderedPalette>();
        foreach (var label in labels)
        {
            string key = normalization.Apply(label);
            if (!cache.TryGetValue(key, out var palette))
            {
                palette = ResolveNormalized(key);
                cache.Add(key, palette);
            }
            result.Add(palette);
        }
        return result.AsReadOnly();
    }

    public RenderedPalette Resolve(string text) => ResolveNormalized(normalization.Apply(text));

    private readonly record struct Mapping(double Fraction, double Hue, double UL, double UC,
        FixedTone? Light = null, FixedTone? Dark = null, string Source = "hash", int Ring = 0);

    private static readonly string[] Roles = ["background", "subtle", "muted", "fill", "onFill",
        "fillHover", "fillActive", "border", "text", "strong"];

    private RenderedPalette ResolveNormalized(string text) => Render(Map(text));

    private RenderedPalette Render(Mapping mapping)
    {
        IReadOnlyDictionary<string, Color> Theme(bool dark)
        {
            var bytes = RoleRenderer(mapping, dark);
            return Roles.ToFrozenDictionary(role => role, role => new Color(bytes(role)));
        }
        return new(mapping.Fraction, mapping.Hue, Theme(false), Theme(true)) { Source = mapping.Source };
    }

    public Color ResolveColor(string text, bool dark = false, string role = "fill") =>
        new(SelectedBytes(text, dark, role));

    public string Hex(string text, bool dark = false, string role = "fill") =>
        Color.FormatHex(SelectedBytes(text, dark, role));

    private Rgb SelectedBytes(string text, bool dark, string role) =>
        RoleRenderer(Map(normalization.Apply(text)), dark)(role);

    private Mapping Map(string text, byte[]? digest = null)
    {
        if (overrides.TryGetValue(text, out var pinned)) return Fixed(pinned.Light, pinned.Dark, "override");
        digest ??= Identity.Digest(text, scope, seed);
        if (palette.Count > 0)
        {
            byte[] best = [];
            var winner = palette[0];
            foreach (var entry in palette)
            {
                var rank = SHA256.HashData((byte[])[.. digest, .. entry.Id]);
                if (rank.AsSpan().SequenceCompareTo(best) <= 0) continue;
                best = rank;
                winner = entry;
            }
            return Fixed(winner.Light, winner.Dark, "palette");
        }
        var (uH, uL, uC) = Identity.Fractions(digest);
        return new(uH, MappedHue(uH), uL, uC);
    }

    private double MappedHue(double fraction)
    {
        double position = fraction * 12;
        int i = (int)position;
        var anchors = Tables.Anchors;
        return hueDomain.Map((anchors[i] + (anchors[i + 1] - anchors[i]) * (position - i)) % 360);
    }

    private static Mapping Fixed(FixedTone light, FixedTone dark, string source)
    {
        var anchors = Tables.Anchors;
        double angle = light.Hue < anchors[0] ? light.Hue + 360 : light.Hue;
        int i = Array.FindLastIndex(anchors, anchor => anchor <= angle);
        double fraction = (i + (angle - anchors[i]) / (anchors[i + 1] - anchors[i])) / 12;
        return new(fraction, light.Hue, 0.5, 0.5, light, dark, source);
    }

    private Func<string, Rgb> RoleRenderer(Mapping mapping, bool dark)
    {
        var fixedTone = dark ? mapping.Dark : mapping.Light;
        double hue = fixedTone?.Hue ?? mapping.Hue, uL = mapping.UL, uC = mapping.UC;
        var background = dark ? darkBackground : lightBackground;
        double lb = Math.Floor(background.Oklch.L * 4096 + 0.5) / 4096;
        var profile = dark ? darkProfile : lightProfile;
        double Target(string role) => targets.GetValueOrDefault(role, role == "border" && contrastModel == ContrastModel.Wcag2 ? Math.Min(3, contrastTarget) : contrastTarget);
        int direction = dark ? 1 : -1;
        double Sample(bool fill)
        {
            (double low, double high) = (dark, fill) switch
            {
                (true, true) => (0.4, 0.5), (false, false) => (0.43, 0.53), _ => (0.72, 0.82)
            };
            if ((fill ? profile.Fill : profile.Text)?.Lightness is { } range) (low, high) = range;
            var bias = Tables.Biases[(dark ? 2 : 0) + (fill ? 0 : 1)];
            int sector = (int)(hue / 30);
            double offset = bias[sector] + (bias[(sector + 1) % 12] - bias[sector]) * (hue / 30 - sector);
            return Math.Clamp(low + (high - low) * uL + offset + RingOffsets[mapping.Ring], 0, 1);
        }

        double Score(Rgb text, Rgb bg) => Math.Abs(Contrast.Measure(text, bg, contrastModel));
        Rgb Foreground(Rgb rgb, double required)
        {
            var best = candidates[0];
            double bestScore = -1;
            foreach (var candidate in candidates)
            {
                double score = Score(candidate, rgb);
                if (foregroundPolicy == ForegroundPolicy.FirstPassing && score >= required) return candidate;
                if (score > bestScore)
                {
                    best = candidate;
                    bestScore = score;
                }
            }
            return best;
        }
        Rgb Tone(double value, bool fill, double target, Rgb? back = null, Rgb? second = null, bool surface = false)
        {
            double l = Math.Clamp(value, 0, 1);
            var role = fill ? profile.Fill : profile.Text;
            var (low, high) = role?.ChromaScale ?? chromaScale;
            double c = fixedTone?.Neutral == true ? 0 : Math.Min(role?.ChromaCap ?? (fill ? 0.16 : 0.19), Gamut.SRgb.Cusp(l, hue) * ((low + (high - low) * uC) * (mapping.Ring < 3 ? 1 : 0.6)));
            double secondary = second.HasValue ? Target("textOnSubtle") : 0;
            return Gamut.SRgb.Repair(l, c, hue, target == 0 ? secondary : target, rgb =>
            {
                double primary = back is Rgb bg ? (surface ? Score(bg, rgb) : Score(rgb, bg)) : Score(Foreground(rgb, target), rgb);
                if (second is not Rgb other || secondary == 0) return primary;
                double otherScore = Score(rgb, other);
                return target == 0 ? otherScore : Math.Min(primary, otherScore * (target / secondary));
            }).Color.Bytes;
        }

        double lf = fixedTone?.Lightness ?? Sample(true), lt = Sample(false);
        double unconstrained = contrastModel == ContrastModel.Apca ? 0 : 1;
        Rgb? subtle = null, fill = null, onFill = null;
        Rgb Subtle() => subtle ??= Tone(lb + direction * 0.04, true, unconstrained);
        Rgb Fill() => fill ??= fixedTone?.Bytes ?? Tone(lf, true, Target("fill"));
        Rgb OnFill() => onFill ??= Foreground(Fill(), Target("fill"));
        return role => role switch
        {
            "background" => background.Rgb,
            "subtle" => Subtle(),
            "muted" => Tone(lb + direction * 0.10, true, unconstrained),
            "fill" => Fill(),
            "onFill" => OnFill(),
            "fillHover" => Tone(lf + direction * 0.025, true, Target("fillHover"), OnFill(), surface: true),
            "fillActive" => Tone(lf + direction * 0.05, true, Target("fillActive"), OnFill(), surface: true),
            "border" => Tone(lb + direction * 0.39, true, Target("border"), background.Rgb),
            "text" => Tone(lt, false, Target("text"), background.Rgb, Subtle()),
            "strong" => Tone(lt + direction * 0.10, false, Target("strong"), background.Rgb),
            _ => throw new ArgumentOutOfRangeException(nameof(role), role, "Unknown color role.")
        };
    }
}
