package com.hustedev.texthue

import kotlin.math.abs

fun main() {
    val red = renderedColor(intArrayOf(255, 0, 0))
    check(red.toCss() == "#ff0000")
    check(red.toCss(CssFormat.RGB) == "rgb(255 0 0)")
    check(red.toCss(CssFormat.HSL) == "hsl(0 100% 50%)")
    check(red.toCss(CssFormat.OKLCH) == "oklch(0.627955 0.257683 29.23388)")
    check(red.toCss(CssFormat.DISPLAY_P3) == "color(display-p3 0.917488 0.200287 0.138561)")
    val wideRed = renderedColor(intArrayOf(255, 0, 0), Gamut.DISPLAY_P3)
    check(wideRed.toCss(CssFormat.DISPLAY_P3) == "color(display-p3 1 0 0)")
    val count = generateSequence(::readlnOrNull).map { line ->
        val values = line.split('\t')
        val role = values[0]
        val actual = ThemePalette(mapOf(role to values[1])).color(role)
        check(actual.hex == values[1])
        check(actual.rgb == Rgb(values[2].toInt(), values[3].toInt(), values[4].toInt()))
        val coordinates = listOf(actual.hsl.h, actual.hsl.s, actual.hsl.l,
            actual.oklch.l, actual.oklch.c, actual.oklch.h)
        check(coordinates.indices.all { abs(coordinates[it] - values[it + 5].toDouble()) <= 1.000001e-6 }) { line }
    }.count()
    check(count > 0)
    println("Passed $count frozen role color formats")
}
