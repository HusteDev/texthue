package com.hustedev.texthue

fun main() {
    val count = generateSequence(::readlnOrNull).map { line ->
        val (native, fallback, clipped) = line.split('\t')
        val bytes = native.split(',').map(String::toInt).toIntArray()
        val color = renderedColor(bytes, Gamut.DISPLAY_P3)
        check(color.rgb == renderedColor(fallback.split(',').map(String::toInt).toIntArray()).rgb) { line }
        check(color.srgbClipped == clipped.toBooleanStrict()) { line }
        val channels = bytes.map { round6(it / 255.0) }
        check(color.p3 == DisplayP3(channels[0], channels[1], channels[2])) { line }
        check(color.css!!.removePrefix("color(display-p3 ").removeSuffix(")").split(' ').map(String::toDouble) == channels)
    }.count()
    check(count > 0)
    println("Passed $count Display-P3 rendition vectors")
}
