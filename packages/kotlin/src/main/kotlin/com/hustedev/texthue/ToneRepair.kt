package com.hustedev.texthue

import kotlin.math.abs
import kotlin.math.ceil
import kotlin.math.floor

private const val LIGHTNESS_GRID = 4096

internal data class RepairedTone(val color: FittedColor, val score: Double, val fallback: String? = null)

private const val MAX_REPAIR_STEPS = 64

internal fun repairTone(
    requested: Oklch,
    gamut: Gamut,
    target: Double,
    measure: (IntArray) -> Double,
): RepairedTone {
    fun evaluate(l: Double): RepairedTone {
        val color = ColorMath.fit(l, requested.c, requested.h, gamut)
        return RepairedTone(color, measure(color.bytes))
    }

    val lightness = requested.l
    val initial = evaluate(lightness)
    if (initial.score >= target) return initial

    val black = evaluate(0.0)
    val white = evaluate(1.0)
    return if (maxOf(black.score, white.score) < target) {
        val best = if (black.score >= white.score) black else white
        best.copy(fallback = "unattainable-contrast")
    } else {
        closestPassingTone(initial, listOf(black, white), target, measure, ::evaluate)
    }
}

private fun closestPassingTone(
    initial: RepairedTone, endpoints: List<RepairedTone>, target: Double,
    measure: (IntArray) -> Double, evaluate: (Double) -> RepairedTone,
): RepairedTone {
    var best: RepairedTone? = null
    var step = 0
    var bestDistance = Double.POSITIVE_INFINITY
    for (endpoint in endpoints) {
        if (endpoint.score < target) continue
        var candidate = endpoint
        var pass = (endpoint.color.lightness * LIGHTNESS_GRID).toInt()
        val start = initial.color.lightness * LIGHTNESS_GRID
        var fail = (if (pass == 0) ceil(start) else floor(start)).toInt()
        while (abs(pass - fail) > 1) {
            val mid = (pass + fail) / 2
            val probe = evaluate(mid / LIGHTNESS_GRID.toDouble())
            if (probe.score >= target) {
                pass = mid
                candidate = probe
            } else {
                fail = mid
            }
        }
        val distance = abs(candidate.color.lightness - initial.color.lightness)
        if (distance < bestDistance) {
            best = candidate
            bestDistance = distance
            step = if (endpoint.color.lightness == 0.0) -1 else 1
        }
    }
    return recheckTone(checkNotNull(best), step, target, measure, evaluate)
}

private fun recheckTone(
    selected: RepairedTone,
    step: Int,
    target: Double,
    measure: (IntArray) -> Double,
    evaluate: (Double) -> RepairedTone,
): RepairedTone {
    var result = selected.copy(score = measure(selected.color.bytes))
    var grid = (result.color.lightness * LIGHTNESS_GRID).toInt()
    var remaining = MAX_REPAIR_STEPS
    while (remaining > 0 && result.score < target) {
        grid += step
        if (grid !in 0..LIGHTNESS_GRID) break
        result = evaluate(grid / LIGHTNESS_GRID.toDouble())
        remaining--
    }
    check(result.score >= target) { "Contrast repair lost its passing candidate" }
    return result
}
