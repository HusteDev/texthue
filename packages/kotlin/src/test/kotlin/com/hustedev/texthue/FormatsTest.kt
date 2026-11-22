package com.hustedev.texthue

import kotlin.math.abs

fun main() {
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
