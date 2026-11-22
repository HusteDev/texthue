package com.hustedev.texthue

import kotlin.math.floor

data class Rgb(val r: Int, val g: Int, val b: Int)
data class Hsl(val h: Double, val s: Double, val l: Double)
data class Oklch(val l: Double, val c: Double, val h: Double)
data class Color(val hex: String, val rgb: Rgb, val hsl: Hsl, val oklch: Oklch)

internal fun round6(value: Double) = floor(value * 1e6 + 0.5) / 1e6

internal fun renderedColor(bytes: IntArray): Color {
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
