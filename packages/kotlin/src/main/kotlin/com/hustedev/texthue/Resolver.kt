package com.hustedev.texthue

import kotlin.math.abs
import kotlin.math.floor

data class ThemePalette(val colors: Map<String, String>) {
    fun color(role: String): Color = renderedColor(parseHex(colors.getValue(role)))
}
data class Palette(val hue: Double, val light: ThemePalette, val dark: ThemePalette)

enum class Preset(internal val minScale: Double, internal val maxScale: Double, internal val target: Double = 4.5) {
    LABELS(0.6, 0.8),
    CONTROLS(0.6, 0.8, 7.0),
    CHART(0.8, 1.0),
    SUBDUED(0.2, 0.4),
    MONO(0.0, 0.0),
}

data class ContrastTargets(
    val fill: Double? = null,
    val fillHover: Double? = null,
    val fillActive: Double? = null,
    val border: Double? = null,
    val text: Double? = null,
    val textOnSubtle: Double? = null,
    val strong: Double? = null,
)

enum class ForegroundPolicy { BEST, FIRST_PASSING }

data class Backgrounds(val light: String = "#ffffff", val dark: String = "#121212")

private val hexColor = Regex("#[0-9A-Fa-f]{6}")

private fun parseHex(hex: String): IntArray {
    require(hexColor.matches(hex)) { "Expected a six-digit hex color" }
    return IntArray(3) { i -> hex.substring(1 + 2 * i, 3 + 2 * i).toInt(16) }
}

private class ThemeBackground(hex: String) {
    val bytes = parseHex(hex)
    val lightness = floor(ColorMath.oklch(bytes).l * 4096 + 0.5) / 4096
}

