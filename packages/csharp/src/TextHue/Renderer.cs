using System.Collections.Frozen;
using System.Security.Cryptography;
using System.Text;

namespace TextHue;

public sealed record ContrastRelationship(double Ratio, bool MeetsTarget, bool LightnessAdjusted,
    bool ChromaCapped, bool ChromaReduced, string? Fallback, ContrastModel Model, double Value);

public sealed record RenderedPalette(double HueFraction, double Hue,
    IReadOnlyDictionary<string, Color> Light, IReadOnlyDictionary<string, Color> Dark)
{
    public IReadOnlyDictionary<string, ContrastRelationship> LightContrast { get; internal init; } = FrozenDictionary<string, ContrastRelationship>.Empty;
    public IReadOnlyDictionary<string, ContrastRelationship> DarkContrast { get; internal init; } = FrozenDictionary<string, ContrastRelationship>.Empty;
    public bool Equals(RenderedPalette? other) => other is not null && HueFraction.Equals(other.HueFraction)
        && Hue.Equals(other.Hue) && Source == other.Source && ResultEquality.SameMap(Light, other.Light)
        && ResultEquality.SameMap(Dark, other.Dark) && ResultEquality.SameMap(LightContrast, other.LightContrast)
        && ResultEquality.SameMap(DarkContrast, other.DarkContrast);

    public override int GetHashCode() => HashCode.Combine(HueFraction, Hue, Source,
        ResultEquality.MapHash(Light), ResultEquality.MapHash(Dark),
        ResultEquality.MapHash(LightContrast), ResultEquality.MapHash(DarkContrast));

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
                throw TextHueErrors.WithCode(new ArgumentException("Profile ranges must increase within [0, 1]."));
        if (ChromaCap is double cap && !(cap >= 0 && cap <= 0.4))
            throw TextHueErrors.WithCode(new ArgumentOutOfRangeException(nameof(ChromaCap)));
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
    private readonly Gamut gamut;
    private readonly EncodedRgb[] candidates;
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
                    Normalization? normalization = null, Gamut gamut = Gamut.SRgb)
    {
        if (!Enum.IsDefined(contrastModel)) throw TextHueErrors.WithCode(new ArgumentOutOfRangeException(nameof(contrastModel)));
        if (!Enum.IsDefined(foregroundPolicy)) throw TextHueErrors.WithCode(new ArgumentOutOfRangeException(nameof(foregroundPolicy)));
        hueDomain = new(hueRange ?? new HueArc(0, 360), excludeHues ?? []);
        this.foregroundPolicy = foregroundPolicy;
        if (!Enum.IsDefined(gamut)) throw TextHueErrors.WithCode(new ArgumentOutOfRangeException(nameof(gamut)));
        this.gamut = gamut;
        candidates = (foregrounds ?? [new Rgb(0, 0, 0), new Rgb(255, 255, 255)]).Select(rgb => gamut.FromSRgb(rgb)).ToArray();
        if (candidates.Length == 0) throw TextHueErrors.WithCode(new ArgumentException("Expected at least one foreground.", nameof(foregrounds)));
        this.contrastModel = contrastModel;
        chromaScale = preset switch
        {
            Preset.Labels or Preset.Controls => (0.6, 0.8),
            Preset.Chart => (0.8, 1), Preset.Subdued => (0.2, 0.4), Preset.Mono => (0, 0),
            _ => throw TextHueErrors.WithCode(new ArgumentOutOfRangeException(nameof(preset)))
        };
        this.contrastTarget = contrastTarget ?? (contrastModel == ContrastModel.Apca ? 60 : preset == Preset.Controls ? 7 : 4.5);
        bool Valid(double x) => contrastModel == ContrastModel.Apca ? x is >= 0 and <= 106 : x is >= 1 and <= 21;
        if (!Valid(this.contrastTarget))
            throw TextHueErrors.WithCode(new ArgumentOutOfRangeException(nameof(contrastTarget)));
        targets = contrastTargets?.ToFrozenDictionary(StringComparer.Ordinal) ?? FrozenDictionary<string, double>.Empty;
        foreach (var (role, value) in targets)
            if (role is not ("fill" or "fillHover" or "fillActive" or "border" or "text" or "textOnSubtle" or "strong")
                || !Valid(value))
                throw TextHueErrors.WithCode(new ArgumentException("Invalid contrast relationship or target.", nameof(contrastTargets)));
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
                if (!normalized.TryAdd(this.normalization.Apply(key, "INVALID_OPTIONS"), (new(colors.Light), new(colors.Dark))))
                    throw TextHueErrors.WithCode(new ArgumentException("Duplicate normalized override.", nameof(overrides)));
        this.overrides = normalized.ToFrozenDictionary(StringComparer.Ordinal);
        if (palette is not null)
        {
            var ids = new HashSet<string>(StringComparer.Ordinal);
            foreach (var entry in palette)
            {
                if (!ids.Add(entry.Id)) throw TextHueErrors.WithCode(new ArgumentException("Duplicate palette ID.", nameof(palette)));
                var light = entry.Light ?? entry.Dark ?? throw TextHueErrors.WithCode(new ArgumentException("Missing palette color.", nameof(palette)));
                byte[] id;
                try { id = utf8.GetBytes(entry.Id); }
                catch (EncoderFallbackException error) { TextHueErrors.WithCode(error); throw; }
                this.palette.Add((id, new(light), new(entry.Dark ?? light)));
            }
            if (this.palette.Count == 0) throw TextHueErrors.WithCode(new ArgumentException("Empty palette.", nameof(palette)));
            double threshold = targets.GetValueOrDefault("fill", this.contrastTarget);
            bool Passes(FixedTone tone) => candidates.Any(candidate =>
                Math.Abs(Contrast.MeasureChannels(candidate, gamut.FromSRgb(tone.Bytes), contrastModel, gamut)) >= threshold);
            var passing = this.palette.FindAll(entry => Passes(entry.Light) && Passes(entry.Dark));
            if (passing.Count > 0) this.palette = passing;
        }
        this.scope = this.normalization.Apply(scope, "INVALID_OPTIONS");
        this.seed = seed;
        this.lightBackground = new(lightBackground ?? new Rgb(255, 255, 255));
        this.darkBackground = new(darkBackground ?? new Rgb(18, 18, 18));
    }

    public IReadOnlyList<RenderedPalette> Batch(IEnumerable<string> labels)
    {
        if (labels is null) throw TextHueErrors.WithCode(new ArgumentNullException(nameof(labels)), "INVALID_TEXT");
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
        (FrozenDictionary<string, Color> Colors, FrozenDictionary<string, ContrastRelationship> Report) Theme(bool dark)
        {
            var flags = new Dictionary<string, ToneFlags>();
            var render = RoleRenderer(mapping, dark, flags);
            var channels = Roles.ToDictionary(role => role, render);
            var colors = channels.ToFrozenDictionary(pair => pair.Key, pair => Display(pair.Value));
            var report = new Dictionary<string, ContrastRelationship>();
            foreach (var (pair, frontRole, backRole) in Relationships)
            {
                var front = channels[frontRole];
                var back = channels[backRole];
                double value = Contrast.MeasureChannels(front, back, contrastModel, gamut);
                bool passes = Math.Abs(value) >= Target(pair);
                var tone = flags.GetValueOrDefault(pair == "textOnSubtle" ? "text" : pair);
                string? fallback = pair == "fill" && mapping.Light != null && !passes ? "palette-constraint" : tone.Fallback;
                double ratio = contrastModel == ContrastModel.Wcag2 ? value : Contrast.MeasureChannels(front, back, ContrastModel.Wcag2, gamut);
                report.Add(pair, new(ratio, passes, tone.Adjusted, tone.Capped, tone.Reduced, fallback, contrastModel, value));
            }
            return (colors, report.ToFrozenDictionary());
        }
        var light = Theme(false);
        var dark = Theme(true);
        return new(mapping.Fraction, mapping.Hue, light.Colors, dark.Colors)
            { Source = mapping.Source, LightContrast = light.Report, DarkContrast = dark.Report };
    }

    public Color ResolveColor(string text, bool dark = false, string role = "fill") =>
        Display(SelectedChannels(text, dark, role));

    public string Hex(string text, bool dark = false, string role = "fill") =>
        Color.FormatHex(Fallback(SelectedChannels(text, dark, role)));

    private double Target(string role) => targets.GetValueOrDefault(role, role == "border" && contrastModel == ContrastModel.Wcag2 ? Math.Min(3, contrastTarget) : contrastTarget);

    public string HexStrict(string text, bool dark = false, string role = "fill")
    {
        var render = RoleRenderer(Map(normalization.Apply(text)), dark);
        var value = render(role);
        void Require(string relationship, EncodedRgb front, EncodedRgb back)
        {
            if (Math.Abs(Contrast.MeasureChannels(front, back, contrastModel, gamut)) < Target(relationship))
                throw TextHueErrors.WithCode(new InvalidOperationException($"Contrast target for {relationship} was not met."), "UNMET_CONSTRAINT");
        }
        switch (role)
        {
            case "onFill": Require("fill", value, render("fill")); break;
            case "fill":
            case "fillHover":
            case "fillActive": Require(role, render("onFill"), value); break;
            case "text":
                Require("text", value, render("background"));
                Require("textOnSubtle", value, render("subtle"));
                break;
            case "strong":
            case "border": Require(role, value, render("background")); break;
        }
        return Color.FormatHex(Fallback(value));
    }

    private Color Display(EncodedRgb channels) => gamut == Gamut.DisplayP3
        ? Color.FromDisplayP3(channels.AsP3) : new(channels.Bytes);

    private Rgb Fallback(EncodedRgb channels) => gamut == Gamut.DisplayP3
        ? GamutFit.FallbackFromXyz(GamutFit.P3ToXyz(channels.AsP3)).Bytes : channels.Bytes;

    private EncodedRgb SelectedChannels(string text, bool dark, string role) =>
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

    private static readonly (string Pair, string Front, string Back)[] Relationships = [
        ("fill", "onFill", "fill"), ("fillHover", "onFill", "fillHover"), ("fillActive", "onFill", "fillActive"),
        ("text", "text", "background"), ("textOnSubtle", "text", "subtle"), ("border", "border", "background"),
        ("strong", "strong", "background")
    ];
    private readonly record struct ToneFlags(bool Adjusted, bool Capped, bool Reduced, string? Fallback);

    private Func<string, EncodedRgb> RoleRenderer(Mapping mapping, bool dark, Dictionary<string, ToneFlags>? flags = null)
    {
        var fixedTone = dark ? mapping.Dark : mapping.Light;
        double hue = fixedTone?.Hue ?? mapping.Hue, uL = mapping.UL, uC = mapping.UC;
        var background = dark ? darkBackground : lightBackground;
        var bgChannels = gamut.FromSRgb(background.Rgb);
        double lb = Math.Floor(background.Oklch.L * 4096 + 0.5) / 4096;
        var profile = dark ? darkProfile : lightProfile;
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

        double Score(EncodedRgb text, EncodedRgb bg) => Math.Abs(Contrast.MeasureChannels(text, bg, contrastModel, gamut));
        EncodedRgb Foreground(EncodedRgb rgb, double required)
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
        EncodedRgb Tone(string name, double value, bool fill, double target, EncodedRgb? back = null, EncodedRgb? second = null, bool surface = false)
        {
            double l = Math.Clamp(value, 0, 1);
            var role = fill ? profile.Fill : profile.Text;
            var (low, high) = role?.ChromaScale ?? chromaScale;
            double cap = fixedTone?.Neutral == true ? 0 : role?.ChromaCap ?? (fill ? 0.16 : 0.19);
            double requested = gamut.Cusp(l, hue) * ((low + (high - low) * uC) * (mapping.Ring < 3 ? 1 : 0.6));
            double c = Math.Min(requested, cap);
            double secondary = second.HasValue ? Target("textOnSubtle") : 0;
            var repair = gamut.Repair(l, c, hue, target == 0 ? secondary : target, bytes =>
            {
                if (hueDomain.Excludes(bytes, gamut)) return double.NegativeInfinity;
                var rgb = EncodedRgb.FromBytes(bytes);
                double primary = back is EncodedRgb bg ? (surface ? Score(bg, rgb) : Score(rgb, bg)) : Score(Foreground(rgb, target), rgb);
                if (second is not EncodedRgb other || secondary == 0) return primary;
                double otherScore = Score(rgb, other);
                return target == 0 ? otherScore : Math.Min(primary, otherScore * (target / secondary));
            });
            if (flags != null) flags[name] = new(repair.Color.Lightness != l, requested > cap, repair.Color.Chroma < c, repair.Fallback);
            return EncodedRgb.FromBytes(repair.Color.Bytes);
        }

        double lf = fixedTone?.Lightness ?? Sample(true), lt = Sample(false);
        double unconstrained = contrastModel == ContrastModel.Apca ? 0 : 1;
        EncodedRgb? subtle = null, fill = null, onFill = null;
        EncodedRgb Subtle() => subtle ??= Tone("subtle", lb + direction * 0.04, true, unconstrained);
        EncodedRgb Fill() => fill ??= fixedTone is null ? Tone("fill", lf, true, Target("fill")) : gamut.FromSRgb(fixedTone.Bytes);
        EncodedRgb OnFill() => onFill ??= Foreground(Fill(), Target("fill"));
        return role => role switch
        {
            "background" => bgChannels,
            "subtle" => Subtle(),
            "muted" => Tone(role, lb + direction * 0.10, true, unconstrained),
            "fill" => Fill(),
            "onFill" => OnFill(),
            "fillHover" => Tone(role, lf + direction * 0.025, true, Target("fillHover"), OnFill(), surface: true),
            "fillActive" => Tone(role, lf + direction * 0.05, true, Target("fillActive"), OnFill(), surface: true),
            "border" => Tone(role, lb + direction * 0.39, true, Target("border"), bgChannels),
            "text" => Tone(role, lt, false, Target("text"), bgChannels, Subtle()),
            "strong" => Tone(role, lt + direction * 0.10, false, Target("strong"), bgChannels),
            _ => throw TextHueErrors.WithCode(new ArgumentOutOfRangeException(nameof(role), role, "Unknown color role."))
        };
    }
}
