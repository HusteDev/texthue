package com.hustedev.texthue

import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.floor
import kotlin.math.pow
import kotlin.math.sin

// These two matrices are the rational XYZ-to-RGB coefficients from CSS Color 4.
@Suppress("MagicNumber")
enum class Gamut(internal val fromXyz: Array<DoubleArray>) {
    SRGB(arrayOf(
        doubleArrayOf(12831.0/3959, -329.0/214, -1974.0/3959),
        doubleArrayOf(-851781.0/878810, 1648619.0/878810, 36519.0/878810),
        doubleArrayOf(705.0/12673, -2585.0/12673, 705.0/667),
    )),
    DISPLAY_P3(arrayOf(
        doubleArrayOf(446124.0/178915, -333277.0/357830, -72051.0/178915),
        doubleArrayOf(-14852.0/17905, 63121.0/35810, 423.0/17905),
        doubleArrayOf(11844.0/330415, -50337.0/660830, 316169.0/330415),
    )),
}

internal data class FittedColor(val bytes: IntArray, val chroma: Double, val lightness: Double)

@Suppress("TooManyFunctions") // Shared color-space conversion operations.
internal object ColorMath {
    private const val HALF_TURN = 180.0
    private const val GAMUT_TOLERANCE = 1e-12
    private const val CUSP_ITERATIONS = 20
    private const val FIT_ITERATIONS = 24
    private const val ENCODED_BREAKPOINT = 0.04045
    private const val LINEAR_BREAKPOINT = 0.0031308
    private const val LINEAR_SLOPE = 12.92
    private const val TRANSFER_OFFSET = 0.055
    private const val TRANSFER_SCALE = 1.055
    internal const val GAMMA = 2.4

    @Suppress("MagicNumber") // Published color-space matrix coefficients.
    private val labToLms = arrayOf(
        doubleArrayOf(1.0, 0.3963377773761749, 0.2158037573099136),
        doubleArrayOf(1.0, -0.1055613458156586, -0.0638541728258133),
        doubleArrayOf(1.0, -0.0894841775298119, -1.2914855480194092),
    )
    @Suppress("MagicNumber") // Published color-space matrix coefficients.
    private val lmsToXyz = arrayOf(
        doubleArrayOf(1.2268798758459243, -0.5578149944602171, 0.2813910456659647),
        doubleArrayOf(-0.0405757452148008, 1.112286803280317, -0.0717110580655164),
        doubleArrayOf(-0.0763729366746601, -0.4214933324022432, 1.5869240198367816),
    )

    @Suppress("MagicNumber") // Published color-space matrix coefficients.
    private val rgbToXyz = arrayOf(
        doubleArrayOf(506752.0 / 1228815, 87881.0 / 245763, 12673.0 / 70218),
        doubleArrayOf(87098.0 / 409605, 175762.0 / 245763, 12673.0 / 175545),
        doubleArrayOf(7918.0 / 409605, 87881.0 / 737289, 1001167.0 / 1053270),
    )

    @Suppress("MagicNumber") // Exact rational coefficients of the Display-P3 conversion matrix.
    private val p3ToXyz = arrayOf(
        doubleArrayOf(608311.0 / 1250200, 189793.0 / 714400, 198249.0 / 1000160),
        doubleArrayOf(35783.0 / 156275, 247089.0 / 357200, 198249.0 / 2500400),
        doubleArrayOf(0.0, 32229.0 / 714400, 5220557.0 / 5000800),
    )

    @Suppress("MagicNumber") // Published color-space matrix coefficients.
    private val xyzToLms = arrayOf(
        doubleArrayOf(0.819022437996703, 0.3619062600528904, -0.1288737815209879),
        doubleArrayOf(0.0329836539323885, 0.9292868615863434, 0.0361446663506424),
        doubleArrayOf(0.0481771893596242, 0.2642395317527308, 0.6335478284694309),
    )

    @Suppress("MagicNumber") // Published color-space matrix coefficients.
    private val lmsToLab = arrayOf(
        doubleArrayOf(0.210454268309314, 0.7936177747023054, -0.0040720430116193),
        doubleArrayOf(1.9779985324311684, -2.42859224204858, 0.450593709617411),
        doubleArrayOf(0.0259040424655478, 0.7827717124575296, -0.8086757549230774),
    )

    fun linearChannel(byte: Int): Double = linearChannel(byte.toDouble())

    fun linearChannel(byte: Double): Double {
        val x = byte / BYTE_MAX
        return if (x <= ENCODED_BREAKPOINT) x / LINEAR_SLOPE else ((x + TRANSFER_OFFSET) / TRANSFER_SCALE).pow(GAMMA)
    }

