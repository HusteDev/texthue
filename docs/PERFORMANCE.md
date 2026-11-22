# Inspector performance

Run `npm run build` and `node tools/bench-inspector.mjs` from the repository root. The harness measures the synchronous computation performed by the inspector worker. Each scenario uses one warm-up followed by 20 samples, sequential item labels, the dark theme, and full-severity deutan simulation. The registry scenarios pin half the labels.

| Labels | Fresh median / p95 (ms) | Half pinned median / p95 (ms) |
| ---: | ---: | ---: |
| 12 | 7 / 10 | 8 / 10 |
| 100 | 51 / 70 | 76 / 100 |
| 250 | 163 / 191 | 273 / 324 |

Measured on Windows x64 with Node 25.8.2. At 250 labels the half-pinned case computes 31,125 pairwise distances and takes over a quarter second at the median. The inspector runs this computation in a terminable worker so a later submission can replace an expensive batch. Browser module loading, message transfer, DOM construction, and opening the full diagnostics view add latency beyond these measurements. Larger batches remain possible and the pairwise result grows quadratically.

## Two-theme resolver cost

Median / p95 in microseconds on Windows x64, AMD Ryzen 7 PRO 7840U. Each harness warms a compiled resolver with 20 labels, then resolves item:0 through item:99. The dark background stays at #121212. JavaScript, Python and Rust time individual resolutions. The Rust measurements include both theme contrast reports. Go times 100 resolutions per label and reports percentiles of the per-label averages because individual resolutions fell below the Windows timer resolution. The Go p95 therefore excludes within-label timing spikes.

| Light background and target | JavaScript | Python | Go | Rust |
| --- | ---: | ---: | ---: | ---: |
| White, 4.5 | 239 / 511 | 1,892 / 3,042 | 61 / 110 | 22.8 / 33.5 |
| White, 7 | 315 / 868 | 2,299 / 3,428 | 100 / 141 | 32.6 / 42.1 |
| White, 21 | 1,347 / 2,935 | 9,404 / 18,432 | 490 / 582 | 78.6 / 95.4 |
| #777777, 4.5 | 338 / 700 | 2,526 / 3,255 | 142 / 202 | 30.7 / 39.7 |
| #777777, 21 | 1,137 / 1,962 | 9,406 / 13,273 | 456 / 524 | 73.1 / 87.0 |

Reproduce with `npm run build`, `node tools/bench.mjs`, `python tools/bench.py`, and `go -C packages/go test -run '^$' -bench BenchmarkResolverContrast -benchtime=100x`. Go's standard ns/op column measures a batch of 100. The custom median-us and p95-us columns report per-resolution costs.

### APCA and Display P3 timing

The resolver benchmarks also exercise APCA at a target of 75 Lc on white and Display P3 at a WCAG target of 4.5 on white. The following Windows x64 observations use the same 100-label corpus and include both themes. Other verification processes shared the host during sampling.

| Scenario | JavaScript median / p95 (µs) | Python | Go | Kotlin/JVM |
| --- | ---: | ---: | ---: | ---: |
| APCA, sRGB | 605 / 1,516 | 7,104 / 11,363 | 277 / 538 | 259 / 569 |
| Display P3 | 207 / 429 | 3,961 / 5,144 | 168 / 214 | sRGB resolver only |

Python counted 11,133 fits for APCA and 1,600 for Display P3. Each scenario performed 1,600 cusp evaluations and 100 hashes.

### sRGB WCAG work budgets

The JavaScript benchmark collects V8 function-entry counts separately from latency measurements. Each row covers the full 100-label corpus. The default run made 1,600 gamut fits. The 7:1 and 21:1 white-background runs made 5,732 and 12,725. The gray-background runs made 2,868 fits at 4.5:1 and 11,452 at 21:1. Every scenario made 1,600 cusp evaluations and 100 identity hashes. The JavaScript test suite enforces these fit and cusp ceilings and checks for one hash per label.

Python's benchmark measures the same operations in a separate counting pass. Across all five scenarios it produced the same fit, cusp, and hash counts as JavaScript. Python's conformance suite enforces the same ceilings.

Go's count-mode coverage confirms the same operation counts in all five scenarios. Run `python tools/check-go-work.py` to measure them independently of benchmark timing. The primary verifier runs this check against the same ceilings as JavaScript and Python.

## Historical near-collision pairs

The shared assignment corpus includes two pairs from the original review. The table gives Euclidean OKLab distance between the two emitted sRGB fills for each pair in isolation, using default options. Larger values indicate more separation in this metric.

| Labels | Light hash / assigned | Dark hash / assigned |
| --- | ---: | ---: |
| item:33 and item:633 | 0.0159 / 0.0736 | 0.0111 / 0.0479 |
| item:79 and item:81 | 0.2679 / 0.2679 | 0.2067 / 0.2067 |

Collection assignment moved one member of the first pair. The redesigned hash renderer already placed the second pair far enough apart to retain both placements. These measurements cover two pairs and normal vision. They do not establish a general perceptual threshold.

### Compiled Rust renderer

Rust's unit tests count gamut fits, cusp evaluations and identity hashes on the
same 100-label corpus. In table order, the five scenarios used 1,600, 5,154,
11,325, 2,668 and 10,252 fits. Each used 1,600 cusp evaluations and 100 hashes.
Rust scores the known black and white endpoints directly during contrast repair.
Run `cargo test --locked renderer_work_budgets -- --nocapture` from the crate
directory to reproduce the counts. The timing measurements below preceded this
endpoint optimization.

