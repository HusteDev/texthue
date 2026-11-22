namespace TextHue;

public readonly record struct Hsl(double H, double S, double L);
public readonly record struct Oklch(double L, double C, double H);

public sealed class Color
{
    public Rgb Rgb { get; }
    public string Hex { get; }
    public Hsl Hsl { get; }
    public Oklch Oklch { get; }

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

    public Color(Rgb rgb)
    {
        Rgb = rgb;
        Hex = $"#{rgb.R:x2}{rgb.G:x2}{rgb.B:x2}";
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

        r = Contrast.LinearChannel(r);
        g = Contrast.LinearChannel(g);
        b = Contrast.LinearChannel(b);
        double x = (506752.0 / 1228815) * r + (87881.0 / 245763) * g + (12673.0 / 70218) * b;
        double y = (87098.0 / 409605) * r + (175762.0 / 245763) * g + (12673.0 / 175545) * b;
        double z = (7918.0 / 409605) * r + (87881.0 / 737289) * g + (1001167.0 / 1053270) * b;
        double l = Math.Cbrt(0.819022437996703 * x + 0.3619062600528904 * y - 0.1288737815209879 * z);
        double m = Math.Cbrt(0.0329836539323885 * x + 0.9292868615863434 * y + 0.0361446663506424 * z);
        double s = Math.Cbrt(0.0481771893596242 * x + 0.2642395317527308 * y + 0.6335478284694309 * z);
        double labL = 0.210454268309314 * l + 0.7936177747023054 * m - 0.0040720430116193 * s;
        double labA = 1.9779985324311684 * l - 2.42859224204858 * m + 0.450593709617411 * s;
        double labB = 0.0259040424655478 * l + 0.7827717124575296 * m - 0.8086757549230774 * s;
        bool neutral = rgb.R == rgb.G && rgb.G == rgb.B;
        double degrees = (Math.Atan2(labB, labA) * 180 / Math.PI + 360) % 360;
        Oklch = new(Round6(labL), neutral ? 0 : Round6(Math.Sqrt(labA * labA + labB * labB)),
                    neutral ? 0 : Round6(degrees) % 360);
    }
}
