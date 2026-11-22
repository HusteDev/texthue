package com.hustedev.texthue

import kotlin.math.abs

fun main() {
    val count = generateSequence(::readlnOrNull).map { line ->
        val fields = line.split('\t')
        val (l,c,h) = fields.take(3).map(String::toDouble)
        val fit = ColorMath.fit(l, c, h, Gamut.valueOf(fields[3]))
        check(fit.bytes.joinToString(",") == fields[4]) { line }
        if (fields.size > 5) check(abs(fit.chroma - fields[5].toDouble()) <= 1e-12) { line }
    }.count()
    check(count > 0)
    println("Passed $count gamut-fitting vectors")
}
