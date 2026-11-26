package com.hustedev.texthue

import java.util.Base64
import kotlin.math.abs

private val roles = listOf(
    "background", "subtle", "muted", "fill", "onFill", "fillHover", "fillActive", "border", "text", "strong",
)

private fun decode(value: String) = Base64.getDecoder().decode(value).toString(Charsets.UTF_8)
private fun arc(value: String): HueArc {
    val (start, end) = value.split(',').map(String::toDouble)
    return HueArc(start, end)
}
private fun profile(value: String): RoleProfile {
    val (lightness, scale, cap) = value.split('|')
    fun range(raw: String): UnitRange? {
        if (raw.isEmpty()) return null
        val (low, high) = raw.split(',').map(String::toDouble)
        return UnitRange(low, high)
    }
    return RoleProfile(range(lightness), range(scale), cap.ifEmpty { null }?.toDouble())
}

private fun fixtureResolver(row: List<String>): Resolver {
    val normalization = Normalization(UnicodeForm.valueOf(row[4].uppercase()),
        TextCase.valueOf(row[5].uppercase()), Whitespace.valueOf(row[6].uppercase()))
    val values = row[9].split(',').map { it.ifEmpty { null }?.toDouble() }
    val targets = ContrastTargets(values[0], values[1], values[2], values[3], values[4], values[5], values[6])
    val overrides = row[20].split('|').filter { it.isNotEmpty() }.associate {
        val (key, light, dark) = it.split(',')
        decode(key) to BrandColors(light, dark)
    }
    val entries = row[21].takeIf { it.isNotEmpty() }?.split('|')?.map {
        val (id, light, dark) = it.split(',')
        PaletteEntry(decode(id), light.ifEmpty { null }, dark.ifEmpty { null })
    }
    return Resolver(decode(row[1]), row[2].toUInt(), row[3].ifEmpty { null }?.toDouble(),
        normalization, Preset.valueOf(row[7].uppercase()),
        ContrastModel.valueOf(row[8].uppercase()), targets, row[10].split(','),
        ForegroundPolicy.valueOf(row[11].replace('-', '_').uppercase()), arc(row[12]),
        row[13].split('|').filter { it.isNotEmpty() }.map(::arc), Backgrounds(row[14], row[15]),
        Profiles(ThemeProfiles(profile(row[16]), profile(row[17])),
            ThemeProfiles(profile(row[18]), profile(row[19]))), overrides, entries)
}

private fun checkFixture(line: String) {
    val row = line.split('\t')
    val resolver = fixtureResolver(row)
    val label = decode(row[0])
    val palette = resolver.resolve(label)
    for ((dark, theme) in listOf(false to palette.light, true to palette.dark)) {
        for (role in roles) {
            check(resolver.hex(label, dark, role) == theme.colors.getValue(role))
            check(resolver.color(label, dark, role).hex == theme.color(role).hex)
        }
    }
    check(palette.source == row[22])
    check(abs(palette.hueFraction - row[23].toDouble()) < 1e-12)
    check(abs(palette.hue - row[24].toDouble()) < 1e-12)
    val colors = listOf(palette.light, palette.dark).flatMap { theme -> roles.map { theme.colors.getValue(it) } }
    check(colors == row.subList(25, 45)) { "$line: $colors" }
    val pairs = listOf("fill","fillHover","fillActive","border","text","textOnSubtle","strong")
    val reports = listOf(palette.light, palette.dark).flatMap { theme -> pairs.map(theme.contrast::getValue) }
    check(row.size == 45 + reports.size)
    reports.forEachIndexed { index, report ->
        val fields = row[45 + index].split(',')
        check(abs(report.ratio - fields[0].toDouble()) < 1e-10)
        check(abs(report.value - fields[1].toDouble()) < 1e-10)
        val flags = listOf(report.model.name.lowercase(), report.meetsTarget, report.lightnessAdjusted,
            report.chromaCapped, report.chromaReduced, report.fallback.orEmpty()).map { it.toString() }
        check(flags == fields.drop(2)) { "$label ${pairs[index % pairs.size]}: $flags vs $fields" }
    }
}

