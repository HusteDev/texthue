# TextHue for Kotlin

The Kotlin source port resolves a label into ten sRGB roles for each of two themes. The same namespace, seed, label and settings reproduce the same palette. The port is under development.

```kotlin
import com.hustedev.texthue.Resolver

fun main() {
    val resolver = Resolver(namespace = "project", seed = 42u)
    val palette = resolver.resolve("apple")
    println(palette.light.color("fill").hex)
    println(palette.dark.color("onFill").hex)

    val labels = listOf("apple", "pear", "apple")
    val palettes = resolver.batch(labels)
    check(palettes[0] == palettes[2])
}
```

Batch results follow input order. The resolver shares work for duplicate normalized labels within one batch. Exact-text hashing is the default. To treat canonically equivalent spellings as one identity, pass `normalization = Normalization(unicode = UnicodeForm.NFC)` when constructing the resolver.

## Run the conformance suite

From the repository root, install the locked JavaScript development dependencies and build the reference implementation. The runner requires Python, Node, a Kotlin compiler, and a JDK.

```sh
npm ci
npm run build
python tools/check-kotlin.py
```

On Windows, Android Studio can supply the Kotlin compiler and JDK. With the reference build available, run the following in PowerShell.

```powershell
$studio = "C:/Program Files/Android/Android Studio"
$env:JAVA_HOME = "$studio/jbr"
$compiler = "$studio/plugins/Kotlin/kotlinc/bin/kotlinc.bat"
python tools/check-kotlin.py --kotlinc $compiler --java "$env:JAVA_HOME/bin/java.exe"
```

To run the same suite on Android ART, start an API 34 or newer test emulator and use its serial from `adb devices`. Set `$sdk` to the installed SDK path and `$serial` to the selected device. This example uses Android Build Tools 37.0.0 and the API 34 platform.

```powershell
$adb = "$sdk/platform-tools/adb.exe"
& $adb devices -l
python tools/check-kotlin.py --kotlinc $compiler --android-serial $serial --adb $adb --d8 "$sdk/build-tools/37.0.0/d8.bat" --android-jar "$sdk/platforms/android-34/android.jar"
```

The runner compiles production and test sources, converts the test JAR to DEX, executes the six suites through ART, and removes the temporary device file. Tests cover identity framing, gamut fitting, contrast, rendered formats, contrast repair, and resolver and batch behavior. APK packaging and application lifecycle behavior require separate tests.
