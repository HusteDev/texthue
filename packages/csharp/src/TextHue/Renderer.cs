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

public sealed class Renderer
{
    private readonly string scope;
    private readonly uint seed;
    private readonly double contrastTarget;
    private readonly FrozenDictionary<string, double> targets;
    private readonly ThemeProfile lightProfile, darkProfile;
    private readonly Color lightBackground, darkBackground;

    public Renderer(string scope = "", uint seed = 0, double contrastTarget = 4.5,
                    Rgb? lightBackground = null, Rgb? darkBackground = null,
                    ThemeProfile? lightProfile = null, ThemeProfile? darkProfile = null,
                    IReadOnlyDictionary<string, double>? contrastTargets = null)
    {
        if (!(contrastTarget >= 1 && contrastTarget <= 21))
            throw new ArgumentOutOfRangeException(nameof(contrastTarget));
        targets = contrastTargets?.ToFrozenDictionary(StringComparer.Ordinal) ?? FrozenDictionary<string, double>.Empty;
        foreach (var (role, value) in targets)
            if (role is not ("fill" or "fillHover" or "fillActive" or "border" or "text" or "textOnSubtle" or "strong")
                || !(value >= 1 && value <= 21))
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
        this.contrastTarget = contrastTarget;
        this.lightBackground = new(lightBackground ?? new Rgb(255, 255, 255));
        this.darkBackground = new(darkBackground ?? new Rgb(18, 18, 18));
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
        double Target(string role) => targets.GetValueOrDefault(role, role == "border" ? Math.Min(3, contrastTarget) : contrastTarget);
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

        Rgb white = new(255, 255, 255), black = new(0, 0, 0);
        Rgb Foreground(Rgb rgb) => Contrast.Measure(black, rgb) >= Contrast.Measure(white, rgb) ? black : white;
        Rgb Tone(double value, bool fill, double target, Rgb? back = null, Rgb? second = null)
        {
            double l = Math.Clamp(value, 0, 1);
            var role = fill ? profile.Fill : profile.Text;
            var (low, high) = role?.ChromaScale ?? (0.6, 0.8);
            double c = Math.Min(role?.ChromaCap ?? (fill ? 0.16 : 0.19), Gamut.SRgb.Cusp(l, hue) * (low + (high - low) * uC));
            return Gamut.SRgb.Repair(l, c, hue, target, rgb =>
            {
                double primary = Contrast.Measure(rgb, back ?? Foreground(rgb));
                return second.HasValue ? Math.Min(primary, Contrast.Measure(rgb, second.Value) * (target / Target("textOnSubtle"))) : primary;
            }).Color.Bytes;
        }

        double lf = Sample(true), lt = Sample(false);
        var subtle = Tone(lb + direction * 0.04, true, 1);
        var fill = Tone(lf, true, Target("fill"));
        var onFill = Foreground(fill);
        return new Dictionary<string, Rgb>
        {
            ["background"] = background.Rgb, ["subtle"] = subtle,
            ["muted"] = Tone(lb + direction * 0.10, true, 1), ["fill"] = fill, ["onFill"] = onFill,
            ["fillHover"] = Tone(lf + direction * 0.025, true, Target("fillHover"), onFill),
            ["fillActive"] = Tone(lf + direction * 0.05, true, Target("fillActive"), onFill),
            ["border"] = Tone(lb + direction * 0.39, true, Target("border"), background.Rgb),
            ["text"] = Tone(lt, false, Target("text"), background.Rgb, subtle),
            ["strong"] = Tone(lt + direction * 0.10, false, Target("strong"), background.Rgb)
        }.ToFrozenDictionary(pair => pair.Key, pair => new Color(pair.Value));
    }
}
