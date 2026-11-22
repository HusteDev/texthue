package com.hustedev.texthue

import java.util.Base64
import kotlin.math.abs

fun main() {
    val roles = listOf("background","subtle","muted","fill","onFill","fillHover","fillActive","border","text","strong")
    fun decode(value: String) = Base64.getDecoder().decode(value).toString(Charsets.UTF_8)
    val count = generateSequence(::readlnOrNull).map { line ->
        val row = line.split('\t')
        val palette = Resolver(decode(row[1]), row[2].toUInt(), row[3].toDouble()).resolve(decode(row[0]))
        check(abs(palette.hue - row[4].toDouble()) < 1e-12)
        val colors = listOf(palette.light, palette.dark).flatMap { theme -> roles.map { theme.colors.getValue(it) } }
        check(colors == row.drop(5)) { "$line: $colors" }
    }.count()
    check(count > 0)
    println("Passed $count two-theme resolver vectors")
}
