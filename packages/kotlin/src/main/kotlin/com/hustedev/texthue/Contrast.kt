package com.hustedev.texthue

import kotlin.math.abs
import kotlin.math.pow

enum class ContrastModel { WCAG2, APCA }

internal object Contrast {
    private const val BLACK_THRESHOLD = 0.022
    private const val BLACK_CLAMP_EXPONENT = 1.414
    private const val WCAG_OFFSET = 0.05
    private const val MIN_LUMINANCE_DELTA = 0.0005
    private const val APCA_SCALE = 1.14
    private const val NORMAL_BACKGROUND_EXPONENT = 0.56
    private const val REVERSE_BACKGROUND_EXPONENT = 0.65
    private const val NORMAL_TEXT_EXPONENT = 0.57
    private const val REVERSE_TEXT_EXPONENT = 0.62
    private const val LOW_CLIP = 0.1
    private const val LOW_OFFSET = 0.027

    @Suppress("MagicNumber") // Luminance coefficients in the WCAG/APCA reference model.
    private val srgbRatio = doubleArrayOf(0.2126, 0.7152, 0.0722)
    @Suppress("MagicNumber") // Luminance coefficients in the WCAG/APCA reference model.
    private val p3Ratio = doubleArrayOf(35783.0/156275, 247089.0/357200, 198249.0/2500400)
    @Suppress("MagicNumber") // Luminance coefficients in the WCAG/APCA reference model.
    private val srgbApca = doubleArrayOf(0.2126729, 0.7151522, 0.0721750)
    @Suppress("MagicNumber") // Luminance coefficients in the WCAG/APCA reference model.
    private val p3Apca = doubleArrayOf(0.2289829594805780, 0.6917492625852380, 0.0792677779341829)

    private inline fun luminance(weights: DoubleArray, model: ContrastModel, channel: (Int) -> Double): Double {
        var sum = 0.0
        for (i in weights.indices) {
            val encodedByte = channel(i)
            val linear = if (model == ContrastModel.APCA) {
                (encodedByte / BYTE_MAX).pow(ColorMath.GAMMA)
            } else {
                ColorMath.linearChannel(encodedByte)
            }
            sum += weights[i] * linear
        }
        return if (model == ContrastModel.APCA && sum < BLACK_THRESHOLD) {
            sum + (BLACK_THRESHOLD - sum).pow(BLACK_CLAMP_EXPONENT)
        } else sum
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
        if (model == ContrastModel.WCAG2) return (maxOf(fg, bg) + WCAG_OFFSET) / (minOf(fg, bg) + WCAG_OFFSET)
        return apcaContrast(fg, bg)
    }

    private fun apcaContrast(fg: Double, bg: Double): Double {
        if (abs(fg - bg) < MIN_LUMINANCE_DELTA) return 0.0
        val darkText = bg > fg
        val bgExponent = if (darkText) NORMAL_BACKGROUND_EXPONENT else REVERSE_BACKGROUND_EXPONENT
        val fgExponent = if (darkText) NORMAL_TEXT_EXPONENT else REVERSE_TEXT_EXPONENT
        val raw = APCA_SCALE * (bg.pow(bgExponent) - fg.pow(fgExponent))
        return if (abs(raw) < LOW_CLIP) 0.0 else PERCENT * (raw - if (darkText) LOW_OFFSET else -LOW_OFFSET)
    }
}
