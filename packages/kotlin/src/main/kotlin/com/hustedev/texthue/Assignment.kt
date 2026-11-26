package com.hustedev.texthue

import kotlin.math.abs
import kotlin.math.floor
import kotlin.math.sqrt

data class Placement(val hueFraction: Double, val ring: Long, val moved: Boolean)
data class AssignmentReport(val minDistance: Double?, val closestPairs: List<Pair<String, String>>,
                            val withinRingCapacity: Boolean, val distinctFills: Boolean)
data class Assignment(val assignments: Map<String, Placement>, val colors: Map<String, Palette>,
                      val report: AssignmentReport)

private const val LIGHTNESS_STEP = 0.08
private const val WIDE_STEP = 0.16
internal const val FULL_TURN = 360.0
internal val ringOffsets = listOf(0.0, LIGHTNESS_STEP, -LIGHTNESS_STEP, WIDE_STEP, -WIDE_STEP)
private const val MUTED_RING = 3
private const val MUTED_SCALE = 0.6
private const val MAX_SAFE_RING = 9007199254740991L
private const val SMALL_COLLECTION_LIMIT = 8
private const val MIN_SLOTS = 12
private const val MAX_SLOTS = 24
private const val CANDIDATES = 385
private const val STEP_DIVISOR = 4
internal fun ringScale(ring: Int) = if (ring < MUTED_RING) 1.0 else MUTED_SCALE
internal fun separationFor(size: Int) = (1.0 / size).coerceIn(1.0 / MAX_SLOTS, 1.0 / MIN_SLOTS)

internal fun digestOrder(a: ByteArray, b: ByteArray): Int {
    for (i in a.indices) {
        val order = a[i].toUByte().compareTo(b[i].toUByte())
        if (order != 0) return order
    }
    return 0
}

internal fun normalizePins(pinned: Map<String, Placement>, normalize: (String) -> String
): MutableMap<String, Placement> {
    val result = mutableMapOf<String, Placement>()
    for ((label, p) in pinned) {
        requireOption(p.hueFraction >= 0 && p.hueFraction < 1 && p.ring in 0..MAX_SAFE_RING)
        requireOption(result.put(normalize(label), p) == null) { "Duplicate normalized pin" }
    }
    return result
}

internal fun place(natural: Double, occupied: Collection<Placement>, separation: Double, size: Int): Placement {
    if (size <= SMALL_COLLECTION_LIMIT && occupied.isNotEmpty()) {
        var best = -1.0
        var chosen = natural
        for (step in 0 until MAX_SLOTS) {
            val hue = (natural + step.toDouble() / MAX_SLOTS) % 1.0
            val distance = occupied.minOf { previous ->
                val delta = abs(previous.hueFraction - hue)
                minOf(delta, 1.0 - delta)
            }
            if (distance > best) {
                best = distance
                chosen = hue
            }
        }
        return Placement(chosen, 0, chosen != natural)
    }
    var ring = 0L
    while (true) {
        val neighbors = occupied.filter { it.ring == ring }
        for (i in 0 until CANDIDATES) {
            val step = ((i + 1) / 2) * (if (i % 2 == 0) 1 else -1)
            val raw = natural + step * (separation / STEP_DIVISOR)
            val fraction = raw - floor(raw)
            if (neighbors.all { val d = abs(it.hueFraction - fraction); minOf(d, 1.0 - d) >= separation }) {
                return Placement(fraction, ring, i != 0 || ring != 0L)
            }
        }
        ring++
    }
}

internal fun assignmentReport(colors: Map<String, Palette>, size: Int, separation: Double): AssignmentReport {
    val fills = colors.mapValues { it.value.light.colors.getValue("fill") }
    val points = fills.map { (name, hex) -> name to ColorMath.oklab(parseHex(hex)) }
    var minimum: Double? = null
    val pairs = mutableListOf<Pair<String, String>>()
    for (i in points.indices) {
        val (first, a) = points[i]
        for (j in i + 1 until points.size) {
            val (second, b) = points[j]
            val distance = sqrt(a.indices.sumOf { k -> val delta = a[k] - b[k]; delta * delta })
            if (minimum == null || distance < minimum) {
                minimum = distance
                pairs.clear()
            }
            if (distance == minimum) pairs.add(first to second)
        }
    }
    return AssignmentReport(minimum, pairs, size <= ringOffsets.size * floor(1 / separation),
        fills.values.toSet().size == colors.size)
}

internal fun HueDomain.mappedHue(fraction: Double): Double {
    val position = fraction * (anchors.size - 1)
    val slot = position.toInt()
    val naturalHue = (anchors[slot] + (anchors[slot + 1] - anchors[slot]) * (position - slot)) % FULL_TURN
    return map(naturalHue)
}
