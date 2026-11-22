package com.hustedev.texthue

import kotlin.math.abs

fun main() {
    val count = generateSequence(::readlnOrNull).map { line ->
        val fields = line.split('\t')
        val gamut = Gamut.valueOf(fields[0])
        val model = ContrastModel.valueOf(fields[1])
        val background = fields[5].split(',').map(String::toInt).toIntArray()
        val chosen = repairTone(fields[2].toDouble(), fields[3].toDouble(), fields[4].toDouble(),
            gamut, fields[6].toDouble()) { abs(Contrast.measure(it, background, model, gamut)) }
        check(chosen.color.bytes.joinToString(",") == fields[7]) { line }
        check(chosen.color.lightness == fields[8].toDouble()) { line }
        check(abs(chosen.color.chroma - fields[9].toDouble()) <= 1e-12) { line }
        check(abs(chosen.score - fields[10].toDouble()) <= 1e-12) { line }
        check((chosen.fallback ?: "-") == fields[11]) { line }
    }.count()
    check(count > 0)
    val tied = repairTone(0.5, 0.0, 0.0, Gamut.SRGB, 1.0) { 0.0 }
    check(tied.color.lightness == 0.0 && tied.fallback == "unattainable-contrast")
    println("Passed $count contrast-repair cases and the fallback tie check")
}
