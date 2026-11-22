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
    val resolver = Resolver(gamut = Gamut.DISPLAY_P3, contrastModel = ContrastModel.APCA,
        backgrounds = Backgrounds(dark = "#176fd0"))
    val dark = resolver.resolve("sample").dark
    val text = dark.color("text")
    check(text.css == "color(display-p3 1 0.882353 0.823529)")
    check(text == resolver.color("sample", dark = true, role = "text"))
    check(resolver.hex("sample", dark = true, role = "text", strict = true) == "#ffe0d0")
    check(kotlin.math.abs(dark.contrast.getValue("text").value + 63.99623265441859) < 1e-12)
    check(count > 0)
    println("Passed $count Display-P3 rendition vectors")
}
