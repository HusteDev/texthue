package com.hustedev.texthue

import java.util.Base64
import kotlin.math.abs

private fun name(encoded: String) = Base64.getDecoder().decode(encoded).toString(Charsets.UTF_8)
private fun placement(fields: List<String>) =
    Placement(fields[2].toDouble(), fields[3].toLong(), fields[4].toBooleanStrict())

private fun verifyDarkFills(assigned: Assignment, expected: Map<String, String>) {
    if (expected.isNotEmpty()) check(assigned.colors.mapValues { it.value.dark.colors["fill"] } == expected)
}

fun main() {
    val input = System.`in`.bufferedReader()
    var cases = 0
    for (casing in generateSequence(input::readLine)) {
        val labels = mutableListOf<String>()
        val overrides = mutableMapOf<String, BrandColors>()
        val pins = mutableMapOf<String, Placement>()
        val placements = mutableMapOf<String, Placement>()
        val fills = mutableMapOf<String, String>()
        val darkFills = mutableMapOf<String, String>()
        val pairs = mutableListOf<Pair<String, String>>()
        while (true) {
            val fields = input.readLine().split('\t')
            when (fields[0]) {
                "label" -> labels.add(name(fields[1]))
                "override" -> overrides[name(fields[1])] = BrandColors(fields[2], fields[3])
                "pin" -> pins[name(fields[1])] = placement(fields)
                "placement" -> placements[name(fields[1])] = placement(fields)
                "fill" -> fills[name(fields[1])] = fields[2]
                "darkFill" -> darkFills[name(fields[1])] = fields[2]
                "pair" -> pairs.add(name(fields[1]) to name(fields[2]))
                "report" -> {
                    val resolver = Resolver(normalization = Normalization(casing = TextCase.valueOf(casing)),
                        overrides = overrides)
                    val assigned = resolver.assign(labels, pins)
                    check(assigned.assignments == placements)
                    check(assigned.colors.mapValues { it.value.light.colors["fill"] } == fills)
                    verifyDarkFills(assigned, darkFills)
                    check(assigned.report.closestPairs == pairs)
                    check(abs(assigned.report.minDistance!! - fields[1].toDouble()) < 1e-12)
                    check(assigned.report.withinRingCapacity == fields[2].toBooleanStrict())
                    check(assigned.report.distinctFills == fields[3].toBooleanStrict())
                    break
                }
                else -> error("Unknown assignment fixture record")
            }
        }
        cases++
    }
    check(cases > 0)
    println("Passed $cases shared collection assignment vectors")
}
