namespace TextHue;

internal readonly record struct RepairedTone(FittedColor Color, double Score, string? Fallback = null);

internal static class ToneRepair
{
    internal static RepairedTone Repair(this Gamut gamut, double lightness, double chroma,
        double hue, double target, Func<Rgb, double> measure)
    {
        RepairedTone Evaluate(double l)
        {
            var color = gamut.Fit(l, chroma, hue);
            return new(color, measure(color.Bytes));
        }

        var initial = Evaluate(lightness);
        if (initial.Score >= target) return initial;
        var black = Evaluate(0);
        var white = Evaluate(1);
        if (Math.Max(black.Score, white.Score) < target)
        {
            var fallback = black.Score >= white.Score ? black : white;
            return fallback with { Fallback = "unattainable-contrast" };
        }

        var best = initial;
        double distance = double.PositiveInfinity;
        foreach (var endpoint in new[] { black, white })
        {
            if (endpoint.Score < target) continue;
            var candidate = endpoint;
            int pass = (int)(endpoint.Color.Lightness * 4096);
            int fail = (int)(pass == 0 ? Math.Ceiling(lightness * 4096) : Math.Floor(lightness * 4096));
            while (Math.Abs(pass - fail) > 1)
            {
                int mid = (pass + fail) / 2;
                var probe = Evaluate(mid / 4096.0);
                if (probe.Score >= target)
                {
                    pass = mid;
                    candidate = probe;
                }
                else fail = mid;
            }
            double delta = Math.Abs(candidate.Color.Lightness - lightness);
            if (delta < distance)
            {
                best = candidate;
                distance = delta;
            }
        }
        return best;
    }
}
