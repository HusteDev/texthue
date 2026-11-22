part of 'renderer.dart';

typedef Placement = ({double hueFraction, int ring, bool moved});
typedef AssignmentReport = ({
  double? minDistance,
  List<(String, String)> closestPairs,
  bool withinRingCapacity,
  bool distinctFills
});
typedef AssignmentResult = ({
  Map<String, Placement> assignments,
  Map<String, RenderedPalette> colors,
  AssignmentReport report
});

Placement _place(
    double natural, Iterable<Placement> occupied, double separation) {
  for (var ring = 0;; ring++) {
    final neighbors = occupied.where((p) => p.ring == ring).toList();
    for (var i = 0; i < 385; i++) {
      final step = ((i + 1) ~/ 2) * (i.isEven ? 1 : -1);
      final raw = natural + step * (separation / 4);
      final fraction = raw - raw.floor();
      if (neighbors.every((p) {
        final d = (p.hueFraction - fraction).abs();
        return math.min(d, 1 - d) >= separation;
      }))
        return (hueFraction: fraction, ring: ring, moved: i != 0 || ring != 0);
    }
  }
}

extension CollectionAssignment on Renderer {
  AssignmentResult assign(Iterable<String> labels,
      {Map<String, Placement> pinned = const {}}) {
    final names = labels.map(normalization.apply).toSet();
    final assignments = <String, Placement>{};
    for (final entry in pinned.entries) {
      final name = normalization.apply(entry.key), p = entry.value;
      if (!(p.hueFraction >= 0 && p.hueFraction < 1) ||
          p.ring < 0 ||
          p.ring > 9007199254740991 ||
          assignments.containsKey(name)) {
        throw ArgumentError('Invalid pinned placement');
      }
      assignments[name] = p;
    }
    final size = {...names, ...assignments.keys}.length;
    final separation = (1 / size).clamp(1 / 24, 1 / 12);
    final entries = [
      for (final name in names)
        (
          name: name,
          digest: identityDigest(name, namespace: _scope, seed: seed)
        )
    ];
    entries.sort((a, b) {
      for (var i = 0; i < 32; i++) {
        final d = a.digest[i] - b.digest[i];
        if (d != 0) return d;
      }
      return 0;
    });
    final mappings = <String, _Mapping>{};
    for (final entry in entries) {
      final m = _mapping(entry.name, entry.digest);
      mappings[entry.name] = m;
      if (m.fixed != null)
        assignments.putIfAbsent(
            entry.name, () => (hueFraction: m.fraction, ring: 0, moved: false));
    }
    final colors = <String, RenderedPalette>{};
    final points = <(String, List<double>)>[];
    final fills = <String>{};
    RenderedPalette placed(_Mapping m, Placement p) {
      final mapped = m.fixed != null
          ? m
          : (
              source: 'assigned',
              fraction: p.hueFraction,
              hue: _mappedHue(p.hueFraction),
              uL: m.uL,
              uC: m.uC,
              fixed: m.fixed
            );
      return _render(mapped, p.ring);
    }

    List<List<double>> project(RenderedPalette palette) => [
          for (final rgb in [
            palette.light['fill']!.rgb,
            palette.dark['fill']!.rgb
          ])
            srgbToLab(rgb.r / 255, rgb.g / 255, rgb.b / 255)
        ];
    final occupied = [
      for (final e in assignments.entries)
        project(placed(mappings[e.key] ?? _mapping(e.key), e.value))
    ];
    double score(List<List<double>> pair) {
      var minimum = double.infinity;
      for (final previous in occupied) {
        for (var i = 0; i < pair.length; i++) {
          var squared = 0.0;
          for (var k = 0; k < 3; k++) {
            final delta = pair[i][k] - previous[i][k];
            squared += delta * delta;
          }
          minimum = math.min(minimum, math.sqrt(squared));
        }
      }
      return minimum;
    }

    for (final entry in mappings.entries) {
      final name = entry.key, m = entry.value;
      final existing = assignments[name];
      final initial =
          existing ?? _place(m.fraction, assignments.values, separation);
      var palette = placed(m, initial);
      if (existing == null) {
        var selected = initial;
        var pair = project(palette);
        var best = score(pair);
        for (var step = 1; step < 120 && best < 0.04; step++) {
          final hue = (initial.hueFraction + (step % 24) / 24) % 1.0;
          final ring = initial.ring + step ~/ 24;
          if (assignments.values.any((p) {
            final delta = (p.hueFraction - hue).abs();
            return p.ring == ring && math.min(delta, 1 - delta) < separation;
          })) continue;
          final candidate = (hueFraction: hue, ring: ring, moved: true);
          final rendered = placed(m, candidate);
          final projected = project(rendered);
          final distance = score(projected);
          if (distance > best) {
            selected = candidate;
            palette = rendered;
            pair = projected;
            best = distance;
          }
        }
        assignments[name] = selected;
        occupied.add(pair);
      }
      colors[name] = palette;
      final fill = palette.light['fill']!;
      fills.add(fill.hex);
      points.add((
        name,
        srgbToLab(fill.rgb.r / 255, fill.rgb.g / 255, fill.rgb.b / 255)
      ));
    }
    double? minimum;
    final pairs = <(String, String)>[];
    for (var i = 0; i < points.length; i++) {
      for (var j = i + 1; j < points.length; j++) {
        final a = points[i], b = points[j];
        final dl = a.$2[0] - b.$2[0],
            da = a.$2[1] - b.$2[1],
            db = a.$2[2] - b.$2[2];
        final d = math.sqrt(dl * dl + da * da + db * db);
        if (minimum == null || d < minimum) {
          minimum = d;
          pairs.clear();
        }
        if (d == minimum) pairs.add((a.$1, b.$1));
      }
    }
    return (
      assignments: Map.unmodifiable(assignments),
      colors: Map.unmodifiable(colors),
      report: (
        minDistance: minimum,
        closestPairs: List.unmodifiable(pairs),
        withinRingCapacity: size <= 5 * (1 / separation).floor(),
        distinctFills: fills.length == colors.length
      )
    );
  }
}
