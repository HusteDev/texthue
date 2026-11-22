package com.hustedev.texthue

import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.floor
import kotlin.math.pow
import kotlin.math.sin

internal enum class Gamut(val fromXyz: Array<DoubleArray>) {
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

internal object ColorMath {
    private val labToLms = arrayOf(
        doubleArrayOf(1.0, 0.3963377773761749, 0.2158037573099136),
        doubleArrayOf(1.0, -0.1055613458156586, -0.0638541728258133),
        doubleArrayOf(1.0, -0.0894841775298119, -1.2914855480194092),
    )
    private val lmsToXyz = arrayOf(
        doubleArrayOf(1.2268798758459243, -0.5578149944602171, 0.2813910456659647),
        doubleArrayOf(-0.0405757452148008, 1.112286803280317, -0.0717110580655164),
        doubleArrayOf(-0.0763729366746601, -0.4214933324022432, 1.5869240198367816),
    )

    private val rgbToXyz = arrayOf(
        doubleArrayOf(506752.0 / 1228815, 87881.0 / 245763, 12673.0 / 70218),
        doubleArrayOf(87098.0 / 409605, 175762.0 / 245763, 12673.0 / 175545),
        doubleArrayOf(7918.0 / 409605, 87881.0 / 737289, 1001167.0 / 1053270),
    )

    private val xyzToLms = arrayOf(
        doubleArrayOf(0.819022437996703, 0.3619062600528904, -0.1288737815209879),
        doubleArrayOf(0.0329836539323885, 0.9292868615863434, 0.0361446663506424),
        doubleArrayOf(0.0481771893596242, 0.2642395317527308, 0.6335478284694309),
    )

    private val lmsToLab = arrayOf(
        doubleArrayOf(0.210454268309314, 0.7936177747023054, -0.0040720430116193),
        doubleArrayOf(1.9779985324311684, -2.42859224204858, 0.450593709617411),
        doubleArrayOf(0.0259040424655478, 0.7827717124575296, -0.8086757549230774),
    )

    fun oklch(rgb: IntArray): Oklch {
        val linear = DoubleArray(3) { i ->
            val x = rgb[i] / 255.0
            if (x <= 0.04045) x / 12.92 else ((x + 0.055) / 1.055).pow(2.4)
        }
        val lms = multiply(xyzToLms, multiply(rgbToXyz, linear))
        for (i in lms.indices) lms[i] = Math.cbrt(lms[i])
        val (l, a, b) = multiply(lmsToLab, lms)
        if (rgb[0] == rgb[1] && rgb[1] == rgb[2]) return Oklch(round6(l), 0.0, 0.0)
        val hue = ((Math.atan2(b, a) * 180 / PI) % 360 + 360) % 360
        return Oklch(round6(l), round6(Math.sqrt(a * a + b * b)), round6(hue) % 360)
    }

    private fun multiply(matrix: Array<DoubleArray>, v: DoubleArray) = DoubleArray(3) { i ->
        val row = matrix[i]
        (row[0] * v[0] + row[1] * v[1]) + row[2] * v[2]
    }

    private fun linear(l: Double, c: Double, h: Double, gamut: Gamut): DoubleArray {
        val angle = h * PI / 180
        val lms = multiply(labToLms, doubleArrayOf(l, c * cos(angle), c * sin(angle)))
        for (i in lms.indices) lms[i] = lms[i] * lms[i] * lms[i]
        return multiply(gamut.fromXyz, multiply(lmsToXyz, lms))
    }

    private fun inside(channels: DoubleArray) = channels.all { it >= -1e-12 && it <= 1 + 1e-12 }

    private fun limit(l: Double, c: Double, h: Double, gamut: Gamut, steps: Int): Double {
        var low = 0.0
        var high = c
        repeat(steps) {
            val mid = (low + high) / 2
            if (inside(linear(l, mid, h, gamut))) low = mid else high = mid
        }
        return low
    }

    fun cusp(l: Double, h: Double, gamut: Gamut): Double =
        if (l == 0.0 || l == 1.0) 0.0 else limit(l, 0.4, h, gamut, 20)

    fun fit(l: Double, c: Double, h: Double, gamut: Gamut): FittedColor {
        if (l == 0.0 || l == 1.0) return FittedColor(IntArray(3) { (l * 255).toInt() }, 0.0, l)
        var retained = c
        var channels = linear(l, c, h, gamut)
        if (!inside(channels)) {
            retained = limit(l, c, h, gamut, 24)
            channels = linear(l, retained, h, gamut)
        }
        val bytes = IntArray(3) { i ->
            val x = channels[i].coerceIn(0.0, 1.0)
            val encoded = if (x <= 0.0031308) 12.92 * x else 1.055 * x.pow(1 / 2.4) - 0.055
            floor(encoded * 255 + 0.5).toInt()
        }
        return FittedColor(bytes, retained, l)
    }
}
