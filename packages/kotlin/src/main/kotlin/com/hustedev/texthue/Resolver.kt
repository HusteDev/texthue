package com.hustedev.texthue

import kotlin.math.abs
import kotlin.math.floor
import java.security.MessageDigest

data class ThemePalette(val colors: Map<String, String>) {
    fun color(role: String): Color = renderedColor(parseHex(colors.getValue(role)))
}
data class Palette(val hue: Double, val light: ThemePalette, val dark: ThemePalette, val source: String, val hueFraction: Double)

enum class Preset(internal val minScale: Double, internal val maxScale: Double, internal val target: Double = 4.5) {
    LABELS(0.6, 0.8),
    CONTROLS(0.6, 0.8, 7.0),
    CHART(0.8, 1.0),
    SUBDUED(0.2, 0.4),
    MONO(0.0, 0.0),
}

data class ContrastTargets(
    val fill: Double? = null,
    val fillHover: Double? = null,
    val fillActive: Double? = null,
    val border: Double? = null,
    val text: Double? = null,
    val textOnSubtle: Double? = null,
    val strong: Double? = null,
)

enum class ForegroundPolicy { BEST, FIRST_PASSING }

data class Backgrounds(val light: String = "#ffffff", val dark: String = "#121212")

private val paletteRoles = listOf(
    "background", "subtle", "muted", "fill", "onFill", "fillHover", "fillActive", "border", "text", "strong"
)

private val hexColor = Regex("#[0-9A-Fa-f]{6}")

internal fun parseHex(hex: String): IntArray {
    require(hexColor.matches(hex)) { "Expected a six-digit hex color" }
    return IntArray(3) { i -> hex.substring(1 + 2 * i, 3 + 2 * i).toInt(16) }
}

private class ThemeBackground(hex: String) {
    val bytes = parseHex(hex)
    val lightness = floor(ColorMath.oklch(bytes).l * 4096 + 0.5) / 4096
}

data class BrandColors(val light: String, val dark: String = light)

data class PaletteEntry(val id: String, val light: String? = null, val dark: String? = null)

private data class RankedEntry(val id: ByteArray, val colors: Pair<FixedTone, FixedTone>)

private class FixedTone(hex: String) {
    val bytes = parseHex(hex)
    private val coordinates = ColorMath.oklch(bytes)
    val hue = (floor(coordinates.h * 1024 + 0.5) / 1024) % 360
    val lightness = floor(coordinates.l * 4096 + 0.5) / 4096
    val neutral = coordinates.c == 0.0

    fun fraction(): Double {
        val angle = if (hue < anchors.first()) hue + 360 else hue
        val i = anchors.indexOfFirst { it > angle } - 1
        return (i + (angle - anchors[i]) / (anchors[i + 1] - anchors[i])) / 12
    }
}

