namespace TextHue;

public enum Gamut { SRgb, DisplayP3 }
public enum ContrastModel { Wcag2, Apca }
public readonly record struct Rgb(byte R, byte G, byte B);

internal readonly record struct EncodedRgb(double R, double G, double B)
{
    internal static EncodedRgb FromBytes(Rgb rgb) => new(rgb.R / 255.0, rgb.G / 255.0, rgb.B / 255.0);
    internal P3Channels AsP3 => new(R, G, B);
    internal Rgb Bytes => new((byte)Math.Round(R * 255), (byte)Math.Round(G * 255), (byte)Math.Round(B * 255));
}

public static class Contrast
{
    internal static double LinearChannel(double x) =>
        x <= 0.04045 ? x / 12.92 : Math.Pow((x + 0.055) / 1.055, 2.4);

    public static double Measure(Rgb text, Rgb background,
        ContrastModel model = ContrastModel.Wcag2, Gamut gamut = Gamut.SRgb) =>
        MeasureChannels(EncodedRgb.FromBytes(text), EncodedRgb.FromBytes(background), model, gamut);

    internal static double MeasureChannels(EncodedRgb text, EncodedRgb background, ContrastModel model, Gamut gamut)
    {
        (double r, double g, double b) = (gamut, model) switch
        {
            (Gamut.SRgb, ContrastModel.Wcag2) => (0.2126, 0.7152, 0.0722),
            (Gamut.SRgb, ContrastModel.Apca) => (0.2126729, 0.7151522, 0.0721750),
            (Gamut.DisplayP3, ContrastModel.Wcag2) => (35783.0 / 156275, 247089.0 / 357200, 198249.0 / 2500400),
            (Gamut.DisplayP3, ContrastModel.Apca) => (0.2289829594805780, 0.6917492625852380, 0.0792677779341829),
            _ => throw TextHueErrors.WithCode(new ArgumentException("Unknown gamut or contrast model."))
        };
        double Channel(double value) => model == ContrastModel.Apca
            ? Math.Pow(value, 2.4) : LinearChannel(value);
        double Luminance(EncodedRgb rgb)
        {
            double y = r * Channel(rgb.R) + g * Channel(rgb.G) + b * Channel(rgb.B);
            return model == ContrastModel.Apca && y < 0.022 ? y + Math.Pow(0.022 - y, 1.414) : y;
        }

        double fg = Luminance(text), bg = Luminance(background);
        if (model == ContrastModel.Wcag2)
            return (Math.Max(fg, bg) + 0.05) / (Math.Min(fg, bg) + 0.05);
        if (Math.Abs(fg - bg) < 0.0005) return 0;
        bool positive = bg > fg;
        double raw = 1.14 * (Math.Pow(bg, positive ? 0.56 : 0.65) - Math.Pow(fg, positive ? 0.57 : 0.62));
        return Math.Abs(raw) < 0.1 ? 0 : 100 * (raw - (positive ? 0.027 : -0.027));
    }
}
