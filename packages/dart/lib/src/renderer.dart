import 'dart:convert';
import 'dart:typed_data';
import 'package:crypto/crypto.dart';
import 'dart:math' as math;
import 'color.dart';
import 'contrast.dart';
import 'gamut_fit.dart';
import 'identity.dart';
import 'normalization.dart';
import 'hue_domain.dart';
import 'tables.dart';
import 'tone_repair.dart';

part 'assignment.dart';

typedef RenderedPalette = ({
  String version,
  String source,
  double hue,
  double hueFraction,
  Map<String, Color> light,
  Map<String, Color> dark
});

List<int> _parseHex(String hex) {
  if (!RegExp(r'^#[0-9a-fA-F]{6}$').hasMatch(hex))
    throw FormatException('Expected six-digit hex color', hex);
  return [
    for (final i in [1, 3, 5]) int.parse(hex.substring(i, i + 2), radix: 16)
  ];
}

enum ForegroundPolicy { best, firstPassing }

final class PaletteEntry {
  final String id;
  final String? light, dark;
  const PaletteEntry(this.id, {this.light, this.dark});
}

typedef _Mapping = ({
  String source,
  double hue,
  double fraction,
  double uL,
  double uC,
  (_FixedTone, _FixedTone)? fixed
});

typedef _RankedTone = ({List<int> id, (_FixedTone, _FixedTone) tones});
typedef BrandColors = ({String light, String dark});

final class _FixedTone {
  final List<int> bytes;
  final double hue, lightness;
  final bool neutral;
  _FixedTone._(this.bytes, this.hue, this.lightness, this.neutral);
  factory _FixedTone(String hex) {
    final bytes = _parseHex(hex);
    final coords = Color.fromRgb(bytes[0], bytes[1], bytes[2]).oklch;
    return _FixedTone._(bytes, ((coords.h * 1024).round() / 1024) % 360,
        (coords.l * 4096).round() / 4096, coords.c == 0);
  }

  double get fraction {
    final angle = hue < anchors.first ? hue + 360 : hue;
    final i = anchors.lastIndexWhere((a) => a <= angle);
    return (i + (angle - anchors[i]) / (anchors[i + 1] - anchors[i])) / 12;
  }
}

