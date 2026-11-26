namespace TextHue;

internal static class ResultEquality
{
    internal static bool SameMap<T>(IReadOnlyDictionary<string, T> left, IReadOnlyDictionary<string, T> right)
        => left.Count == right.Count && left.All(item => right.TryGetValue(item.Key, out var other)
            && EqualityComparer<T>.Default.Equals(item.Value, other));

    internal static int MapHash<T>(IReadOnlyDictionary<string, T> values)
    {
        var hash = new HashCode();
        foreach (var (key, value) in values.OrderBy(entry => entry.Key, StringComparer.Ordinal))
        {
            hash.Add(key, StringComparer.Ordinal);
            hash.Add(value);
        }
        return hash.ToHashCode();
    }
}