private fun checkInvalidSettings() {
    val duplicate = PaletteEntry("duplicate", light = "#abcdef")
    for (invalid in listOf(emptyList(), listOf(duplicate, duplicate), listOf(PaletteEntry("missing")))) {
        check(runCatching { Resolver(palette = invalid) }.exceptionOrNull() is IllegalArgumentException)
    }
    check(runCatching { UnitRange(0.8, 0.1) }.exceptionOrNull() is IllegalArgumentException)
    check(runCatching { RoleProfile(chromaCap = Double.NaN) }.exceptionOrNull() is IllegalArgumentException)
    val badBackground = runCatching { Resolver(backgrounds = Backgrounds(light = "#ffff")) }
    check(badBackground.exceptionOrNull() is IllegalArgumentException)
    for (excluded in listOf(listOf(HueArc(0.0, 360.0)), List(17) { HueArc(0.0, 1.0) })) {
        check(runCatching { Resolver(excludeHues = excluded) }.exceptionOrNull() is IllegalArgumentException)
    }
    check(runCatching { Resolver(hueRange = HueArc(1.0, 1.0)) }.exceptionOrNull() is IllegalArgumentException)
    for (invalid in listOf(0.0, 22.0, Double.NaN, Double.POSITIVE_INFINITY)) {
        val badTarget = runCatching { Resolver(contrastTargets = ContrastTargets(textOnSubtle = invalid)) }
        check(badTarget.exceptionOrNull() is IllegalArgumentException)
    }
    for (invalid in listOf(emptyList(), listOf("#abc"), listOf("ffffff"), listOf("#ffggff"))) {
        check(runCatching { Resolver(foregrounds = invalid) }.exceptionOrNull() is IllegalArgumentException)
    }
    for (model in ContrastModel.entries) {
        val fixed = Resolver(contrastModel = model, overrides = mapOf("gray" to BrandColors("#777777")),
            foregrounds = listOf("#777777"))
        for (role in listOf("fill", "onFill")) {
            check(fixed.hex("gray", role = role) == "#777777")
            val failure = runCatching { fixed.hex("gray", role = role, strict = true) }.exceptionOrNull()
            check(failure is IllegalStateException)
        }
        check(fixed.hex("gray", role = "background", strict = true) == "#ffffff")
    }
}

private fun checkBatch() {
    val mutableCandidates = mutableListOf("#123456")
    val compiled = Resolver(foregrounds = mutableCandidates)
    mutableCandidates.clear()
    check(compiled.resolve("test").light.colors["onFill"] == "#123456")
    val names = listOf("é", "e\u0301", "", "é", "other")
    val exact = Resolver()
    val ordered = exact.batch(names)
    check(ordered == names.map(exact::resolve))
    check(ordered[0] != ordered[1])
    check(ordered[0] === ordered[3])
    val normalized = Resolver(normalization = Normalization(unicode = UnicodeForm.NFC))
    val aliases = normalized.batch(names)
    check(aliases == names.map(normalized::resolve))
    check(aliases[0] === aliases[1])
    check(normalized.batch(emptyList()).isEmpty())
    val attemptedMutation = runCatching { (aliases[0].light.colors as MutableMap)["fill"] = "#ffffff" }
    check(attemptedMutation.exceptionOrNull() is UnsupportedOperationException)
    check(runCatching { exact.batch(listOf("ok", "\uD800")) }.exceptionOrNull() is IllegalArgumentException)
}

fun main() {
    val count = generateSequence(::readlnOrNull).onEach(::checkFixture).count()
    check(count > 0)
    checkInvalidSettings()
    checkBatch()
    println("Passed $count two-theme resolver vectors and ordered batch checks")
}
