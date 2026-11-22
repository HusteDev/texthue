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

public sealed class Renderer
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
                    IReadOnlyDictionary<string, BrandColors>? overrides = null, IEnumerable<PaletteEntry>? palette = null)
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
        this.overrides = (overrides ?? new Dictionary<string, BrandColors>()).ToFrozenDictionary(
            pair => { utf8.GetByteCount(pair.Key); return pair.Key; },
            pair => (new FixedTone(pair.Value.Light), new FixedTone(pair.Value.Dark)), StringComparer.Ordinal);
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
        this.scope = scope;
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
            if (!cache.TryGetValue(label, out var palette))
            {
                palette = Resolve(label);
                cache.Add(label, palette);
            }
            result.Add(palette);
        }
        return result.AsReadOnly();
    }

    public RenderedPalette Resolve(string text)
    {
        if (overrides.TryGetValue(text, out var pinned)) return Fixed(pinned.Light, pinned.Dark, "override");
        var digest = Identity.Digest(text, scope, seed);
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
        double position = uH * 12;
        int i = (int)position;
        var anchors = Tables.Anchors;
        double hue = hueDomain.Map((anchors[i] + (anchors[i + 1] - anchors[i]) * (position - i)) % 360);
        return new(uH, hue, Theme(false, hue, uL, uC), Theme(true, hue, uL, uC));
    }

    private RenderedPalette Fixed(FixedTone light, FixedTone dark, string source)
    {
        var anchors = Tables.Anchors;
        double angle = light.Hue < anchors[0] ? light.Hue + 360 : light.Hue;
        int i = Array.FindLastIndex(anchors, anchor => anchor <= angle);
        double fraction = (i + (angle - anchors[i]) / (anchors[i + 1] - anchors[i])) / 12;
        return new(fraction, light.Hue, Theme(false, light.Hue, 0.5, 0.5, light),
            Theme(true, dark.Hue, 0.5, 0.5, dark)) { Source = source };
    }

    private IReadOnlyDictionary<string, Color> Theme(bool dark, double hue, double uL, double uC, FixedTone? fixedTone = null)
    {
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
            return Math.Clamp(low + (high - low) * uL + offset, 0, 1);
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
            double c = fixedTone?.Neutral == true ? 0 : Math.Min(role?.ChromaCap ?? (fill ? 0.16 : 0.19), Gamut.SRgb.Cusp(l, hue) * (low + (high - low) * uC));
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
        var subtle = Tone(lb + direction * 0.04, true, unconstrained);
        var fill = fixedTone?.Bytes ?? Tone(lf, true, Target("fill"));
        var onFill = Foreground(fill, Target("fill"));
        return new Dictionary<string, Rgb>
        {
            ["background"] = background.Rgb, ["subtle"] = subtle,
            ["muted"] = Tone(lb + direction * 0.10, true, unconstrained), ["fill"] = fill, ["onFill"] = onFill,
            ["fillHover"] = Tone(lf + direction * 0.025, true, Target("fillHover"), onFill, surface: true),
            ["fillActive"] = Tone(lf + direction * 0.05, true, Target("fillActive"), onFill, surface: true),
            ["border"] = Tone(lb + direction * 0.39, true, Target("border"), background.Rgb),
            ["text"] = Tone(lt, false, Target("text"), background.Rgb, subtle),
            ["strong"] = Tone(lt + direction * 0.10, false, Target("strong"), background.Rgb)
        }.ToFrozenDictionary(pair => pair.Key, pair => new Color(pair.Value));
    }
}
