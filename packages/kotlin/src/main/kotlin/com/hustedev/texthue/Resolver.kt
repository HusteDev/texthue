package com.hustedev.texthue

import kotlin.math.floor

data class ThemePalette(val colors: Map<String, String>)
data class Palette(val hue: Double, val light: ThemePalette, val dark: ThemePalette)

enum class Preset(internal val minScale: Double, internal val maxScale: Double, internal val target: Double = 4.5) {
    LABELS(0.6, 0.8),
    CONTROLS(0.6, 0.8, 7.0),
    CHART(0.8, 1.0),
    SUBDUED(0.2, 0.4),
    MONO(0.0, 0.0),
}

class Resolver(
    namespace: String = "",
    private val seed: UInt = 0u,
    contrastTarget: Double? = null,
    private val normalization: Normalization = Normalization(),
    private val preset: Preset = Preset.LABELS,
) {
    private val target = contrastTarget ?: preset.target
    private val scope = normalization.apply(namespace)

    init { require(target in 1.0..21.0) }

    fun resolve(text: String): Palette {
        val (uH, uL, uC) = Identity.fractions(Identity.digest(normalization.apply(text), scope, seed))
        val position = uH * 12
        val slot = position.toInt()
        val hue = (anchors[slot] + (anchors[slot + 1] - anchors[slot]) * (position - slot)) % 360
        return Palette(hue, theme(false, hue, uL, uC), theme(true, hue, uL, uC))
    }

    private fun theme(dark: Boolean, hue: Double, uL: Double, uC: Double): ThemePalette {
        val background = IntArray(3) { if (dark) 18 else 255 }
        val direction = if (dark) 1 else -1
        val lb = floor((if (dark) 0.182204 else 1.0) * 4096 + 0.5) / 4096
        val scale = preset.minScale + (preset.maxScale - preset.minScale) * uC
        fun sample(low: Double, high: Double, role: Int): Double {
            val bias = biases[(if (dark) 2 else 0) + role]
            val segment = (hue / 30).toInt()
            val correction = bias[segment] + (bias[(segment + 1) % 12] - bias[segment]) * (hue / 30 - segment)
            return (low + (high - low) * uL + correction).coerceIn(0.0, 1.0)
        }
        val fillL = if (dark) sample(0.4, 0.5, 0) else sample(0.72, 0.82, 0)
        val textL = if (dark) sample(0.72, 0.82, 1) else sample(0.43, 0.53, 1)
        val black = IntArray(3)
        val white = IntArray(3) { 255 }
        fun contrast(a: IntArray, b: IntArray) = Contrast.measure(a, b, ContrastModel.WCAG2, Gamut.SRGB)
        fun foreground(rgb: IntArray) = if (contrast(black, rgb) >= contrast(white, rgb)) black else white
        fun tone(l: Double, cap: Double, target: Double, backdrop: IntArray? = null, second: IntArray? = null): IntArray {
            val lightness = l.coerceIn(0.0, 1.0)
            val chroma = minOf(cap, ColorMath.cusp(lightness, hue, Gamut.SRGB) * scale)
            return repairTone(lightness, chroma, hue, Gamut.SRGB, target) { rgb ->
                val primary = contrast(rgb, backdrop ?: foreground(rgb))
                if (second == null) primary else minOf(primary, contrast(rgb, second))
            }.color.bytes
        }
        val subtle = tone(lb + direction * 0.04, 0.16, 1.0)
        val fill = tone(fillL, 0.16, target)
        val onFill = foreground(fill)
        val colors = mapOf(
            "background" to background,
            "subtle" to subtle,
            "muted" to tone(lb + direction * 0.10, 0.16, 1.0),
            "fill" to fill,
            "onFill" to onFill,
            "fillHover" to tone(fillL + direction * 0.025, 0.16, target, onFill),
            "fillActive" to tone(fillL + direction * 0.05, 0.16, target, onFill),
            "border" to tone(lb + direction * 0.39, 0.16, minOf(3.0, target), background),
            "text" to tone(textL, 0.19, target, background, subtle),
            "strong" to tone(textL + direction * 0.10, 0.19, target, background),
        )
        return ThemePalette(colors.mapValues { (_, rgb) -> rgb.joinToString("", prefix = "#") { it.toString(16).padStart(2, '0') } })
    }
}
