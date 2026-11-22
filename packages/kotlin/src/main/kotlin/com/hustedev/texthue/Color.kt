package com.hustedev.texthue

import kotlin.math.floor

data class Rgb(val r: Int, val g: Int, val b: Int)
data class Hsl(val h: Double, val s: Double, val l: Double)
data class Oklch(val l: Double, val c: Double, val h: Double)
data class DisplayP3(val r: Double, val g: Double, val b: Double)
data class Color(val hex: String, val rgb: Rgb, val hsl: Hsl, val oklch: Oklch,
                 val p3: DisplayP3? = null, val css: String? = null, val srgbClipped: Boolean? = null)

internal fun round6(value: Double) = floor(value * 1e6 + 0.5) / 1e6

internal fun renderedColor(bytes: IntArray, gamut: Gamut = Gamut.SRGB): Color {
    if (gamut == Gamut.DISPLAY_P3) return renderedP3(bytes.encoded())

    val (red, green, blue) = bytes.map { it / 255.0 }
    val maximum = maxOf(red, green, blue)
    val minimum = minOf(red, green, blue)
    val delta = maximum - minimum
    val lightness = (maximum + minimum) / 2
    val hue = when {
        delta == 0.0 -> 0.0
        maximum == red -> (green - blue) / delta + (if (green < blue) 6 else 0)
        maximum == green -> (blue - red) / delta + 2
        else -> (red - green) / delta + 4
    }
    val saturation = if (delta == 0.0) 0.0 else (maximum - lightness) / minOf(lightness, 1 - lightness)
    val hex = bytes.joinToString("", prefix = "#") { it.toString(16).padStart(2, '0') }
    return Color(hex, Rgb(bytes[0], bytes[1], bytes[2]),
        Hsl(round6(60 * hue) % 360, round6(100 * saturation), round6(100 * lightness)),
        ColorMath.oklch(bytes))
}

/** Composite a six-digit sRGB source over an opaque backdrop in linear light. */
fun compositeOver(source: String, alpha: Double, backdrop: String): Color {
    require(alpha in 0.0..1.0) { "Alpha must be between zero and one" }
    val front = parseHex(source)
    val back = parseHex(backdrop)
    return renderedColor(IntArray(3) { i ->
        ColorMath.channelByte(alpha * ColorMath.linearChannel(front[i]) +
            (1 - alpha) * ColorMath.linearChannel(back[i]))
    })
}

internal fun renderedP3(bytes: DoubleArray): Color {
    val (fallback, clipped) = ColorMath.p3Fallback(bytes)
    val channels = bytes.map { round6(it / 255.0) }
    val css = channels.joinToString(" ", "color(display-p3 ", ")") {
        java.math.BigDecimal.valueOf(it).stripTrailingZeros().toPlainString()
    }
    return renderedColor(fallback).copy(oklch = ColorMath.oklch(bytes, Gamut.DISPLAY_P3),
        p3 = DisplayP3(channels[0], channels[1], channels[2]), css = css, srgbClipped = clipped)
}
