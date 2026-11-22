import 'contrast.dart';
import 'gamut_fit.dart';

typedef RepairedTone = ({FittedColor color, double score, String? fallback});

extension ToneRepair on Gamut {
  RepairedTone repair(double lightness, double chroma, double hue,
      double target, double Function(List<int>) measure) {
    RepairedTone evaluate(double l) {
      final color = fit(l, chroma, hue);
      return (color: color, score: measure(color.bytes), fallback: null);
    }

    final initial = evaluate(lightness);
    if (initial.score >= target) return initial;
    final black = evaluate(0), white = evaluate(1);
    if (black.score < target && white.score < target) {
      final best = black.score >= white.score ? black : white;
      return (
        color: best.color,
        score: best.score,
        fallback: 'unattainable-contrast'
      );
    }

    var best = initial;
    var distance = double.infinity;
    for (final endpoint in [black, white]) {
      if (endpoint.score < target) continue;
      var candidate = endpoint;
      var pass = (endpoint.color.lightness * 4096).toInt();
      var fail =
          pass == 0 ? (lightness * 4096).ceil() : (lightness * 4096).floor();
      while ((pass - fail).abs() > 1) {
        final mid = (pass + fail) ~/ 2;
        final probe = evaluate(mid / 4096);
        if (probe.score >= target) {
          pass = mid;
          candidate = probe;
        } else {
          fail = mid;
        }
      }
      final delta = (candidate.color.lightness - lightness).abs();
      if (delta < distance) {
        best = candidate;
        distance = delta;
      }
    }
    return best;
  }
}
