import 'dart:collection';

/// Read-only snapshots for the collection fields of public result records.
final class ResultMap<K, V> extends UnmodifiableMapView<K, V> {
  ResultMap(Map<K, V> values) : super(Map.of(values));

  @override
  bool operator ==(Object other) => other is ResultMap<K, V> &&
      length == other.length && keys.every((key) => other.containsKey(key) && other[key] == this[key]);

  @override
  int get hashCode => Object.hashAllUnordered(entries.map((entry) => Object.hash(entry.key, entry.value)));
}

final class ResultList<T> extends UnmodifiableListView<T> {
  ResultList(List<T> values) : super(List.of(values));

  @override
  bool operator ==(Object other) {
    if (other is! ResultList<T> || length != other.length) return false;
    for (var i = 0; i < length; i++) {
      if (this[i] != other[i]) return false;
    }
    return true;
  }

  @override
  int get hashCode => Object.hashAll(this);
}
