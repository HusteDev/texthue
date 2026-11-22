namespace TextHue;

public readonly record struct Hsl(double H, double S, double L);
public readonly record struct Oklch(double L, double C, double H);

public readonly record struct P3Channels(double R, double G, double B);

public sealed class Color
{
    public Rgb Rgb { get; }
    public string Hex { get; }
    public Hsl Hsl { get; }
    public Oklch Oklch { get; }

    [System.Text.Json.Serialization.JsonIgnore(Condition = System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingNull)]
    public P3Channels? P3 { get; }
    [System.Text.Json.Serialization.JsonIgnore(Condition = System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingNull)]
    public string? Css { get; }
    [System.Text.Json.Serialization.JsonIgnore(Condition = System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingNull)]
    public bool? SrgbClipped { get; }

    private static double Round6(double value) => Math.Floor(value * 1e6 + 0.5) / 1e6;

    /// <summary>Composite this sRGB color over an opaque backdrop in linear light.</summary>
    public Color CompositeOver(double alpha, Rgb backdrop)
    {
        if (!(alpha >= 0 && alpha <= 1))
            throw new ArgumentOutOfRangeException(nameof(alpha), "Alpha must be between zero and one.");

        byte Blend(byte front, byte back) => GamutFit.ChannelByte(
            alpha * Contrast.LinearChannel(front / 255.0) + (1 - alpha) * Contrast.LinearChannel(back / 255.0));

        return new Color(new Rgb(Blend(Rgb.R, backdrop.R), Blend(Rgb.G, backdrop.G), Blend(Rgb.B, backdrop.B)));
    }

    internal static string FormatHex(Rgb rgb) => $"#{rgb.R:x2}{rgb.G:x2}{rgb.B:x2}";

    public Color(Rgb rgb)
    {
        Rgb = rgb;
        Hex = FormatHex(rgb);
        double r = rgb.R / 255.0, g = rgb.G / 255.0, b = rgb.B / 255.0;
        double hi = Math.Max(r, Math.Max(g, b)), lo = Math.Min(r, Math.Min(g, b));
        double light = (hi + lo) / 2, delta = hi - lo;
        double hue = 0, saturation = 0;
        if (delta != 0)
        {
            saturation = (hi - light) / Math.Min(light, 1 - light);
            if (hi == r) hue = (g - b) / delta + (g < b ? 6 : 0);
            else if (hi == g) hue = (b - r) / delta + 2;
            else hue = (r - g) / delta + 4;
        }
        Hsl = new(Round6(60 * hue) % 360, Round6(100 * saturation), Round6(100 * light));

        Oklch = Coordinates(ToOklab(rgb), rgb.R == rgb.G && rgb.G == rgb.B);
    }

    public static Color FromDisplayP3(P3Channels channels)
    {
        static bool Valid(double x) => x >= 0 && x <= 1;
        if (!Valid(channels.R) || !Valid(channels.G) || !Valid(channels.B))
            throw new ArgumentOutOfRangeException(nameof(channels));
        var xyz = GamutFit.P3ToXyz(channels);
        var fallback = GamutFit.FallbackFromXyz(xyz);
        return new Color(channels, xyz, fallback.Bytes, fallback.Clipped);
    }

    private Color(P3Channels channels, GamutFit.Triple xyz, Rgb fallback, bool clipped) : this(fallback)
    {
        var (r, g, b) = channels;
        P3 = new(Round6(r), Round6(g), Round6(b));
        var (red, green, blue) = P3.Value;
        Css = FormattableString.Invariant($"color(display-p3 {red:0.######} {green:0.######} {blue:0.######})");
        SrgbClipped = clipped;
        Oklch = Coordinates(XyzToOklab(xyz.X, xyz.Y, xyz.Z), r == g && g == b);
    }

    private static Oklch Coordinates((double L, double A, double B) lab, bool neutral)
    {
        var (labL, labA, labB) = lab;
        double degrees = (Math.Atan2(labB, labA) * 180 / Math.PI + 360) % 360;
        return new(Round6(labL), neutral ? 0 : Round6(Math.Sqrt(labA * labA + labB * labB)),
                    neutral ? 0 : Round6(degrees) % 360);
    }

    internal static (double L, double A, double B) ToOklab(Rgb rgb)
    {
        var (x, y, z) = GamutFit.SRgbToXyz(rgb);
        return XyzToOklab(x, y, z);
    }

    private static (double L, double A, double B) XyzToOklab(double x, double y, double z)
    {
        double l = Math.Cbrt(0.819022437996703 * x + 0.3619062600528904 * y - 0.1288737815209879 * z);
        double m = Math.Cbrt(0.0329836539323885 * x + 0.9292868615863434 * y + 0.0361446663506424 * z);
        double s = Math.Cbrt(0.0481771893596242 * x + 0.2642395317527308 * y + 0.6335478284694309 * z);
        double labL = 0.210454268309314 * l + 0.7936177747023054 * m - 0.0040720430116193 * s;
        double labA = 1.9779985324311684 * l - 2.42859224204858 * m + 0.450593709617411 * s;
        double labB = 0.0259040424655478 * l + 0.7827717124575296 * m - 0.8086757549230774 * s;
        return (labL, labA, labB);
    }
}
