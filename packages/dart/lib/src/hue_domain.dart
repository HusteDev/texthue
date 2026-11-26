import 'errors.dart';
import 'dart:math' as math;

typedef HueArc = (double, double);

final class HueDomain {
  final List<HueArc> _segments;
  final double _width;
  final List<HueArc> _exclusions;
  HueDomain._(this._segments, this._width, this._exclusions);

  factory HueDomain(HueArc allowed, List<HueArc> excluded) {
    List<HueArc> split(HueArc arc) {
      final (a, b) = arc;
      if (!(a >= 0 && a <= 360 && b >= 0 && b <= 360)) {
        throw OptionError.value(arc, 'hue arc');
      }
      return a <= b ? [arc] : [(0, b), (a, 360)];
    }

    if (excluded.length > 16)
      throw OptionError('At most 16 hue exclusions are supported');
    var remaining = split(allowed).where((arc) => arc.$1 < arc.$2).toList();
    for (final exclusion in excluded) {
      for (final (a, b) in split(exclusion)) {
        if (a == b) continue;
        final next = <HueArc>[];
        for (final (lo, hi) in remaining) {
          final left = math.min(hi, a), right = math.max(lo, b);
          if (lo < left) next.add((lo, left));
          if (right < hi) next.add((right, hi));
        }
        remaining = next;
      }
    }
    final width = remaining.fold(0.0, (sum, arc) => sum + (arc.$2 - arc.$1));
    if (width <= 0) throw OptionError('No permitted hue remains');
    return HueDomain._(remaining, width, List.unmodifiable(excluded));
  }

  bool get hasExclusions => _exclusions.isNotEmpty;

  bool excludes(double hue) => _exclusions.any((arc) => arc.$1 > arc.$2
      ? hue >= arc.$1 || hue < arc.$2
      : hue >= arc.$1 && hue < arc.$2);

  double map(double hue) {
    if (_width == 360) return hue;
    var distance = hue / 360 * _width;
    for (final (lo, hi) in _segments) {
      if (distance < hi - lo) return (lo + distance) % 360;
      distance -= hi - lo;
    }
    return _segments.first.$1;
  }
}