class Resolver(
    namespace: String = "",
    private val seed: UInt = 0u,
    contrastTarget: Double? = null,
    private val normalization: Normalization = Normalization(),
    private val preset: Preset = Preset.LABELS,
    private val contrastModel: ContrastModel = ContrastModel.WCAG2,
    private val contrastTargets: ContrastTargets = ContrastTargets(),
    foregrounds: List<String> = listOf("#000000", "#ffffff"),
    private val foregroundPolicy: ForegroundPolicy = ForegroundPolicy.BEST,
    hueRange: HueArc = HueArc(0.0, 360.0),
    excludeHues: List<HueArc> = emptyList(),
    backgrounds: Backgrounds = Backgrounds(),
    private val profiles: Profiles = Profiles(),
    overrides: Map<String, BrandColors> = emptyMap(),
    palette: List<PaletteEntry>? = null,
) {
    private val apca = contrastModel == ContrastModel.APCA
    private val target = contrastTarget ?: if (apca) 60.0 else preset.target
    private val hueDomain = HueDomain(hueRange, excludeHues)
    private val scope = normalization.apply(namespace)

    private val fixedColors = buildMap {
        for ((name, colors) in overrides) {
            val key = normalization.apply(name)
            require(Charsets.UTF_8.newEncoder().canEncode(name)) { "Malformed override name" }
            require(!containsKey(key)) { "Duplicate normalized override" }
            put(key, FixedTone(colors.light) to FixedTone(colors.dark))
        }
    }

    private val candidates = foregrounds.map(::parseHex)
    private val lightBackground = ThemeBackground(backgrounds.light)
    private val darkBackground = ThemeBackground(backgrounds.dark)

    init {
        require(candidates.isNotEmpty()) { "At least one foreground is required" }
        val range = if (apca) 0.0..106.0 else 1.0..21.0
        with(contrastTargets) {
            require(listOfNotNull(target, fill, fillHover, fillActive, border, text, textOnSubtle, strong).all { it in range })
        }
    }

    private val rankedEntries = palette?.let { entries ->
        require(entries.isNotEmpty()) { "Empty palette" }
        val ids = mutableSetOf<String>()
        val compiled = entries.map { entry ->
            require(ids.add(entry.id) && Charsets.UTF_8.newEncoder().canEncode(entry.id)) { "Invalid palette ID" }
            val light = FixedTone(requireNotNull(entry.light ?: entry.dark))
            val dark = FixedTone(requireNotNull(entry.dark ?: entry.light))
            RankedEntry(entry.id.toByteArray(Charsets.UTF_8), light to dark)
        }
        val required = contrastTargets.fill ?: target
        fun passes(tone: FixedTone) = contrast(foreground(tone.bytes, required), tone.bytes) >= required
        compiled.filter { passes(it.colors.first) && passes(it.colors.second) }.ifEmpty { compiled }
    }.orEmpty()

    private fun contrast(a: IntArray, b: IntArray) = abs(Contrast.measure(a, b, contrastModel, Gamut.SRGB))
    private fun foreground(rgb: IntArray, required: Double): IntArray {
        var best = candidates.first()
        var bestScore = -1.0
        for (candidate in candidates) {
            val score = contrast(candidate, rgb)
            if (foregroundPolicy == ForegroundPolicy.FIRST_PASSING && score >= required) return candidate
            if (score > bestScore) {
                best = candidate
                bestScore = score
            }
        }
        return best
    }

    fun resolve(text: String): Palette = render(mapping(normalization.apply(text)))

    /** Preserve input order and reuse identical normalized identities within this call. */
    fun batch(texts: Iterable<String>): List<Palette> {
        val cache = mutableMapOf<String, Palette>()
        return texts.map { text ->
            val name = normalization.apply(text)
            cache.getOrPut(name) { render(mapping(name)) }
        }
    }

    private data class Mapping(val hue: Double, val uL: Double, val uC: Double, val fraction: Double,
                               val source: String, val fixed: Pair<FixedTone, FixedTone>? = null, val ring: Int = 0)

    private fun mapping(name: String, digest: ByteArray = Identity.digest(name, scope, seed)): Mapping {
        val (uH, uL, uC) = Identity.fractions(digest)
        val override = fixedColors[name]
        (override ?: rankedEntries.selectEntry(digest))?.let { pair ->
            return Mapping(pair.first.hue, 0.5, 0.5, pair.first.fraction(),
                if (override != null) "override" else "palette", pair)
        }
        return Mapping(hueDomain.mappedHue(uH), uL, uC, uH, "hash")
    }

    private fun render(mapped: Mapping): Palette {
        return Palette(mapped.hue, theme(false, mapped), theme(true, mapped), mapped.source, mapped.fraction)
    }

    fun assign(texts: Iterable<String>, pinned: Map<String, Placement> = emptyMap()): Assignment {
        val names = texts.map(normalization::apply).toSet()
        val placements = normalizePins(pinned, normalization::apply)
        val size = (names + placements.keys).size
        val separation = separationFor(size)
        val entries = names.map { it to Identity.digest(it, scope, seed) }
            .sortedWith { a, b -> digestOrder(a.second, b.second) }
        val mappings = entries.associate { (name, digest) -> name to mapping(name, digest) }
        for ((name, mapped) in mappings) {
            if (mapped.fixed != null) placements.putIfAbsent(name, Placement(mapped.fraction, 0, false))
        }
        val colors = mappings.mapValues { (name, mapped) ->
            val p = placements.getOrPut(name) { place(mapped.fraction, placements.values, separation) }
            val ring = (p.ring % ringOffsets.size).toInt()
            val selected = if (mapped.fixed != null) mapped.copy(ring = ring) else
                mapped.copy(hue = hueDomain.mappedHue(p.hueFraction), fraction = p.hueFraction,
                    source = "assigned", ring = ring)
            render(selected)
        }
        return Assignment(placements.toMap(), colors, assignmentReport(colors, size, separation))
    }

    fun hex(text: String, dark: Boolean = false, role: String = "fill"): String =
        theme(dark, mapping(normalization.apply(text)), role).colors.getValue(role)

    fun color(text: String, dark: Boolean = false, role: String = "fill"): Color =
        renderedColor(parseHex(hex(text, dark, role)))

    private fun theme(dark: Boolean, mapped: Mapping, selected: String? = null): ThemePalette {
        val fixed = if (dark) mapped.fixed?.second else mapped.fixed?.first
        val hue = fixed?.hue ?: mapped.hue
        val uL = mapped.uL
        val uC = mapped.uC
        val base = if (dark) darkBackground else lightBackground
        val background = base.bytes
        val direction = if (dark) 1 else -1
        val lb = base.lightness
        val profile = if (dark) profiles.dark else profiles.light
        val defaultScale = preset.minScale + (preset.maxScale - preset.minScale) * uC
        fun sample(low: Double, high: Double, role: Int): Double {
            val bias = biases[(if (dark) 2 else 0) + role]
            val segment = (hue / 30).toInt()
            val correction = bias[segment] + (bias[(segment + 1) % 12] - bias[segment]) * (hue / 30 - segment)
            return (low + (high - low) * uL + correction + ringOffsets[mapped.ring]).coerceIn(0.0, 1.0)
        }
        val fillRange = profile.fill.lightness ?: if (dark) UnitRange(0.4, 0.5) else UnitRange(0.72, 0.82)
        val fillL = fixed?.lightness ?: sample(fillRange.low, fillRange.high, 0)
        val textRange = profile.text.lightness ?: if (dark) UnitRange(0.72, 0.82) else UnitRange(0.43, 0.53)
        val textL = sample(textRange.low, textRange.high, 1)
        fun tone(l: Double, role: RoleProfile, defaultCap: Double, target: Double, backdrop: IntArray? = null, second: IntArray? = null, secondTarget: Double = target, surface: Boolean = false): IntArray {
            val lightness = l.coerceIn(0.0, 1.0)
            val scale = (role.chromaScale?.sample(uC) ?: defaultScale) * ringScale(mapped.ring)
            val cap = if (fixed?.neutral == true) 0.0 else role.chromaCap ?: defaultCap
            val chroma = minOf(cap, ColorMath.cusp(lightness, hue, Gamut.SRGB) * scale)
            val threshold = if (target == 0.0 && second != null) secondTarget else target
            return repairTone(lightness, chroma, hue, Gamut.SRGB, threshold) { rgb ->
                val primary = if (backdrop == null || surface) contrast(backdrop ?: foreground(rgb, target), rgb)
                    else contrast(rgb, backdrop)
                when {
                    second == null || secondTarget == 0.0 -> primary
                    target == 0.0 -> contrast(rgb, second)
                    else -> minOf(primary, contrast(rgb, second) * (target / secondTarget))
                }
            }.color.bytes
        }
        val unconstrained = if (apca) 0.0 else 1.0
        val borderTarget = contrastTargets.border ?: if (apca) target else minOf(3.0, target)
        val subtle by lazy(LazyThreadSafetyMode.NONE) { tone(lb + direction * 0.04, profile.fill, 0.16, unconstrained) }
        val fill by lazy(LazyThreadSafetyMode.NONE) {
            fixed?.bytes ?: tone(fillL, profile.fill, 0.16, contrastTargets.fill ?: target)
        }
        val onFill by lazy(LazyThreadSafetyMode.NONE) { foreground(fill, contrastTargets.fill ?: target) }
        fun bytes(role: String): IntArray = when (role) {
            "background" -> background
            "subtle" -> subtle
            "muted" -> tone(lb + direction * 0.10, profile.fill, 0.16, unconstrained)
            "fill" -> fill
            "onFill" -> onFill
            "fillHover" -> tone(fillL + direction * 0.025, profile.fill, 0.16,
                contrastTargets.fillHover ?: target, onFill, surface = true)
            "fillActive" -> tone(fillL + direction * 0.05, profile.fill, 0.16,
                contrastTargets.fillActive ?: target, onFill, surface = true)
            "border" -> tone(lb + direction * 0.39, profile.fill, 0.16, borderTarget, background)
            "text" -> tone(textL, profile.text, 0.19,
                contrastTargets.text ?: target, background, subtle, contrastTargets.textOnSubtle ?: target)
            "strong" -> tone(textL + direction * 0.10, profile.text, 0.19, contrastTargets.strong ?: target, background)
            else -> throw IllegalArgumentException("Unknown color role: $role")
        }
        val roles = selected?.let { listOf(it) } ?: paletteRoles
        val colors = roles.associateWith(::bytes)
        return ThemePalette(java.util.Collections.unmodifiableMap(colors.mapValues { (_, rgb) -> rgb.joinToString("", prefix = "#") { it.toString(16).padStart(2, '0') } }))
    }
}

private fun List<RankedEntry>.selectEntry(digest: ByteArray): Pair<FixedTone, FixedTone>? {
    if (isEmpty()) return null
    val hash = MessageDigest.getInstance("SHA-256")
    var best: ByteArray? = null
    var winner: RankedEntry? = null
    for (entry in this) {
        hash.update(digest)
        val rank = hash.digest(entry.id)
        if (best == null || digestOrder(rank, best) > 0) {
            best = rank
            winner = entry
        }
    }
    return winner?.colors
}