    private fun encodedChannel(linear: Double): Double {
        val x = linear.coerceIn(0.0, 1.0)
        return if (x <= LINEAR_BREAKPOINT) LINEAR_SLOPE * x else TRANSFER_SCALE * x.pow(1 / GAMMA) - TRANSFER_OFFSET
    }

    fun channelByte(linear: Double): Int = floor(encodedChannel(linear) * BYTE_MAX + ROUND_HALF).toInt()

    // Supplied sRGB colors retain fractional encoded channels for P3 contrast.
    fun srgbToP3(rgb: IntArray): DoubleArray {
        val linear = DoubleArray(RGB_CHANNELS) { linearChannel(rgb[it]) }
        val p3 = multiply(Gamut.DISPLAY_P3.fromXyz, multiply(rgbToXyz, linear))
        return DoubleArray(RGB_CHANNELS) { encodedChannel(p3[it]) * BYTE_MAX }
    }

    fun p3Fallback(rgb: DoubleArray): Pair<IntArray, Boolean> {
        val linear = DoubleArray(RGB_CHANNELS) { linearChannel(rgb[it]) }
        val srgb = multiply(Gamut.SRGB.fromXyz, multiply(p3ToXyz, linear))
        return IntArray(RGB_CHANNELS) { channelByte(srgb[it]) } to !inside(srgb)
    }

    fun oklab(rgb: IntArray): DoubleArray = oklab(rgb.encoded(), Gamut.SRGB)

    private fun oklab(rgb: DoubleArray, gamut: Gamut): DoubleArray {
        val linear = DoubleArray(RGB_CHANNELS) { i -> linearChannel(rgb[i]) }
        val matrix = if (gamut == Gamut.DISPLAY_P3) p3ToXyz else rgbToXyz
        val lms = multiply(xyzToLms, multiply(matrix, linear))
        for (i in lms.indices) lms[i] = Math.cbrt(lms[i])
        return multiply(lmsToLab, lms)
    }

    fun oklch(rgb: IntArray): Oklch = oklch(rgb.encoded(), Gamut.SRGB)

    fun oklch(rgb: DoubleArray, gamut: Gamut): Oklch {
        val (l, a, b) = oklab(rgb, gamut)
        if (rgb[0] == rgb[1] && rgb[1] == rgb[2]) return Oklch(round6(l), 0.0, 0.0)
        val hue = ((Math.atan2(b, a) * HALF_TURN / PI) % FULL_TURN + FULL_TURN) % FULL_TURN
        return Oklch(round6(l), round6(Math.sqrt(a * a + b * b)), round6(hue) % FULL_TURN)
    }

    private fun multiply(matrix: Array<DoubleArray>, v: DoubleArray) = DoubleArray(RGB_CHANNELS) { i ->
        val row = matrix[i]
        (row[0] * v[0] + row[1] * v[1]) + row[2] * v[2]
    }

    private fun linear(l: Double, c: Double, h: Double, gamut: Gamut): DoubleArray {
        val angle = h * PI / HALF_TURN
        val lms = multiply(labToLms, doubleArrayOf(l, c * cos(angle), c * sin(angle)))
        for (i in lms.indices) lms[i] = lms[i] * lms[i] * lms[i]
        return multiply(gamut.fromXyz, multiply(lmsToXyz, lms))
    }

    private fun inside(channels: DoubleArray) = channels.all { it >= -GAMUT_TOLERANCE && it <= 1 + GAMUT_TOLERANCE }

    private fun limit(l: Double, c: Double, h: Double, gamut: Gamut, steps: Int): Double {
        var low = 0.0
        var high = c
        repeat(steps) {
            val mid = (low + high) / 2
            if (inside(linear(l, mid, h, gamut))) low = mid else high = mid
        }
        return low
    }

    fun cusp(l: Double, h: Double, gamut: Gamut): Double {
        countCusp()
        return if (l == 0.0 || l == 1.0) 0.0 else limit(l, MAX_CHROMA, h, gamut, CUSP_ITERATIONS)
    }

    fun fit(l: Double, c: Double, h: Double, gamut: Gamut): FittedColor {
        countFit()
        if (l == 0.0 || l == 1.0) return FittedColor(IntArray(RGB_CHANNELS) { (l * BYTE_MAX).toInt() }, 0.0, l)
        var retained = c
        var channels = linear(l, c, h, gamut)
        if (!inside(channels)) {
            retained = limit(l, c, h, gamut, FIT_ITERATIONS)
            channels = linear(l, retained, h, gamut)
        }
        val bytes = IntArray(RGB_CHANNELS) { i -> channelByte(channels[i]) }
        return FittedColor(bytes, retained, l)
    }
}

internal fun IntArray.encoded() = DoubleArray(size) { this[it].toDouble() }
