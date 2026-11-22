package com.hustedev.texthue

import kotlin.math.abs
import kotlin.math.pow

enum class ContrastModel { WCAG2, APCA }

internal object Contrast {
    private val srgbRatio = doubleArrayOf(0.2126, 0.7152, 0.0722)
    private val p3Ratio = doubleArrayOf(35783.0/156275, 247089.0/357200, 198249.0/2500400)
    private val srgbApca = doubleArrayOf(0.2126729, 0.7151522, 0.0721750)
    private val p3Apca = doubleArrayOf(0.2289829594805780, 0.6917492625852380, 0.0792677779341829)

    private inline fun luminance(weights: DoubleArray, model: ContrastModel, channel: (Int) -> Double): Double {
        var sum = 0.0
        for (i in weights.indices) {
            val x = channel(i) / 255.0
            val linear = when {
                model == ContrastModel.APCA -> x.pow(2.4)
                x <= 0.04045 -> x / 12.92
                else -> ((x + 0.055) / 1.055).pow(2.4)
            }
            sum += weights[i] * linear
        }
        return if (model == ContrastModel.APCA && sum < 0.022) sum + (0.022 - sum).pow(1.414) else sum
    }

    fun measure(text: IntArray, background: IntArray, model: ContrastModel, gamut: Gamut): Double =
        measure(model, gamut, { text[it].toDouble() }, { background[it].toDouble() })

    fun measure(text: DoubleArray, background: DoubleArray, model: ContrastModel, gamut: Gamut): Double =
        measure(model, gamut, { text[it] }, { background[it] })

    private inline fun measure(model: ContrastModel, gamut: Gamut, text: (Int) -> Double,
                               background: (Int) -> Double): Double {
        val weights = when (model) {
            ContrastModel.WCAG2 -> if (gamut == Gamut.SRGB) srgbRatio else p3Ratio
            ContrastModel.APCA -> if (gamut == Gamut.SRGB) srgbApca else p3Apca
        }
        val fg = luminance(weights, model, text)
        val bg = luminance(weights, model, background)
        if (model == ContrastModel.WCAG2) return (maxOf(fg, bg) + 0.05) / (minOf(fg, bg) + 0.05)
        return apcaContrast(fg, bg)
    }

    private fun apcaContrast(fg: Double, bg: Double): Double {
        if (abs(fg - bg) < 0.0005) return 0.0
        val darkText = bg > fg
        val raw = 1.14 * (bg.pow(if (darkText) 0.56 else 0.65) - fg.pow(if (darkText) 0.57 else 0.62))
        return if (abs(raw) < 0.1) 0.0 else 100 * (raw - if (darkText) 0.027 else -0.027)
    }
}
