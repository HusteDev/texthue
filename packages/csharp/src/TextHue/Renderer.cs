using System.Collections.Frozen;

namespace TextHue;

public sealed record RenderedPalette(double HueFraction, double Hue,
    IReadOnlyDictionary<string, Color> Light, IReadOnlyDictionary<string, Color> Dark)
{
    public string Version => "text-to-color-v1";
    public string Source => "hash";
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

public sealed class Renderer
{
    private readonly string scope;
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
                    IEnumerable<Rgb>? foregrounds = null, ForegroundPolicy foregroundPolicy = ForegroundPolicy.Best)
    {
        if (!Enum.IsDefined(contrastModel)) throw new ArgumentOutOfRangeException(nameof(contrastModel));
        if (!Enum.IsDefined(foregroundPolicy)) throw new ArgumentOutOfRangeException(nameof(foregroundPolicy));
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
        var (uH, uL, uC) = Identity.Fractions(Identity.Digest(text, scope, seed));
        double position = uH * 12;
        int i = (int)position;
        var anchors = Tables.Anchors;
        double hue = (anchors[i] + (anchors[i + 1] - anchors[i]) * (position - i)) % 360;
        return new(uH, hue, Theme(false, hue, uL, uC), Theme(true, hue, uL, uC));
    }

    private IReadOnlyDictionary<string, Color> Theme(bool dark, double hue, double uL, double uC)
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
            double c = Math.Min(role?.ChromaCap ?? (fill ? 0.16 : 0.19), Gamut.SRgb.Cusp(l, hue) * (low + (high - low) * uC));
            double secondary = second.HasValue ? Target("textOnSubtle") : 0;
            return Gamut.SRgb.Repair(l, c, hue, target == 0 ? secondary : target, rgb =>
            {
                double primary = back is Rgb bg ? (surface ? Score(bg, rgb) : Score(rgb, bg)) : Score(Foreground(rgb, target), rgb);
                if (second is not Rgb other || secondary == 0) return primary;
                double otherScore = Score(rgb, other);
                return target == 0 ? otherScore : Math.Min(primary, otherScore * (target / secondary));
            }).Color.Bytes;
        }

        double lf = Sample(true), lt = Sample(false);
        double unconstrained = contrastModel == ContrastModel.Apca ? 0 : 1;
        var subtle = Tone(lb + direction * 0.04, true, unconstrained);
        var fill = Tone(lf, true, Target("fill"));
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
