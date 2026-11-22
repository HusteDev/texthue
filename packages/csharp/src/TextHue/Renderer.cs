using System.Collections.Frozen;

namespace TextHue;

public sealed record RenderedPalette(double HueFraction, double Hue,
    IReadOnlyDictionary<string, Color> Light, IReadOnlyDictionary<string, Color> Dark)
{
    public string Version => "text-to-color-v1";
    public string Source => "hash";
}

public sealed class Renderer
{
    private readonly string scope;
    private readonly uint seed;
    private readonly double contrastTarget;
    private readonly Color lightBackground, darkBackground;

    public Renderer(string scope = "", uint seed = 0, double contrastTarget = 4.5,
                    Rgb? lightBackground = null, Rgb? darkBackground = null)
    {
        if (!(contrastTarget >= 1 && contrastTarget <= 21))
            throw new ArgumentOutOfRangeException(nameof(contrastTarget));
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
        int direction = dark ? 1 : -1;
        double Sample(bool fill)
        {
            (double low, double high) = (dark, fill) switch
            {
                (true, true) => (0.4, 0.5), (false, false) => (0.43, 0.53), _ => (0.72, 0.82)
            };
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
            double c = Math.Min(fill ? 0.16 : 0.19, Gamut.SRgb.Cusp(l, hue) * (0.6 + (0.8 - 0.6) * uC));
            return Gamut.SRgb.Repair(l, c, hue, target, rgb =>
            {
                double primary = Contrast.Measure(rgb, back ?? Foreground(rgb));
                return second.HasValue ? Math.Min(primary, Contrast.Measure(rgb, second.Value)) : primary;
            }).Color.Bytes;
        }

        double lf = Sample(true), lt = Sample(false);
        var subtle = Tone(lb + direction * 0.04, true, 1);
        var fill = Tone(lf, true, contrastTarget);
        var onFill = Foreground(fill);
        return new Dictionary<string, Rgb>
        {
            ["background"] = background.Rgb, ["subtle"] = subtle,
            ["muted"] = Tone(lb + direction * 0.10, true, 1), ["fill"] = fill, ["onFill"] = onFill,
            ["fillHover"] = Tone(lf + direction * 0.025, true, contrastTarget, onFill),
            ["fillActive"] = Tone(lf + direction * 0.05, true, contrastTarget, onFill),
            ["border"] = Tone(lb + direction * 0.39, true, Math.Min(3, contrastTarget), background.Rgb),
            ["text"] = Tone(lt, false, contrastTarget, background.Rgb, subtle),
            ["strong"] = Tone(lt + direction * 0.10, false, contrastTarget, background.Rgb)
        }.ToFrozenDictionary(pair => pair.Key, pair => new Color(pair.Value));
    }
}
