package com.hustedev.texthue

import java.util.Base64
import kotlin.math.abs

fun main() {
    val roles = listOf("background","subtle","muted","fill","onFill","fillHover","fillActive","border","text","strong")
    fun decode(value: String) = Base64.getDecoder().decode(value).toString(Charsets.UTF_8)
    fun arc(value: String): HueArc {
        val (start, end) = value.split(',').map(String::toDouble)
        return HueArc(start, end)
    }
    fun profile(value: String): RoleProfile {
        val (lightness, scale, cap) = value.split('|')
        fun range(raw: String): UnitRange? {
            if (raw.isEmpty()) return null
            val (low, high) = raw.split(',').map(String::toDouble)
            return UnitRange(low, high)
        }
        return RoleProfile(range(lightness), range(scale), cap.ifEmpty { null }?.toDouble())
    }
    val count = generateSequence(::readlnOrNull).map { line ->
        val row = line.split('\t')
        val normalization = Normalization(UnicodeForm.valueOf(row[4].uppercase()),
            TextCase.valueOf(row[5].uppercase()), Whitespace.valueOf(row[6].uppercase()))
        val values = row[9].split(',').map { it.ifEmpty { null }?.toDouble() }
        val targets = ContrastTargets(values[0], values[1], values[2], values[3], values[4], values[5], values[6])
        val palette = Resolver(decode(row[1]), row[2].toUInt(), row[3].ifEmpty { null }?.toDouble(), normalization, Preset.valueOf(row[7].uppercase()),
            ContrastModel.valueOf(row[8].uppercase()), targets, row[10].split(','),
            ForegroundPolicy.valueOf(row[11].replace('-', '_').uppercase()), arc(row[12]),
            row[13].split('|').filter { it.isNotEmpty() }.map(::arc), Backgrounds(row[14], row[15]),
            Profiles(ThemeProfiles(profile(row[16]), profile(row[17])), ThemeProfiles(profile(row[18]), profile(row[19])))).resolve(decode(row[0]))
        check(abs(palette.hue - row[20].toDouble()) < 1e-12)
        val colors = listOf(palette.light, palette.dark).flatMap { theme -> roles.map { theme.colors.getValue(it) } }
        check(colors == row.drop(21)) { "$line: $colors" }
    }.count()
    check(count > 0)
    check(runCatching { UnitRange(0.8, 0.1) }.exceptionOrNull() is IllegalArgumentException)
    check(runCatching { RoleProfile(chromaCap = Double.NaN) }.exceptionOrNull() is IllegalArgumentException)
    check(runCatching { Resolver(backgrounds = Backgrounds(light = "#ffff")) }.exceptionOrNull() is IllegalArgumentException)
    for (excluded in listOf(listOf(HueArc(0.0, 360.0)), List(17) { HueArc(0.0, 1.0) })) {
        check(runCatching { Resolver(excludeHues = excluded) }.exceptionOrNull() is IllegalArgumentException)
    }
    check(runCatching { Resolver(hueRange = HueArc(1.0, 1.0)) }.exceptionOrNull() is IllegalArgumentException)
    for (invalid in listOf(0.0, 22.0, Double.NaN, Double.POSITIVE_INFINITY)) {
        check(runCatching { Resolver(contrastTargets = ContrastTargets(textOnSubtle = invalid)) }.exceptionOrNull() is IllegalArgumentException)
    }
    for (invalid in listOf(emptyList(), listOf("#abc"), listOf("ffffff"), listOf("#ffggff"))) {
        check(runCatching { Resolver(foregrounds = invalid) }.exceptionOrNull() is IllegalArgumentException)
    }
    val mutableCandidates = mutableListOf("#123456")
    val compiled = Resolver(foregrounds = mutableCandidates)
    mutableCandidates.clear()
    check(compiled.resolve("test").light.colors["onFill"] == "#123456")
    println("Passed $count two-theme resolver vectors")
}
