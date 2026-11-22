package com.hustedev.texthue

import kotlin.math.abs
import kotlin.math.sqrt

private const val POSITIONS = 24
private const val MIN_DISTANCE = 0.04

internal fun fillPoints(palette: Palette) = listOf(palette.light, palette.dark).map {
    ColorMath.oklab(parseHex(it.colors.getValue("fill")))
}

private fun score(palette: Palette, occupied: List<List<DoubleArray>>): Double {
    val points = fillPoints(palette)
    return occupied.minOfOrNull { prior ->
        points.indices.minOf { i ->
            sqrt(points[i].indices.sumOf { k ->
                val delta = points[i][k] - prior[i][k]
                delta * delta
            })
        }
    } ?: Double.POSITIVE_INFINITY
}

internal fun repairPlacement(initial: Placement, placements: Collection<Placement>, separation: Double,
    occupied: List<List<DoubleArray>>, render: (Placement) -> Palette): Pair<Placement, Palette> {
    var result = initial to render(initial)
    var best = score(result.second, occupied)
    for (step in 1 until POSITIONS * ringOffsets.size) {
        if (best >= MIN_DISTANCE) return result
        val hue = (initial.hueFraction + (step % POSITIONS).toDouble() / POSITIONS) % 1.0
        val ring = initial.ring + step / POSITIONS
        if (placements.any {
            val delta = abs(it.hueFraction - hue)
            it.ring == ring && minOf(delta, 1 - delta) < separation
        }) continue
        val candidate = Placement(hue, ring, true)
        val palette = render(candidate)
        val distance = score(palette, occupied)
        if (distance > best) {
            best = distance
            result = candidate to palette
        }
    }
    return result
}
