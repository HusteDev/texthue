package com.hustedev.texthue

import kotlin.math.abs
import kotlin.math.ceil
import kotlin.math.floor

internal data class RepairedTone(val color: FittedColor, val score: Double, val fallback: String? = null)

private const val MAX_REPAIR_STEPS = 64

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
    var step = 0
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
            step = if (endpoint.color.lightness == 0.0) -1 else 1
        }
    }
    return recheckTone(checkNotNull(best), step, target, measure, ::evaluate)
}

private fun recheckTone(
    selected: RepairedTone,
    step: Int,
    target: Double,
    measure: (IntArray) -> Double,
    evaluate: (Double) -> RepairedTone,
): RepairedTone {
    var result = selected.copy(score = measure(selected.color.bytes))
    var grid = (result.color.lightness * 4096).toInt()
    var remaining = MAX_REPAIR_STEPS
    while (remaining > 0 && result.score < target) {
        grid += step
        if (grid !in 0..4096) break
        result = evaluate(grid / 4096.0)
        remaining--
    }
    check(result.score >= target) { "Contrast repair lost its passing candidate" }
    return result
}
