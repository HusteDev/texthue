import com.hustedev.texthue.Backgrounds
import com.hustedev.texthue.Resolver

data class Scenario(val name: String, val target: Double, val light: String)

for (scenario in listOf(
    Scenario("default", 4.5, "#ffffff"),
    Scenario("aaa", 7.0, "#ffffff"),
    Scenario("maximum", 21.0, "#ffffff"),
    Scenario("gray", 4.5, "#777777"),
    Scenario("impossible", 21.0, "#777777"),
)) {
    val resolver = Resolver(contrastTarget = scenario.target, backgrounds = Backgrounds(light = scenario.light))
    val samples = DoubleArray(100)
    for (i in -20 until samples.size) {
        val label = "item:$i"
        val start = System.nanoTime()
        val palette = resolver.resolve(label)
        val elapsed = System.nanoTime() - start
        check(palette.light.colors.containsKey("fill") && palette.dark.colors.containsKey("fill"))
        if (i >= 0) samples[i] = elapsed / 1000.0
    }
    samples.sort()
    val median = (samples[49] + samples[50]) / 2
    println("""{"scenario":"${scenario.name}","medianUs":$median,"p95Us":${samples[94]}}""")
}
