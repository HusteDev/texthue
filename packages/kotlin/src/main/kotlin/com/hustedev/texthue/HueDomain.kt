package com.hustedev.texthue

/** An arc in degrees. A start greater than the end crosses zero. */
data class HueArc(val start: Double, val end: Double) {
    init { require(start in 0.0..360.0 && end in 0.0..360.0) }
    internal fun split() = if (start <= end) listOf(this) else listOf(HueArc(0.0, end), HueArc(start, 360.0))
}

internal class HueDomain(allowed: HueArc, excluded: List<HueArc>) {
    private val segments: List<HueArc>
    private val width: Double
    private val exclusions: List<HueArc>

    init {
        require(excluded.size <= 16)
        var remaining = allowed.split().filter { it.start < it.end }
        exclusions = excluded.flatMap { it.split() }.filter { it.start < it.end }
        for (cut in exclusions) {
            remaining = buildList {
                for (arc in remaining) {
                    val leftEnd = minOf(arc.end, cut.start)
                    val rightStart = maxOf(arc.start, cut.end)
                    if (arc.start < leftEnd) add(HueArc(arc.start, leftEnd))
                    if (rightStart < arc.end) add(HueArc(rightStart, arc.end))
                }
            }
        }
        segments = remaining
        width = segments.fold(0.0) { sum, arc -> sum + arc.end - arc.start }
        require(width > 0.0) { "Empty hue domain" }
    }

    fun excludes(rgb: DoubleArray, gamut: Gamut): Boolean {
        if (exclusions.isEmpty() || (rgb[0] == rgb[1] && rgb[1] == rgb[2])) return false
        val hue = ColorMath.oklch(rgb, gamut).h
        return exclusions.any { hue >= it.start && hue < it.end }
    }

    fun map(hue: Double): Double {
        if (width == 360.0) return hue
        var distance = hue / 360.0 * width
        for (arc in segments) {
            val span = arc.end - arc.start
            if (distance < span) return arc.start + distance
            distance -= span
        }
        return segments.first().start
    }
}
