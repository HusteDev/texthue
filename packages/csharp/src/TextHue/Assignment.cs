using System.Collections.Frozen;
using Lab = (double L, double A, double B);

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
        RenderedPalette Placed(Mapping mapping, Placement p)
        {
            mapping = mapping with { Ring = (int)(p.Ring % RingOffsets.Length) };
            if (mapping.Light == null)
                mapping = mapping with { Source = "assigned", Fraction = p.HueFraction, Hue = MappedHue(p.HueFraction) };
            return Render(mapping);
        }
        static (Lab Light, Lab Dark) Project(RenderedPalette value) =>
            (Color.ToOklab(value.Light["fill"].Rgb), Color.ToOklab(value.Dark["fill"].Rgb));
        static double Distance(Lab a, Lab b)
        {
            double l = a.L - b.L, x = a.A - b.A, y = a.B - b.B;
            return Math.Sqrt(l*l + x*x + y*y);
        }
        var occupied = placements.Select(entry => Project(Placed(Map(entry.Key), entry.Value))).ToList();
        double Score((Lab Light, Lab Dark) pair) => occupied.Count == 0 ? double.PositiveInfinity :
            occupied.Min(other => Math.Min(Distance(pair.Light, other.Light), Distance(pair.Dark, other.Dark)));
        foreach (var e in entries)
        {
            bool fixedPlacement = placements.TryGetValue(e.Name, out var p);
            if (!fixedPlacement) p = Place(e.Mapping.Fraction, placements.Values, separation);
            var result = Placed(e.Mapping, p);
            if (!fixedPlacement)
            {
                var initial = p;
                var pair = Project(result);
                double best = Score(pair);
                for (int step = 1; step < 24 * RingOffsets.Length && best < 0.04; step++)
                {
                    double hue = (initial.HueFraction + (step % 24) / 24.0) % 1;
                    long ring = initial.Ring + step / 24;
                    if (placements.Values.Any(previous => {
                        double d = Math.Abs(hue - previous.HueFraction);
                        return previous.Ring == ring && Math.Min(d, 1-d) < separation;
                    })) continue;
                    var candidate = new Placement(hue, ring, true);
                    var palette = Placed(e.Mapping, candidate);
                    var projected = Project(palette);
                    double distance = Score(projected);
                    if (distance > best) (p, result, pair, best) = (candidate, palette, projected, distance);
                }
                placements.Add(e.Name, p);
                occupied.Add(pair);
            }
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
