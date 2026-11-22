package com.hustedev.texthue

fun main() {
    val count = generateSequence(::readlnOrNull).map { line ->
        val (source, alpha, backdrop, expected) = line.split('\t')
        check(compositeOver(source, alpha.toDouble(), backdrop).hex == expected) { line }
    }.count()
    check(count > 0)
    for (alpha in listOf(-0.1, 1.1, Double.NaN, Double.POSITIVE_INFINITY, Double.NEGATIVE_INFINITY)) {
        check(runCatching { compositeOver("#000000", alpha, "#ffffff") }.exceptionOrNull() is IllegalArgumentException)
    }
    println("Passed $count linear-light sRGB composites and invalid alpha checks")
}