On the Windows x64 benchmark host, Criterion estimated 19.8 µs for the default two-theme resolution of `project:atlas`, 47.5 µs at 7:1 and 74.0 µs at 21:1 on white. On #777777 the estimates were 29.2 µs at 4.5:1 and 70.4 µs at 21:1. A 40-label batch took 1.23 ms with distinct labels and 0.234 ms with eight distinct labels. These are Criterion point estimates for repeated inputs. The corpus measurements above sample different identities. Compared with the prior local Criterion baseline, the default estimate increased and the 21:1 white-background estimate decreased. Timing alone does not isolate the cost of contrast reporting.

Reproduce from the crate directory with `cargo bench --locked --bench renderer -- --warm-up-time 1 --measurement-time 2 --sample-size 20`. The timed loops reuse compiled settings.

For only the Rust corpus percentiles and a smoke test of each Criterion case, run `cargo bench --locked --bench renderer -- --test` from the crate directory.

### C# renderer

Run `dotnet run -c Release --project packages/csharp/benchmarks/Renderer` from
the root. The benchmark times individual two-theme `Renderer.Resolve` calls on
the same 100 labels after 20 warm-up labels per scenario. Resolver construction
and JSON output fall outside the timed region. The C# result contains both role
palettes. These measurements cover the Windows .NET 9 Release build.

| Light background and target | Median (µs) | p95 (µs) |
| --- | ---: | ---: |
| White, 4.5 | 133 | 169 |
| White, 7 | 313 | 626 |
| White, 21 | 1,155 | 1,594 |
| #777777, 4.5 | 247 | 329 |
| #777777, 21 | 561 | 1,174 |

### Kotlin/JVM renderer

Build the JAR with `packages/kotlin/gradlew -p packages/kotlin jar`, then run
`packages/kotlin/gradlew -q -p packages/kotlin benchmark`.
The Windows run used Android Studio's Kotlin compiler and bundled JVM.
Each row times both theme palettes for the same 100 labels after 20 warm-up
labels. Scenarios share a JVM and execute in table order. JIT compilation can
affect comparisons between rows. Android device timing requires a separate run.

| Light background and target | Median (µs) | p95 (µs) |
| --- | ---: | ---: |
| White, 4.5 | 186 | 416 |
| White, 7 | 144 | 255 |
| White, 21 | 296 | 425 |
| #777777, 4.5 | 97 | 153 |
| #777777, 21 | 274 | 359 |

### Dart renderer

From `packages/dart`, run `dart pub get --enforce-lockfile` and
`dart tool/benchmark.dart`. On Windows x64 with Dart 3.12.2 in JIT mode,
each row measures 100 individual two-theme resolutions after 20 warm-up
labels. All five scenarios run sequentially in one process, so later rows
can benefit from compilation during earlier scenarios.

| Light background and target | Median (µs) | p95 (µs) |
| --- | ---: | ---: |
| White, 4.5 | 316 | 701 |
| White, 7 | 250 | 1,055 |
| White, 21 | 640 | 994 |
| #777777, 4.5 | 172 | 295 |
| #777777, 21 | 600 | 1,013 |

### Swift renderer

From `packages/swift`, run `swift run --force-resolved-versions -c release TextHueBenchmark`.
The measurements below used Swift 6.1.3 on x86-64 Linux in Docker. Each row
times 100 individual two-theme resolutions after 20 warm-up labels.
Compilation and resolver construction fall outside the timed region.

| Light background and target | Median (µs) | p95 (µs) |
| --- | ---: | ---: |
| White, 4.5 | 153 | 192 |
| White, 7 | 198 | 319 |
| White, 21 | 674 | 813 |
| #777777, 4.5 | 212 | 248 |
| #777777, 21 | 630 | 879 |

## Collection assignment

Each sample assigns the same 40 distinct labels (`item:0` through `item:39`) with default settings, an empty registry and a previously compiled resolver. The measurement includes placement, light and dark rendering, and the closest-pair report. Five warm-ups precede 20 measured calls. The p95 is the 19th sorted observation.

| Runtime | Median per collection | p95 per collection |
| --- | ---: | ---: |
| JavaScript (Node.js) | 10.17 ms | 13.66 ms |
| Python | 177.77 ms | 187.56 ms |
| Go | 4.22 ms | 10.40 ms |
| Rust (optimized) | 1.18 ms | 1.58 ms |
| .NET (Release) | 11.28 ms | 11.94 ms |
| Kotlin (JVM) | 8.17 ms | 10.50 ms |
| Dart (JIT) | 6.80 ms | 12.04 ms |
| Swift (Release, Linux x86_64 container) | 7.24 ms | 8.52 ms |

Swift ran in the Linux container. All other rows used Windows x64. The native benchmark commands above now emit the same collection scenario. Rust additionally runs a separate Criterion timing loop, which estimated 2.27 ms per collection in this run.

Run `node tools/bench.mjs`, `python tools/bench.py`, and `go -C packages/go test -run '^$' -bench '^BenchmarkAssign40$' -benchtime=20x` after building the JavaScript package. These observations describe a single host and corpus.
