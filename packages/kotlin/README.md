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

## Consume the JVM package

From the repository root, run `packages/kotlin/gradlew -p packages/kotlin publishLibraryPublicationToStagingRepository` with a JDK. This creates a Maven repository under `packages/kotlin/build/repository` with the library JAR, source JAR, POM and Gradle module metadata.

In a separate Kotlin/JVM project's Gradle build, add the staging repository and dependency, adjusting the checkout path.

```kotlin
repositories {
    maven { url = uri("../texthue/packages/kotlin/build/repository") }
    mavenCentral()
}
dependencies {
    implementation("com.hustedev:texthue:0.1.0")
}
```

## Run the conformance suite

After building the JavaScript reference, run `packages/kotlin/gradlew -p packages/kotlin check` (use `gradlew.bat` on Windows). This compiles with the pinned Kotlin plugin and runs all seven suites on the JVM.

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

The runner compiles production and test sources, converts the test JAR to DEX, executes the seven suites through ART, and removes the temporary device file. Tests cover linear-light sRGB compositing, identity framing, gamut fitting, contrast, rendered formats, contrast repair, and resolver and batch behavior. APK packaging and application lifecycle behavior require separate tests.

On 2026-11-22 the seven suites passed on Android API 34 ART with the x86_64 Google emulator image on a Windows host. Android Studio's Kotlin compiler and Build Tools 37.0.0 produced the DEX. The run covered 6 composites, 32 identity vectors, 112 gamut fits, 1,583 contrast measurements, 640 role formats, 192 contrast repairs, and 1,060 two-theme resolver vectors, including the associated invalid-input, tie, and batch checks. This run used a read-only emulator instance and exercised the library directly through `app_process`. Physical-device and APK integration coverage remain separate.
