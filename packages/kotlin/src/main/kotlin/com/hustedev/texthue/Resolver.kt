package com.hustedev.texthue

import kotlin.math.abs
import kotlin.math.roundToInt
import kotlin.math.floor
import java.security.MessageDigest

data class ThemePalette(val colors: Map<String, String>, val contrast: Map<String, ContrastRelationship> = emptyMap(),
    private val renditions: Map<String, Color> = emptyMap()) {
    fun color(role: String): Color = renditions[role] ?: colors[role]?.let { renderedColor(parseHex(it)) }
        ?: throw TextColorException("INVALID_OPTIONS", "Unknown color role: $role")
}
data class Palette(
    val hue: Double, val light: ThemePalette, val dark: ThemePalette, val source: String, val hueFraction: Double,
)

// The five preset definitions are numerical constants from the resolver specification.
@Suppress("MagicNumber")
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

private const val HEX_CHANNEL_WIDTH = 2
private const val HUE_SNAP_STEPS = 1024
private const val APCA_TARGET = 60.0
private const val APCA_LIMIT = 106.0
private const val WCAG_LIMIT = 21.0
private const val BIAS_SECTOR = 30
private const val FILL_CAP = 0.16
private const val TEXT_CAP = 0.19
private const val SUBTLE_OFFSET = 0.04
private const val MUTED_OFFSET = 0.10
private const val HOVER_OFFSET = 0.025
private const val ACTIVE_OFFSET = 0.05
private const val BORDER_OFFSET = 0.39
private const val STRONG_OFFSET = 0.10
private const val FIXED_PROFILE_MIDPOINT = 0.5
// These three intervals are the default role profiles in the resolver specification.
@Suppress("MagicNumber")
private val lightFillRange = UnitRange(0.72, 0.82)
@Suppress("MagicNumber")
private val darkFillRange = UnitRange(0.4, 0.5)
@Suppress("MagicNumber")
private val lightTextRange = UnitRange(0.43, 0.53)

private val hexColor = Regex("#[0-9A-Fa-f]{6}")

internal fun parseHex(hex: String): IntArray {
    requireOption(hexColor.matches(hex)) { "Expected a six-digit hex color" }
    return IntArray(RGB_CHANNELS) { i ->
        val start = 1 + HEX_CHANNEL_WIDTH * i
        hex.substring(start, start + HEX_CHANNEL_WIDTH).toInt(HEX_RADIX)
    }
}

private class ThemeBackground(hex: String) {
    val bytes = parseHex(hex)
    val lightness = snapLightness(ColorMath.oklch(bytes).l)
}

data class BrandColors(val light: String, val dark: String = light)

data class PaletteEntry(val id: String, val light: String? = null, val dark: String? = null)

private data class RankedEntry(val id: ByteArray, val colors: Pair<FixedTone, FixedTone>)

private class FixedTone(hex: String) {
    val bytes = parseHex(hex)
    private val coordinates = ColorMath.oklch(bytes)
    val hue = (floor(coordinates.h * HUE_SNAP_STEPS + ROUND_HALF) / HUE_SNAP_STEPS) % FULL_TURN
    val lightness = snapLightness(coordinates.l)
    val neutral = coordinates.c == 0.0

    fun fraction(): Double {
        val angle = if (hue < anchors.first()) hue + FULL_TURN else hue
        val i = anchors.indexOfFirst { it > angle } - 1
        return (i + (angle - anchors[i]) / (anchors[i + 1] - anchors[i])) / anchors.lastIndex
    }
}

private const val LIGHTNESS_STEPS = 4096.0
private fun snapLightness(value: Double) = (value * LIGHTNESS_STEPS).roundToInt() / LIGHTNESS_STEPS