final class _Background {
  final List<int> bytes;
  final double lightness;
  _Background._(this.bytes, this.lightness);
  factory _Background(String hex) {
    final bytes = _parseHex(hex);
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

enum Preset {
  labels(0.6, 0.8),
  controls(0.6, 0.8),
  chart(0.8, 1),
  subdued(0.2, 0.4),
  mono(0, 0);

  final double low, high;
  const Preset(this.low, this.high);
}

final class Renderer {
  final ContrastModel contrastModel;
  final Preset preset;
  final ThemeProfile lightProfile, darkProfile;
  final String namespace;
  final Normalization normalization;
  final String _scope;
  final int seed;
  final double contrastTarget;
  final Map<String, double> contrastTargets;
  final ForegroundPolicy foregroundPolicy;
  final HueDomain _hues;
  final _palette = <_RankedTone>[];
  final _overrides = <String, (_FixedTone, _FixedTone)>{};
  final List<List<int>> _foregrounds;
  final _Background _light, _dark;
  Renderer(
      {this.namespace = '',
      this.normalization = const Normalization(),
      this.seed = 0,
      this.lightProfile = const ThemeProfile(),
      this.darkProfile = const ThemeProfile(),
      this.contrastModel = ContrastModel.wcag2,
      this.foregroundPolicy = ForegroundPolicy.best,
      HueArc hueRange = const (0, 360),
      List<HueArc> excludeHues = const [],
      List<String> foregrounds = const ["#000000", "#ffffff"],
      this.preset = Preset.labels,
      List<PaletteEntry>? palette,
      Map<String, BrandColors> overrides = const {},
      double? contrastTarget,
      Map<String, double> contrastTargets = const {},
      String lightBackground = '#ffffff',
      String darkBackground = '#121212'})
      : _scope = normalization.apply(namespace),
        contrastTarget = contrastTarget ??
            (contrastModel == ContrastModel.apca
                ? 60
                : preset == Preset.controls
                    ? 7
                    : 4.5),
        contrastTargets = Map.unmodifiable(contrastTargets),
        _hues = HueDomain(hueRange, excludeHues),
        _foregrounds = foregrounds.map(_parseHex).toList(growable: false),
        _light = _Background(lightBackground),
        _dark = _Background(darkBackground) {
    for (final entry in overrides.entries) {
      final key = normalization.apply(entry.key);
      if (_overrides.containsKey(key))
        throw ArgumentError('Duplicate normalized override');
      _overrides[key] =
          (_FixedTone(entry.value.light), _FixedTone(entry.value.dark));
    }
    if (_foregrounds.isEmpty)
      throw ArgumentError("Expected at least one foreground");
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
        ![this.contrastTarget, ...contrastTargets.values].every((x) =>
            contrastModel == ContrastModel.apca
                ? x >= 0 && x <= 106
                : x >= 1 && x <= 21)) {
      throw ArgumentError('Invalid contrast targets');
    }
    if (palette != null) {
      if (palette.isEmpty) throw ArgumentError('Empty palette');
      final ids = <String>{};
      final passing = <_RankedTone>[];
      final target = contrastTargets['fill'] ?? this.contrastTarget;
      bool passes(_FixedTone tone) => _foregrounds.any((color) =>
          measureContrast(color, tone.bytes, model: contrastModel).abs() >=
          target);
      for (final entry in palette) {
        validateUtf16(entry.id);
        if (!ids.add(entry.id)) throw ArgumentError('Duplicate palette ID');
        final light = entry.light ?? entry.dark;
        if (light == null) throw ArgumentError('Missing palette color');
        final tones = (_FixedTone(light), _FixedTone(entry.dark ?? light));
        final ranked = (id: utf8.encode(entry.id), tones: tones);
        _palette.add(ranked);
        if (passes(tones.$1) && passes(tones.$2)) passing.add(ranked);
      }
      if (passing.isNotEmpty) {
        _palette
          ..clear()
          ..addAll(passing);
      }
    }
  }

  /// Resolves labels in input order and shares duplicate results within this call.
  List<RenderedPalette> batch(Iterable<String> labels) {
    final cache = <String, RenderedPalette>{};
    return [
      for (final key in labels.map(normalization.apply))
        cache.putIfAbsent(key, () => _resolveNormalized(key))
    ];
  }

  RenderedPalette resolve(String text) =>
      _resolveNormalized(normalization.apply(text));

  List<int> _selected(String text, bool dark, String role) =>
      _theme(dark, _mapping(normalization.apply(text)), role)[role] ??
      (throw ArgumentError.value(role, 'role', 'Unknown color role'));

  String hex(String text, {bool dark = false, String role = 'fill'}) =>
      rgbHex(_selected(text, dark, role));

  Color color(String text, {bool dark = false, String role = 'fill'}) {
    final bytes = _selected(text, dark, role);
    return Color.fromRgb(bytes[0], bytes[1], bytes[2]);
  }

  RenderedPalette _resolveNormalized(String text) => _render(_mapping(text));

  RenderedPalette _render(_Mapping mapping, [int ring = 0]) {
    Map<String, Color> theme(bool dark) =>
        Map.unmodifiable(_theme(dark, mapping, null, ring)
            .map((role, v) => MapEntry(role, Color.fromRgb(v[0], v[1], v[2]))));
    return (
      version: 'text-to-color-v1',
      source: mapping.source,
      hue: mapping.hue,
      hueFraction: mapping.fraction,
      light: theme(false),
      dark: theme(true)
    );
  }

  _Mapping _fixedMapping((_FixedTone, _FixedTone) tones, String source) => (
        source: source,
        hue: tones.$1.hue,
        fraction: tones.$1.fraction,
        uL: 0.5,
        uC: 0.5,
        fixed: tones
      );

  _Mapping _mapping(String text, [Uint8List? prehashed]) {
    final fixed = _overrides[text];
    if (fixed != null) return _fixedMapping(fixed, 'override');
    final digest =
        prehashed ?? identityDigest(text, namespace: _scope, seed: seed);
    _RankedTone? winner;
    var best = '';
    for (final entry in _palette) {
      final rank = sha256.convert([...digest, ...entry.id]).toString();
      if (rank.compareTo(best) > 0) {
        winner = entry;
        best = rank;
      }
    }
    if (winner != null) return _fixedMapping(winner.tones, 'palette');
    final f = identityFractions(digest);
    return (
      source: 'hash',
      hue: _mappedHue(f[0]),
      fraction: f[0],
      uL: f[1],
      uC: f[2],
      fixed: null
    );
  }

  double _mappedHue(double fraction) {
    final pos = fraction * 12, i = pos.floor();
    return _hues
        .map((anchors[i] + (anchors[i + 1] - anchors[i]) * (pos - i)) % 360);
  }

  Map<String, List<int>> _theme(bool dark, _Mapping mapping,
      [String? selected, int ring = 0]) {
    final fixed = dark ? mapping.fixed?.$2 : mapping.fixed?.$1;
    final hue = fixed?.hue ?? mapping.hue, uL = mapping.uL, uC = mapping.uC;
    final base = dark ? _dark : _light, direction = dark ? 1 : -1;
    double target(String role) =>
        contrastTargets[role] ??
        (role == 'border' && contrastModel == ContrastModel.wcag2
            ? math.min(3.0, contrastTarget)
            : contrastTarget);
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
      return (start +
              (end - start) * uL +
              offset +
              const [0.0, 0.08, -0.08, 0.16, -0.16][ring % 5])
          .clamp(0.0, 1.0);
    }

    double score(List<int> text, List<int> bg) =>
        measureContrast(text, bg, model: contrastModel).abs();
    final unconstrained = contrastModel == ContrastModel.apca ? 0.0 : 1.0;
    List<int> foreground(List<int> rgb, double required) {
      var best = _foregrounds.first;
      var bestScore = -1.0;
      for (final candidate in _foregrounds) {
        final value = score(candidate, rgb);
        if (foregroundPolicy == ForegroundPolicy.firstPassing &&
            value >= required) return candidate;
        if (value > bestScore) {
          bestScore = value;
          best = candidate;
        }
      }
      return best;
    }

    List<int> tone(double value, bool fill, double threshold,
        {List<int>? background, List<int>? subtle, bool surface = false}) {
      final l = value.clamp(0.0, 1.0);
      final role = fill ? profile.fill : profile.text;
      final scale = role?.chromaScale ?? (preset.low, preset.high);
      final c = fixed?.neutral == true
          ? 0.0
          : math.min(
              role?.chromaCap ?? (fill ? 0.16 : 0.19),
              Gamut.sRGB.cusp(l, hue) *
                  ((scale.$1 + (scale.$2 - scale.$1) * uC) *
                      (ring % 5 < 3 ? 1 : 0.6)));
      final secondary = subtle == null ? 0.0 : target('textOnSubtle');
      return Gamut.sRGB
          .repair(l, c, hue, threshold == 0 ? secondary : threshold, (bytes) {
            final primary = background == null
                ? score(foreground(bytes, threshold), bytes)
                : surface
                    ? score(background, bytes)
                    : score(bytes, background);
            if (subtle == null || secondary == 0) return primary;
            final other = score(bytes, subtle);
            return threshold == 0
                ? other
                : math.min(primary, other * (threshold / secondary));
          })
          .color
          .bytes;
    }

    late final lb = base.lightness,
        lf = fixed?.lightness ?? sample(true),
        lt = sample(false);
    late final subtle = tone(lb + direction * 0.04, true, unconstrained);
    late final fill = fixed?.bytes ?? tone(lf, true, target('fill')),
        onFill = foreground(fill, target('fill'));
    return {
      if (selected == null || selected == 'background')
        'background': base.bytes,
      if (selected == null || selected == 'subtle') 'subtle': subtle,
      if (selected == null || selected == 'muted')
        'muted': tone(lb + direction * 0.10, true, unconstrained),
      if (selected == null || selected == 'fill') 'fill': fill,
      if (selected == null || selected == 'onFill') 'onFill': onFill,
      if (selected == null || selected == 'fillHover')
        'fillHover': tone(lf + direction * 0.025, true, target('fillHover'),
            background: onFill, surface: true),
      if (selected == null || selected == 'fillActive')
        'fillActive': tone(lf + direction * 0.05, true, target('fillActive'),
            background: onFill, surface: true),
      if (selected == null || selected == 'border')
        'border': tone(lb + direction * 0.39, true, target('border'),
            background: base.bytes),
      if (selected == null || selected == 'text')
        'text': tone(lt, false, target('text'),
            background: base.bytes, subtle: subtle),
      if (selected == null || selected == 'strong')
        'strong': tone(lt + direction * 0.10, false, target('strong'),
            background: base.bytes)
    };
  }
}
