import com.hustedev.texthue.Backgrounds
import com.hustedev.texthue.RendererWork
import com.hustedev.texthue.Resolver

fun main() {
    val fitLimits = mapOf("default" to 1600, "aaa" to 5732, "maximum" to 13325,
        "gray" to 3068, "impossible" to 12252, "p3" to 1600, "apca" to 11133)
    for (scenario in scenarios) {
        val resolver = Resolver(gamut = scenario.gamut, contrastModel = scenario.model,
            contrastTarget = scenario.target, backgrounds = Backgrounds(light = scenario.light))
        RendererWork.run {
            fits = 0
            cusps = 0
            hashes = 0
            repeat(100) { resolver.resolve("item:$it") }
            check(fits in 1600..fitLimits.getValue(scenario.name) && cusps == 1600 && hashes == 100) {
                "${scenario.name}: $fits fits, $cusps cusps, $hashes hashes"
            }
            println("""{"scenario":"${scenario.name}","fits":$fits,"cusps":$cusps,"hashes":$hashes}""")
        }
    }
}
