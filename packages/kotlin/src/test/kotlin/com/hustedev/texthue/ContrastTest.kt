package com.hustedev.texthue

import kotlin.math.abs

fun main() {
    val count = generateSequence(::readlnOrNull).map { line ->
        val fields = line.split('\t')
        fun bytes(column: Int) = fields[column].split(',').map(String::toInt).toIntArray()
        val actual = Contrast.measure(bytes(2), bytes(3), ContrastModel.valueOf(fields[0]), Gamut.valueOf(fields[1]))
        check(abs(actual - fields[4].toDouble()) <= 1e-12) { "$line: $actual" }
    }.count()
    // Reference renderer: supplied #176fd0 against an emitted P3 byte triple.
    val supplied = ColorMath.srgbToP3(intArrayOf(23, 111, 208))
    val emitted = doubleArrayOf(243.0, 156.0, 30.0)
    check(abs(Contrast.measure(supplied, emitted, ContrastModel.WCAG2, Gamut.DISPLAY_P3) - 2.3039150922184106) <= 1e-12)
    check(abs(Contrast.measure(supplied, emitted, ContrastModel.APCA, Gamut.DISPLAY_P3) - 29.871865630394122) <= 1e-12)
    check(abs(Contrast.measure(emitted, supplied, ContrastModel.APCA, Gamut.DISPLAY_P3) + 31.71412486055511) <= 1e-12)
    check(count > 0)
    println("Passed $count shared contrast measurements")
}
