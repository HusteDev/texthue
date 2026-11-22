using System.Collections.Frozen;

namespace TextHue;

public readonly record struct Placement(double HueFraction, long Ring, bool Moved);
public sealed record AssignmentReport(double? MinDistance, IReadOnlyList<(string First, string Second)> ClosestPairs,
    bool WithinRingCapacity, bool DistinctFills);
public sealed record AssignmentResult(IReadOnlyDictionary<string, Placement> Assignments,
    IReadOnlyDictionary<string, RenderedPalette> Colors, AssignmentReport Report);

public sealed partial class Renderer
{
    private static readonly double[] RingOffsets = [0, 0.08, -0.08, 0.16, -0.16];

    private static Placement Place(double natural, IEnumerable<Placement> occupied, double separation)
    {
        for (long ring = 0; ; ring++)
        {
            var neighbors = occupied.Where(p => p.Ring == ring).ToArray();
            for (int i = 0; i < 385; i++)
            {
                int step = ((i + 1) / 2) * (i % 2 == 0 ? 1 : -1);
                double raw = natural + step * (separation / 4);
                double fraction = raw - Math.Floor(raw);
                if (neighbors.All(p => {
                    double d = Math.Abs(p.HueFraction - fraction);
                    return Math.Min(d, 1 - d) >= separation;
                })) return new(fraction, ring, i != 0 || ring != 0);
            }
        }
    }

    public AssignmentResult Assign(IEnumerable<string> labels, IReadOnlyDictionary<string, Placement>? pinned = null)
    {
        var placements = new Dictionary<string, Placement>(StringComparer.Ordinal);
        if (pinned != null)
            foreach (var (name, p) in pinned)
                if (!(p.HueFraction >= 0 && p.HueFraction < 1) || p.Ring is < 0 or > 9007199254740991 ||
                    !placements.TryAdd(normalization.Apply(name), p))
                    throw new ArgumentException("Invalid pinned placement.", nameof(pinned));
        var entries = labels.Select(normalization.Apply).Distinct(StringComparer.Ordinal).Select(name => {
            var digest = Identity.Digest(name, scope, seed);
            return (Name: name, Digest: digest, Mapping: Map(name, digest));
        }).ToArray();
        Array.Sort(entries, (a, b) => a.Digest.AsSpan().SequenceCompareTo(b.Digest));
        int size = placements.Count + entries.Count(e => !placements.ContainsKey(e.Name));
        double separation = Math.Clamp(1.0 / size, 1.0 / 24, 1.0 / 12);
        foreach (var e in entries)
            if (e.Mapping.Light != null) placements.TryAdd(e.Name, new(e.Mapping.Fraction, 0, false));
        var colors = new Dictionary<string, RenderedPalette>();
        var points = new List<(string Name, (double L, double A, double B) Lab)>();
        var fills = new HashSet<Rgb>();
        foreach (var e in entries)
        {
            if (!placements.TryGetValue(e.Name, out var p))
                placements[e.Name] = p = Place(e.Mapping.Fraction, placements.Values, separation);
            var mapping = e.Mapping with { Ring = (int)(p.Ring % 5) };
            if (mapping.Light == null)
                mapping = mapping with { Source = "assigned", Fraction = p.HueFraction, Hue = MappedHue(p.HueFraction) };
            var result = Render(mapping);
            colors.Add(e.Name, result);
            var fill = result.Light["fill"].Rgb;
            points.Add((e.Name, Color.ToOklab(fill)));
            fills.Add(fill);
        }
        double? minimum = null;
        var pairs = new List<(string, string)>();
        for (int i = 0; i < points.Count; i++)
            for (int j = i + 1; j < points.Count; j++)
            {
                var first = points[i];
                var second = points[j];
                double l = first.Lab.L - second.Lab.L, a = first.Lab.A - second.Lab.A, b = first.Lab.B - second.Lab.B;
                double distance = Math.Sqrt(l*l + a*a + b*b);
                if (minimum == null || distance < minimum) { minimum = distance; pairs.Clear(); }
                if (distance == minimum) pairs.Add((first.Name, second.Name));
            }
        return new(placements.ToFrozenDictionary(), colors.ToFrozenDictionary(),
            new(minimum, pairs.AsReadOnly(), size <= 5 * Math.Floor(1 / separation), fills.Count == colors.Count));
    }
}
