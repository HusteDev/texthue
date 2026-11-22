namespace TextHue;

public readonly record struct HueArc(double Start, double End);

internal sealed class HueDomain
{
    private readonly List<HueArc> segments;
    private readonly double width;

    private static IEnumerable<HueArc> Split(HueArc arc)
    {
        if (!(arc.Start is >= 0 and <= 360 && arc.End is >= 0 and <= 360))
            throw new ArgumentOutOfRangeException(nameof(arc));
        if (arc.Start <= arc.End) yield return arc;
        else
        {
            yield return new(0, arc.End);
            yield return new(arc.Start, 360);
        }
    }

    internal HueDomain(HueArc allowed, IReadOnlyList<HueArc> excluded)
    {
        if (excluded.Count > 16) throw new ArgumentException("At most 16 hue exclusions are supported.", nameof(excluded));
        segments = Split(allowed).Where(s => s.Start < s.End).ToList();
        foreach (var cut in excluded.SelectMany(Split))
        {
            if (cut.Start == cut.End) continue;
            var next = new List<HueArc>();
            foreach (var (lo, hi) in segments)
            {
                double left = Math.Min(hi, cut.Start), right = Math.Max(lo, cut.End);
                if (lo < left) next.Add(new(lo, left));
                if (right < hi) next.Add(new(right, hi));
            }
            segments = next;
        }
        width = segments.Sum(s => s.End - s.Start);
        if (width <= 0) throw new ArgumentException("No permitted hue remains.");
    }

    internal double Map(double hue)
    {
        if (width == 360) return hue;
        double distance = hue / 360 * width;
        foreach (var (lo, hi) in segments)
        {
            if (distance < hi - lo) return lo + distance;
            distance -= hi - lo;
        }
        return segments[0].Start;
    }
}
