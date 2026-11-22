package com.hustedev.texthue

import kotlin.math.abs

data class ContrastRelationship(val ratio: Double, val model: ContrastModel, val value: Double,
    val meetsTarget: Boolean, val lightnessAdjusted: Boolean, val chromaCapped: Boolean,
    val chromaReduced: Boolean, val fallback: String?)

internal data class ToneAdjustment(val adjusted: Boolean, val capped: Boolean,
    val reduced: Boolean, val fallback: String?)

internal fun relationshipReport(colors: Map<String, IntArray>, adjustments: Map<String, ToneAdjustment>,
    model: ContrastModel, fixed: Boolean, target: (String) -> Double): Map<String, ContrastRelationship> = buildMap {
    for (role in listOf("fill", "fillHover", "fillActive", "text", "strong", "border")) {
        val flags = adjustments[role]
        for ((pair, front, back) in contrastPairs(role)) {
            val a = colors.getValue(front)
            val b = colors.getValue(back)
            val value = Contrast.measure(a, b, model, Gamut.SRGB)
            val ratio = if (model == ContrastModel.WCAG2) value
                else Contrast.measure(a, b, ContrastModel.WCAG2, Gamut.SRGB)
            val passes = abs(value) >= target(pair)
            val fallback = if (fixed && pair == "fill" && !passes) "palette-constraint" else flags?.fallback
            put(pair, ContrastRelationship(ratio, model, value, passes, flags?.adjusted == true,
                flags?.capped == true, flags?.reduced == true, fallback))
        }
    }
}