class Resolver(
    namespace: String = "",
    private val seed: UInt = 0u,
    contrastTarget: Double? = null,
    private val normalization: Normalization = Normalization(),
    private val preset: Preset = Preset.LABELS,
    private val contrastModel: ContrastModel = ContrastModel.WCAG2,
    private val contrastTargets: ContrastTargets = ContrastTargets(),
    foregrounds: List<String> = listOf("#000000", "#ffffff"),
    private val foregroundPolicy: ForegroundPolicy = ForegroundPolicy.BEST,
    hueRange: HueArc = HueArc(0.0, 360.0),
    excludeHues: List<HueArc> = emptyList(),
    backgrounds: Backgrounds = Backgrounds(),
    private val profiles: Profiles = Profiles(),
) {
    private val apca = contrastModel == ContrastModel.APCA
    private val target = contrastTarget ?: if (apca) 60.0 else preset.target
    private val hueDomain = HueDomain(hueRange, excludeHues)
    private val scope = normalization.apply(namespace)

    private val candidates = foregrounds.map(::parseHex)
    private val lightBackground = ThemeBackground(backgrounds.light)
    private val darkBackground = ThemeBackground(backgrounds.dark)

    init {
        require(candidates.isNotEmpty()) { "At least one foreground is required" }
        val range = if (apca) 0.0..106.0 else 1.0..21.0
        with(contrastTargets) {
            require(listOfNotNull(target, fill, fillHover, fillActive, border, text, textOnSubtle, strong).all { it in range })
        }
    }

    fun resolve(text: String): Palette {
        val (uH, uL, uC) = Identity.fractions(Identity.digest(normalization.apply(text), scope, seed))
        val position = uH * 12
        val slot = position.toInt()
        val naturalHue = (anchors[slot] + (anchors[slot + 1] - anchors[slot]) * (position - slot)) % 360
        val hue = hueDomain.map(naturalHue)
        return Palette(hue, theme(false, hue, uL, uC), theme(true, hue, uL, uC))
    }

    private fun theme(dark: Boolean, hue: Double, uL: Double, uC: Double): ThemePalette {
        val base = if (dark) darkBackground else lightBackground
        val background = base.bytes
        val direction = if (dark) 1 else -1
        val lb = base.lightness
        val profile = if (dark) profiles.dark else profiles.light
        val defaultScale = preset.minScale + (preset.maxScale - preset.minScale) * uC
        fun sample(low: Double, high: Double, role: Int): Double {
            val bias = biases[(if (dark) 2 else 0) + role]
            val segment = (hue / 30).toInt()
            val correction = bias[segment] + (bias[(segment + 1) % 12] - bias[segment]) * (hue / 30 - segment)
            return (low + (high - low) * uL + correction).coerceIn(0.0, 1.0)
        }
        val fillRange = profile.fill.lightness ?: if (dark) UnitRange(0.4, 0.5) else UnitRange(0.72, 0.82)
        val fillL = sample(fillRange.low, fillRange.high, 0)
        val textRange = profile.text.lightness ?: if (dark) UnitRange(0.72, 0.82) else UnitRange(0.43, 0.53)
        val textL = sample(textRange.low, textRange.high, 1)
        fun contrast(a: IntArray, b: IntArray) = abs(Contrast.measure(a, b, contrastModel, Gamut.SRGB))
        fun foreground(rgb: IntArray, required: Double): IntArray {
            var best = candidates.first()
            var bestScore = -1.0
            for (candidate in candidates) {
                val score = contrast(candidate, rgb)
                if (foregroundPolicy == ForegroundPolicy.FIRST_PASSING && score >= required) return candidate
                if (score > bestScore) {
                    best = candidate
                    bestScore = score
                }
            }
            return best
        }
        fun tone(l: Double, role: RoleProfile, defaultCap: Double, target: Double, backdrop: IntArray? = null, second: IntArray? = null, secondTarget: Double = target, surface: Boolean = false): IntArray {
            val lightness = l.coerceIn(0.0, 1.0)
            val scale = role.chromaScale?.sample(uC) ?: defaultScale
            val chroma = minOf(role.chromaCap ?: defaultCap, ColorMath.cusp(lightness, hue, Gamut.SRGB) * scale)
            val threshold = if (target == 0.0 && second != null) secondTarget else target
            return repairTone(lightness, chroma, hue, Gamut.SRGB, threshold) { rgb ->
                val primary = if (backdrop == null || surface) contrast(backdrop ?: foreground(rgb, target), rgb)
                    else contrast(rgb, backdrop)
                when {
                    second == null || secondTarget == 0.0 -> primary
                    target == 0.0 -> contrast(rgb, second)
                    else -> minOf(primary, contrast(rgb, second) * (target / secondTarget))
                }
            }.color.bytes
        }
        val unconstrained = if (apca) 0.0 else 1.0
        val borderTarget = contrastTargets.border ?: if (apca) target else minOf(3.0, target)
        val subtle = tone(lb + direction * 0.04, profile.fill, 0.16, unconstrained)
        val fill = tone(fillL, profile.fill, 0.16, contrastTargets.fill ?: target)
        val onFill = foreground(fill, contrastTargets.fill ?: target)
        val colors = mapOf(
            "background" to background,
            "subtle" to subtle,
            "muted" to tone(lb + direction * 0.10, profile.fill, 0.16, unconstrained),
            "fill" to fill,
            "onFill" to onFill,
            "fillHover" to tone(fillL + direction * 0.025, profile.fill, 0.16, contrastTargets.fillHover ?: target, onFill, surface = true),
            "fillActive" to tone(fillL + direction * 0.05, profile.fill, 0.16, contrastTargets.fillActive ?: target, onFill, surface = true),
            "border" to tone(lb + direction * 0.39, profile.fill, 0.16, borderTarget, background),
            "text" to tone(textL, profile.text, 0.19, contrastTargets.text ?: target, background, subtle, contrastTargets.textOnSubtle ?: target),
            "strong" to tone(textL + direction * 0.10, profile.text, 0.19, contrastTargets.strong ?: target, background),
        )
        return ThemePalette(colors.mapValues { (_, rgb) -> rgb.joinToString("", prefix = "#") { it.toString(16).padStart(2, '0') } })
    }
}
