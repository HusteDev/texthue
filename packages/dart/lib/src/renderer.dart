import 'dart:math' as math;
import 'color.dart';
import 'contrast.dart';
import 'gamut_fit.dart';
import 'identity.dart';
import 'tables.dart';
import 'tone_repair.dart';

typedef RenderedPalette = ({
  String version,
  String source,
  double hue,
  double hueFraction,
  Map<String, Color> light,
  Map<String, Color> dark
});

final class _Background {
  final List<int> bytes;
  final double lightness;
  _Background._(this.bytes, this.lightness);
  factory _Background(String hex) {
    if (!RegExp(r'^#[0-9a-fA-F]{6}$').hasMatch(hex))
      throw FormatException('Invalid background', hex);
    final bytes = [
      for (final i in [1, 3, 5]) int.parse(hex.substring(i, i + 2), radix: 16)
    ];
    final l = Color.fromRgb(bytes[0], bytes[1], bytes[2]).oklch.l;
    return _Background._(bytes, (l * 4096).round() / 4096);
  }
}

final class RoleProfile {
  final (double, double)? lightness, chromaScale;
  final double? chromaCap;

  RoleProfile({this.lightness, this.chromaScale, this.chromaCap}) {
    for (final range in [lightness, chromaScale].nonNulls) {
      if (!(range.$1 >= 0 && range.$1 <= range.$2 && range.$2 <= 1)) {
        throw ArgumentError.value(range, 'profile range');
      }
    }
    final cap = chromaCap;
    if (cap != null && !(cap >= 0 && cap <= 0.4)) {
      throw ArgumentError.value(cap, 'chromaCap');
    }
  }
}

final class ThemeProfile {
  final RoleProfile? fill, text;
  const ThemeProfile({this.fill, this.text});
}

final class Renderer {
  final ThemeProfile lightProfile, darkProfile;
  final String namespace;
  final int seed;
  final double contrastTarget;
  final Map<String, double> contrastTargets;
  final _Background _light, _dark;
  Renderer(
      {this.namespace = '',
      this.seed = 0,
      this.lightProfile = const ThemeProfile(),
      this.darkProfile = const ThemeProfile(),
      this.contrastTarget = 4.5,
      Map<String, double> contrastTargets = const {},
      String lightBackground = '#ffffff',
      String darkBackground = '#121212'})
      : contrastTargets = Map.unmodifiable(contrastTargets),
        _light = _Background(lightBackground),
        _dark = _Background(darkBackground) {
    RangeError.checkValueInInterval(seed, 0, 0xffffffff, 'seed');
    const roles = {
      'fill',
      'fillHover',
      'fillActive',
      'border',
      'text',
      'textOnSubtle',
      'strong'
    };
    if (!contrastTargets.keys.every(roles.contains) ||
        ![contrastTarget, ...contrastTargets.values]
            .every((x) => x >= 1 && x <= 21)) {
      throw ArgumentError('Invalid WCAG contrast targets');
    }
  }

  RenderedPalette resolve(String text) {
    final f = identityFractions(
        identityDigest(text, namespace: namespace, seed: seed));
    final pos = f[0] * 12, i = pos.floor();
    final hue = (anchors[i] + (anchors[i + 1] - anchors[i]) * (pos - i)) % 360;
    return (
      version: 'text-to-color-v1',
      source: 'hash',
      hue: hue,
      hueFraction: f[0],
      light: _theme(false, hue, f[1], f[2]),
      dark: _theme(true, hue, f[1], f[2])
    );
  }

  Map<String, Color> _theme(bool dark, double hue, double uL, double uC) {
    final base = dark ? _dark : _light, direction = dark ? 1 : -1;
    double target(String role) =>
        contrastTargets[role] ??
        (role == 'border' ? math.min(3.0, contrastTarget) : contrastTarget);
    final profile = dark ? darkProfile : lightProfile;
    double sample(bool fill) {
      final range = (fill ? profile.fill : profile.text)?.lightness;
      final start =
          range?.$1 ?? (dark ? (fill ? 0.4 : 0.72) : (fill ? 0.72 : 0.43));
      final end =
          range?.$2 ?? (dark ? (fill ? 0.5 : 0.82) : (fill ? 0.82 : 0.53));
      final bias = biases[(dark ? 2 : 0) + (fill ? 0 : 1)],
          sector = (hue / 30).floor();
      final offset = bias[sector] +
          (bias[(sector + 1) % 12] - bias[sector]) * (hue / 30 - sector);
      return (start + (end - start) * uL + offset).clamp(0.0, 1.0);
    }

    const black = [0, 0, 0], white = [255, 255, 255];
    List<int> foreground(List<int> rgb) =>
        measureContrast(black, rgb) >= measureContrast(white, rgb)
            ? black
            : white;
    List<int> tone(double value, bool fill, double threshold,
        {List<int>? background, List<int>? subtle}) {
      final l = value.clamp(0.0, 1.0);
      final role = fill ? profile.fill : profile.text;
      final scale = role?.chromaScale ?? (0.6, 0.8);
      final c = math.min(role?.chromaCap ?? (fill ? 0.16 : 0.19),
          Gamut.sRGB.cusp(l, hue) * (scale.$1 + (scale.$2 - scale.$1) * uC));
      return Gamut.sRGB
          .repair(l, c, hue, threshold, (bytes) {
            final primary =
                measureContrast(bytes, background ?? foreground(bytes));
            return subtle == null
                ? primary
                : math.min(
                    primary,
                    measureContrast(bytes, subtle) *
                        (threshold / target('textOnSubtle')));
          })
          .color
          .bytes;
    }

    final lb = base.lightness, lf = sample(true), lt = sample(false);
    final subtle = tone(lb + direction * 0.04, true, 1);
    final fill = tone(lf, true, target('fill')), onFill = foreground(fill);
    final roles = {
      'background': base.bytes,
      'subtle': subtle,
      'muted': tone(lb + direction * 0.10, true, 1),
      'fill': fill,
      'onFill': onFill,
      'fillHover': tone(lf + direction * 0.025, true, target('fillHover'),
          background: onFill),
      'fillActive': tone(lf + direction * 0.05, true, target('fillActive'),
          background: onFill),
      'border': tone(lb + direction * 0.39, true, target('border'),
          background: base.bytes),
      'text': tone(lt, false, target('text'),
          background: base.bytes, subtle: subtle),
      'strong': tone(lt + direction * 0.10, false, target('strong'),
          background: base.bytes)
    };
    return Map.unmodifiable(roles
        .map((role, v) => MapEntry(role, Color.fromRgb(v[0], v[1], v[2]))));
  }
}
