import com.hustedev.texthue.Backgrounds
import com.hustedev.texthue.ContrastModel
import com.hustedev.texthue.Gamut
import com.hustedev.texthue.Resolver

data class Scenario(val name: String, val target: Double, val light: String, val model: ContrastModel = ContrastModel.WCAG2,
    val gamut: Gamut = Gamut.SRGB)

val scenarios = listOf(
        Scenario("default", 4.5, "#ffffff"),
        Scenario("aaa", 7.0, "#ffffff"),
        Scenario("maximum", 21.0, "#ffffff"),
        Scenario("gray", 4.5, "#777777"),
        Scenario("impossible", 21.0, "#777777"),
        Scenario("p3", 4.5, "#ffffff", gamut = Gamut.DISPLAY_P3),
        Scenario("apca", 75.0, "#ffffff", ContrastModel.APCA),
)

fun main() {
    for (scenario in scenarios) {
        val resolver = Resolver(gamut = scenario.gamut, contrastModel = scenario.model, contrastTarget = scenario.target,
            backgrounds = Backgrounds(light = scenario.light))
        val samples = DoubleArray(100)
        for (i in -20 until samples.size) {
            val label = "item:$i"
            val start = System.nanoTime()
            val palette = resolver.resolve(label)
            val elapsed = System.nanoTime() - start
            check(listOf(palette.light, palette.dark).all { it.contrast.getValue("fill").model == scenario.model })
            if (scenario.gamut == Gamut.DISPLAY_P3) check(palette.light.color("fill").p3 != null)
            if (i >= 0) samples[i] = elapsed / 1000.0
        }
        samples.sort()
        val median = (samples[49] + samples[50]) / 2
        println("""{"scenario":"${scenario.name}","medianUs":$median,"p95Us":${samples[94]}}""")
    }

    val labels = List(40) { "item:$it" }
    val resolver = Resolver()
    val samples = DoubleArray(20)
    for (i in -5 until samples.size) {
        val start = System.nanoTime()
        val assignment = resolver.assign(labels)
        val elapsed = System.nanoTime() - start
        check(assignment.colors.size == labels.size)
        if (i >= 0) samples[i] = elapsed / 1000.0
    }
    samples.sort()
    println("""{"scenario":"assign40","medianUs":${(samples[9] + samples[10]) / 2},"p95Us":${samples[18]}}""")
}