// The named arguments form the public configuration API.
@Suppress("LongParameterList", "TooManyFunctions")
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
    hueRange: HueArc = HueArc(0.0, FULL_TURN),
    excludeHues: List<HueArc> = emptyList(),
    backgrounds: Backgrounds = Backgrounds(),
    private val profiles: Profiles = Profiles(),
    overrides: Map<String, BrandColors> = emptyMap(),
    palette: List<PaletteEntry>? = null,
    private val gamut: Gamut = Gamut.SRGB,
) {
    private val apca = contrastModel == ContrastModel.APCA
    val target = contrastTarget ?: if (apca) APCA_TARGET else preset.target
    private val hueDomain = HueDomain(hueRange, excludeHues)
    private val scope = normalization.apply(namespace)

    private val fixedColors = buildMap {
        for ((name, colors) in overrides) {
            val key = normalization.apply(name)
            requireOption(Charsets.UTF_8.newEncoder().canEncode(name)) { "Malformed override name" }
            requireOption(!containsKey(key)) { "Duplicate normalized override" }
            put(key, FixedTone(colors.light) to FixedTone(colors.dark))
        }
    }

    private fun canonical(rgb: IntArray) = if (gamut == Gamut.DISPLAY_P3) ColorMath.srgbToP3(rgb) else rgb.encoded()
    private val candidates = foregrounds.map { canonical(parseHex(it)) }
    private val lightBackground = ThemeBackground(backgrounds.light)
    private val darkBackground = ThemeBackground(backgrounds.dark)

    init {
        requireOption(candidates.isNotEmpty()) { "At least one foreground is required" }
        val range = if (apca) 0.0..APCA_LIMIT else 1.0..WCAG_LIMIT
        with(contrastTargets) {
            val thresholds = listOfNotNull(target, fill, fillHover, fillActive, border, text, textOnSubtle, strong)
            requireOption(thresholds.all { it in range })
        }
    }

    private val rankedEntries = palette?.let { entries ->
        requireOption(entries.isNotEmpty()) { "Empty palette" }
        val ids = mutableSetOf<String>()
        val compiled = entries.map { entry ->
            requireOption(ids.add(entry.id) && Charsets.UTF_8.newEncoder().canEncode(entry.id)) { "Invalid palette ID" }
            val fallback = entry.light ?: entry.dark
                ?: throw TextColorException("INVALID_OPTIONS", "Missing palette fill")
            val light = FixedTone(entry.light ?: fallback)
            val dark = FixedTone(entry.dark ?: fallback)
            RankedEntry(entry.id.toByteArray(Charsets.UTF_8), light to dark)
        }
        val required = contrastTargets.fill ?: target
        fun passes(tone: FixedTone) = canonical(tone.bytes).let { contrast(foreground(it, required), it) } >= required
        compiled.filter { passes(it.colors.first) && passes(it.colors.second) }.ifEmpty { compiled }
    }.orEmpty()

    private fun contrast(a: DoubleArray, b: DoubleArray) = abs(Contrast.measure(a, b, contrastModel, gamut))
    private fun foreground(rgb: DoubleArray, required: Double): DoubleArray {
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
            return Mapping(pair.first.hue, FIXED_PROFILE_MIDPOINT, FIXED_PROFILE_MIDPOINT, pair.first.fraction(),
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
        fun placed(mapped: Mapping, p: Placement): Palette {
            val ring = (p.ring % ringOffsets.size).toInt()
            val selected = if (mapped.fixed != null) mapped.copy(ring = ring) else
                mapped.copy(hue = hueDomain.mappedHue(p.hueFraction), fraction = p.hueFraction,
                    source = "assigned", ring = ring)
            return render(selected)
        }
        val occupied = placements.map { (name, p) ->
            fillPoints(placed(mappings[name] ?: mapping(name), p))
        }.toMutableList()
        val colors = mappings.mapValues { (name, mapped) ->
            val pinnedPlacement = placements[name]
            if (pinnedPlacement != null) placed(mapped, pinnedPlacement) else {
                val initial = place(mapped.fraction, placements.values, separation, size)
                val (p, palette) = repairPlacement(initial, placements.values, separation, occupied) {
                    placed(mapped, it)
                }
                placements[name] = p
                occupied.add(fillPoints(palette))
                palette
            }
        }
        return Assignment(placements.toMap(), colors, assignmentReport(colors, size, separation))
    }

    fun hex(text: String, dark: Boolean = false, role: String = "fill", strict: Boolean = false): String {
        val mapped = mapping(normalization.apply(text))
        val result = theme(dark, mapped, if (strict) null else role)
        if (strict) {
            for ((pair, _, _) in contrastPairs(role)) {
                if (!result.contrast.getValue(pair).meetsTarget) throw UnmetConstraintException(pair)
            }
        }
        return result.colors[role] ?: throw TextColorException("INVALID_OPTIONS", "Unknown color role: $role")
    }

    fun color(text: String, dark: Boolean = false, role: String = "fill"): Color =
        theme(dark, mapping(normalization.apply(text)), role).color(role)

    private fun sample(range: UnitRange, mapped: Mapping, dark: Boolean, hue: Double, role: Int): Double {
        val bias = biases[(if (dark) 2 else 0) + role]
        val position = hue / BIAS_SECTOR
        val segment = position.toInt()
        val correction = bias[segment] + (bias[(segment + 1) % bias.size] - bias[segment]) * (position - segment)
        return (range.sample(mapped.uL) + correction + ringOffsets[mapped.ring]).coerceIn(0.0, 1.0)
    }

    private inner class ToneRenderer(
        val hue: Double, val uC: Double, val defaultScale: Double, val ring: Int, val neutral: Boolean,
        val adjustments: MutableMap<String, ToneAdjustment>?,
    ) {
        operator fun invoke(
            name: String, l: Double, role: RoleProfile, defaultCap: Double, target: Double,
            backdrop: DoubleArray? = null, second: DoubleArray? = null,
            secondTarget: Double = target, surface: Boolean = false,
        ): DoubleArray {
            val lightness = l.coerceIn(0.0, 1.0)
            val scale = (role.chromaScale?.sample(uC) ?: defaultScale) * ringScale(ring)
            val cap = if (neutral) 0.0 else role.chromaCap ?: defaultCap
            val requested = ColorMath.cusp(lightness, hue, gamut) * scale
            val chroma = minOf(cap, requested)
            val threshold = if (target == 0.0 && second != null) secondTarget else target
            val repaired = repairTone(Oklch(lightness, chroma, hue), gamut, threshold) { fitted ->
                val rgb = fitted.encoded()
                if (hueDomain.excludes(rgb, gamut)) return@repairTone Double.NEGATIVE_INFINITY
                val primary = if (backdrop == null || surface) contrast(backdrop ?: foreground(rgb, target), rgb)
                    else contrast(rgb, backdrop)
                when {
                    second == null || secondTarget == 0.0 -> primary
                    target == 0.0 -> contrast(rgb, second)
                    else -> minOf(primary, contrast(rgb, second) * (target / secondTarget))
                }
            }
            adjustments?.put(name, ToneAdjustment(repaired.color.lightness != lightness, requested > cap,
                repaired.color.chroma < chroma, repaired.fallback))
            return repaired.color.bytes.encoded()
        }
    }

    private fun theme(dark: Boolean, mapped: Mapping, selected: String? = null): ThemePalette =
        ThemeRenderer(dark, mapped, selected == null).render(selected)

    private inner class ThemeRenderer(dark: Boolean, mapped: Mapping, full: Boolean) {
        private val fixed = if (dark) mapped.fixed?.second else mapped.fixed?.first
        private val hue = fixed?.hue ?: mapped.hue
        private val uC = mapped.uC
        private val base = if (dark) darkBackground else lightBackground
        private val background = canonical(base.bytes)
        private val direction = if (dark) 1 else -1
        private val lb = if (gamut == Gamut.SRGB) base.lightness
            else snapLightness(ColorMath.oklch(background, gamut).l)
        private val profile = if (dark) profiles.dark else profiles.light
        private val defaultScale = preset.minScale + (preset.maxScale - preset.minScale) * uC
        private val fillRange = profile.fill.lightness ?: if (dark) darkFillRange else lightFillRange
        private val fillL = fixed?.lightness ?: sample(fillRange, mapped, dark, hue, 0)
        private val textRange = profile.text.lightness ?: if (dark) lightFillRange else lightTextRange
        private val textL = sample(textRange, mapped, dark, hue, 1)
        private val adjustments = if (full) mutableMapOf<String, ToneAdjustment>() else null
        private val tone = ToneRenderer(hue, uC, defaultScale, mapped.ring, fixed?.neutral == true, adjustments)
        private val unconstrained = if (apca) 0.0 else 1.0
        private val borderTarget = contrastTargets.required("border", target, apca)
        private val subtle by lazy(LazyThreadSafetyMode.NONE) {
            tone("subtle", lb + direction * SUBTLE_OFFSET, profile.fill, FILL_CAP, unconstrained)
        }
        private val fill by lazy(LazyThreadSafetyMode.NONE) {
            fixed?.bytes?.let(::canonical)
                ?: tone("fill", fillL, profile.fill, FILL_CAP, contrastTargets.fill ?: target)
        }
        private val onFill by lazy(LazyThreadSafetyMode.NONE) { foreground(fill, contrastTargets.fill ?: target) }
        private fun required(pair: String) = contrastTargets.required(pair, target, apca)

        private fun bytes(role: String): DoubleArray = when (role) {
            "background" -> background
            "subtle" -> subtle
            "muted" -> tone(role, lb + direction * MUTED_OFFSET, profile.fill, FILL_CAP, unconstrained)
            "fill" -> fill
            "onFill" -> onFill
            "fillHover" -> tone(role, fillL + direction * HOVER_OFFSET, profile.fill, FILL_CAP,
                required(role), onFill, surface = true)
            "fillActive" -> tone(role, fillL + direction * ACTIVE_OFFSET, profile.fill, FILL_CAP,
                required(role), onFill, surface = true)
            "border" -> tone(role, lb + direction * BORDER_OFFSET, profile.fill, FILL_CAP, borderTarget, background)
            "text" -> tone(role, textL, profile.text, TEXT_CAP,
                required(role), background, subtle, required("textOnSubtle"))
            "strong" -> tone(role, textL + direction * STRONG_OFFSET, profile.text, TEXT_CAP,
                required(role), background)
            else -> throw TextColorException("INVALID_OPTIONS", "Unknown color role: $role")
        }

        fun render(selected: String?): ThemePalette {
            val roles = selected?.let { listOf(it) } ?: paletteRoles
            val colors = roles.associateWith(::bytes)
            return formatTheme(colors, adjustments, fixed != null)
        }
    }

    private fun formatTheme(
        colors: Map<String, DoubleArray>, adjustments: Map<String, ToneAdjustment>?, fixed: Boolean,
    ): ThemePalette {
        val renditions = if (gamut == Gamut.DISPLAY_P3) colors.mapValues { renderedP3(it.value) } else emptyMap()
        val hex = if (renditions.isNotEmpty()) renditions.mapValues { it.value.hex } else colors.mapValues { (_, rgb) ->
            rgb.joinToString("", prefix = "#") { it.toInt().toString(HEX_RADIX).padStart(2, '0') }
        }
        val report = adjustments?.let { relationshipReport(colors, it, contrastModel, gamut, fixed) { pair ->
            contrastTargets.required(pair, target, apca)
        } }.orEmpty()
        return ThemePalette(
            java.util.Collections.unmodifiableMap(hex), java.util.Collections.unmodifiableMap(report), renditions
        )
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

internal fun contrastPairs(role: String): List<Triple<String, String, String>> = when (role) {
    "fill", "onFill" -> listOf(Triple("fill", "onFill", "fill"))
    "fillHover", "fillActive" -> listOf(Triple(role, "onFill", role))
    "text" -> listOf(Triple(role, role, "background"), Triple("textOnSubtle", role, "subtle"))
    "strong", "border" -> listOf(Triple(role, role, "background"))
    else -> emptyList()
}

private const val BORDER_CONTRAST = 3.0

private fun ContrastTargets.required(pair: String, target: Double, apca: Boolean): Double = when (pair) {
    "fill" -> fill
    "fillHover" -> fillHover
    "fillActive" -> fillActive
    "border" -> border ?: if (apca) target else minOf(BORDER_CONTRAST, target)
    "text" -> text
    "textOnSubtle" -> textOnSubtle
    "strong" -> strong
    else -> error("Unknown contrast relationship: $pair")
} ?: target
