import com.hustedev.texthue.*
import groovy.json.JsonOutput
import groovy.json.JsonSlurper

private typealias Fields = Map<*, *>
private fun Fields.obj(key: String): Fields = get(key) as? Fields ?: emptyMap<String, Any>()
private fun Fields.number(key: String) = (get(key) as? Number)?.toDouble()
private fun interval(value: Any?): Pair<Double, Double> {
    val values = value as List<*>
    require(values.size == 2)
    return (values[0] as Number).toDouble() to (values[1] as Number).toDouble()
}
private fun arc(value: Any?) = interval(value).let { HueArc(it.first, it.second) }
private fun role(o: Fields): RoleProfile {
    fun range(key: String) = o[key]?.let(::interval)?.let { UnitRange(it.first, it.second) }
    return RoleProfile(range("lightness"), range("chromaScale"), o.number("chromaCap"))
}
private fun profile(o: Fields) = ThemeProfiles(role(o.obj("fill")), role(o.obj("text")))
private inline fun <reified E : Enum<E>> Fields.enum(key: String, default: E): E =
    (get(key) as? String)?.let { enumValueOf<E>(it.replace('-', '_').uppercase()) } ?: default

private fun resolver(o: Fields): Resolver {
    require(o["gamut"] in listOf(null, "srgb", "display-p3"))
    val n = o.obj("normalize")
    val t = o.obj("contrastTargets")
    val p = o.obj("profiles")
    val b = o.obj("backgrounds")
    return Resolver(
        gamut = if (o["gamut"] == "display-p3") Gamut.DISPLAY_P3 else Gamut.SRGB,
        namespace = o["namespace"] as? String ?: "",
        seed = o["seed"]?.toString()?.toUInt() ?: 0u,
        contrastTarget = o.number("contrastTarget"),
        normalization = Normalization(n.enum("unicode", UnicodeForm.NONE), n.enum("case", TextCase.NONE),
            n.enum("whitespace", Whitespace.NONE)),
        preset = o.enum("preset", Preset.LABELS),
        contrastModel = o.enum("contrastModel", ContrastModel.WCAG2),
        contrastTargets = ContrastTargets(t.number("fill"), t.number("fillHover"), t.number("fillActive"),
            t.number("border"), t.number("text"), t.number("textOnSubtle"), t.number("strong")),
        foregrounds = (o["foregrounds"] as? List<*>)?.map { it as String } ?: listOf("#000000", "#ffffff"),
        foregroundPolicy = o.enum("foregroundPolicy", ForegroundPolicy.BEST),
        hueRange = o["hueRange"]?.let(::arc) ?: HueArc(0.0, 360.0),
        excludeHues = (o["excludeHues"] as? List<*>)?.map(::arc).orEmpty(),
        backgrounds = Backgrounds(b["light"] as? String ?: "#ffffff", b["dark"] as? String ?: "#121212"),
        profiles = Profiles(profile(p.obj("light")), profile(p.obj("dark"))),
        overrides = o.obj("overrides").entries.associate { (name, v) ->
            name as String to if (v is String) BrandColors(v) else (v as Fields).let {
                BrandColors(it["light"] as String, it["dark"] as String)
            }
        },
        palette = (o["palette"] as? List<*>)?.map { v ->
            val e = v as Fields
            PaletteEntry(e["id"] as String, e["light"] as? String, e["dark"] as? String)
        }
    )
}

private fun theme(p: ThemePalette, target: Double): Fields {
    val pairs = p.contrast.mapValues { (_, r) ->
        buildMap<String, Any?> {
            put("ratio", r.ratio)
            put("meetsTarget", r.meetsTarget)
            put("lightnessAdjusted", r.lightnessAdjusted)
            put("chromaCapped", r.chromaCapped)
            put("chromaReduced", r.chromaReduced)
            put("fallback", r.fallback)
            if (r.model == ContrastModel.APCA) {
                put("value", r.value)
                put("model", "apca")
            }
        }
    }
    val colors = p.colors.mapValues { (role, _) ->
        val color = p.color(role)
        buildMap<String, Any?> {
            put("hex", color.hex)
            put("rgb", color.rgb)
            put("hsl", color.hsl)
            put("oklch", color.oklch)
            if (color.p3 != null) {
                put("p3", color.p3)
                put("css", color.css)
                put("srgbClipped", color.srgbClipped)
            }
        }
    }
    return colors + ("contrast" to (pairs + ("target" to target)))
}

fun main() {
    val requests = JsonSlurper().parse(System.`in`, "UTF-8") as List<*>
    val results = requests.map {
        val request = it as Fields
        require("config" !in request && request["exportConfig"] != true)
        val renderer = resolver(request.obj("options"))
        val p = renderer.resolve(request["text"] as String)
        mapOf("version" to "text-to-color-v1", "source" to p.source, "hue" to p.hue, "hueFraction" to p.hueFraction,
            "light" to theme(p.light, renderer.target), "dark" to theme(p.dark, renderer.target))
    }
    print(JsonOutput.toJson(results))
}
