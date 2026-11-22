namespace TextHue;

internal readonly record struct FittedColor(Rgb Bytes, double Lightness, double Chroma);

internal static class GamutFit
{
    private static readonly double[,] labToLMS =
    {
        { 1, 0.3963377773761749, 0.2158037573099136 },
        { 1, -0.1055613458156586, -0.0638541728258133 },
        { 1, -0.0894841775298119, -1.2914855480194092 },
    };
    private static readonly double[,] lmsToXYZ =
    {
        { 1.2268798758459243, -0.5578149944602171, 0.2813910456659647 },
        { -0.0405757452148008, 1.112286803280317, -0.0717110580655164 },
        { -0.0763729366746601, -0.4214933324022432, 1.5869240198367816 },
    };
    private static readonly double[,] xyzToRGB =
    {
        { 12831.0 / 3959, -329.0 / 214, -1974.0 / 3959 },
        { -851781.0 / 878810, 1648619.0 / 878810, 36519.0 / 878810 },
        { 705.0 / 12673, -2585.0 / 12673, 705.0 / 667 },
    };
    private static readonly double[,] xyzToP3 =
    {
        { 446124.0 / 178915, -333277.0 / 357830, -72051.0 / 178915 },
        { -14852.0 / 17905, 63121.0 / 35810, 423.0 / 17905 },
        { 11844.0 / 330415, -50337.0 / 660830, 316169.0 / 330415 },
    };
    private static readonly double[,] p3ToXYZ =
    {
        { 608311.0 / 1250200, 189793.0 / 714400, 198249.0 / 1000160 },
        { 35783.0 / 156275, 247089.0 / 357200, 198249.0 / 2500400 },
        { 0, 32229.0 / 714400, 5220557.0 / 5000800 },
    };

    private readonly record struct Triple(double X, double Y, double Z)
    {
        private static bool Inside(double x) => x >= -1e-12 && x <= 1 + 1e-12;
        internal bool InGamut => Inside(X) && Inside(Y) && Inside(Z);
        internal Rgb Bytes => new(ChannelByte(X), ChannelByte(Y), ChannelByte(Z));
    }

    private static Triple Multiply(double[,] matrix, Triple v)
    {
        double Row(int i) => matrix[i, 0] * v.X + matrix[i, 1] * v.Y + matrix[i, 2] * v.Z;
        return new(Row(0), Row(1), Row(2));
    }

    internal static byte ChannelByte(double linear)
    {
        double x = Math.Clamp(linear, 0, 1);
        double encoded = x <= 0.0031308 ? x * 12.92 : 1.055 * Math.Pow(x, 1 / 2.4) - 0.055;
        return (byte)Math.Floor(encoded * 255 + 0.5);
    }

    internal static (Rgb Bytes, bool Clipped) P3Fallback(Rgb color)
    {
        var xyz = Multiply(p3ToXYZ, new(Contrast.LinearChannel(color.R / 255.0),
            Contrast.LinearChannel(color.G / 255.0), Contrast.LinearChannel(color.B / 255.0)));
        var rgb = Multiply(xyzToRGB, xyz);
        return (rgb.Bytes, !rgb.InGamut);
    }

    private static Triple Linear(Gamut gamut, double l, double c, double h)
    {
        double angle = h * Math.PI / 180;
        var (x, y, z) = Multiply(labToLMS, new(l, c * Math.Cos(angle), c * Math.Sin(angle)));
        var xyz = Multiply(lmsToXYZ, new(x * x * x, y * y * y, z * z * z));
        return Multiply(gamut == Gamut.SRgb ? xyzToRGB : xyzToP3, xyz);
    }

    private static double Limit(Gamut gamut, double l, double c, double h, int steps)
    {
        double low = 0, high = c;
        for (int i = 0; i < steps; i++)
        {
            double mid = (low + high) / 2;
            if (Linear(gamut, l, mid, h).InGamut) low = mid;
            else high = mid;
        }
        return low;
    }

    internal static double Cusp(this Gamut gamut, double l, double h) =>
        l == 0 || l == 1 ? 0 : Limit(gamut, l, 0.4, h, 20);

    internal static FittedColor Fit(this Gamut gamut, double l, double c, double h)
    {
        if (l == 0 || l == 1)
        {
            byte value = (byte)(l * 255);
            return new(new(value, value, value), l, 0);
        }
        var channels = Linear(gamut, l, c, h);
        if (!channels.InGamut)
        {
            c = Limit(gamut, l, c, h, 24);
            channels = Linear(gamut, l, c, h);
        }
        return new(channels.Bytes, l, c);
    }
}
