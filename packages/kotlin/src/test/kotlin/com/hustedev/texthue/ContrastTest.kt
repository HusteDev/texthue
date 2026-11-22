package com.hustedev.texthue

import kotlin.math.abs

fun main() {
    val count = generateSequence(::readlnOrNull).map { line ->
        val fields = line.split('\t')
        fun bytes(column: Int) = fields[column].split(',').map(String::toInt).toIntArray()
        val actual = Contrast.measure(bytes(2), bytes(3), ContrastModel.valueOf(fields[0]), Gamut.valueOf(fields[1]))
        check(abs(actual - fields[4].toDouble()) <= 1e-12) { "$line: $actual" }
    }.count()
    check(count > 0)
    println("Passed $count shared contrast measurements")
}
