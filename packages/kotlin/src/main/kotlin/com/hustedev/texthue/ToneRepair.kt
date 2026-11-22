package com.hustedev.texthue

import kotlin.math.abs
import kotlin.math.ceil
import kotlin.math.floor

internal data class RepairedTone(val color: FittedColor, val score: Double, val fallback: String? = null)

internal fun repairTone(
    lightness: Double,
    chroma: Double,
    hue: Double,
    gamut: Gamut,
    target: Double,
    measure: (IntArray) -> Double,
): RepairedTone {
    fun evaluate(l: Double): RepairedTone {
        val color = ColorMath.fit(l, chroma, hue, gamut)
        return RepairedTone(color, measure(color.bytes))
    }

    val initial = evaluate(lightness)
    if (initial.score >= target) return initial

    val black = evaluate(0.0)
    val white = evaluate(1.0)
    if (maxOf(black.score, white.score) < target) {
        val best = if (black.score >= white.score) black else white
        return best.copy(fallback = "unattainable-contrast")
    }

    var best: RepairedTone? = null
    var bestDistance = Double.POSITIVE_INFINITY
    for (endpoint in listOf(black, white)) {
        if (endpoint.score < target) continue
        var candidate = endpoint
        var pass = (endpoint.color.lightness * 4096).toInt()
        var fail = if (pass == 0) ceil(lightness * 4096).toInt() else floor(lightness * 4096).toInt()
        while (abs(pass - fail) > 1) {
            val mid = (pass + fail) / 2
            val probe = evaluate(mid / 4096.0)
            if (probe.score >= target) {
                pass = mid
                candidate = probe
            } else {
                fail = mid
            }
        }
        val distance = abs(candidate.color.lightness - lightness)
        if (distance < bestDistance) {
            best = candidate
            bestDistance = distance
        }
    }
    return checkNotNull(best)
}
