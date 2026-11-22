# Inspector performance

Run `npm run build` and `node tools/bench-inspector.mjs` from the repository root. The harness measures the synchronous computation performed by the inspector worker. Each scenario uses one warm-up followed by 20 samples, sequential item labels, the dark theme, and full-severity deutan simulation. The registry scenarios pin half the labels.

| Labels | Fresh median / p95 (ms) | Half pinned median / p95 (ms) |
| ---: | ---: | ---: |
| 12 | 7 / 10 | 8 / 10 |
| 100 | 51 / 70 | 76 / 100 |
| 250 | 163 / 191 | 273 / 324 |

Measured on Windows x64 with Node 25.8.2. At 250 labels the half-pinned case computes 31,125 pairwise distances and takes over a quarter second at the median. The inspector runs this computation in a terminable worker so a later submission can replace an expensive batch. Browser module loading, message transfer, DOM construction, and opening the full diagnostics view add latency beyond these measurements. Larger batches remain possible and the pairwise result grows quadratically.

## Two-theme resolver cost

Median / p95 in microseconds on Windows x64, AMD Ryzen 7 PRO 7840U. Each harness warms a compiled resolver with 20 labels, then resolves item:0 through item:99. The dark background stays at #121212. JavaScript and Python time individual resolutions. Go times 100 resolutions per label and reports percentiles of the per-label averages because individual resolutions fell below the Windows timer resolution. The Go p95 therefore excludes within-label timing spikes.

| Light background and target | JavaScript | Python | Go |
| --- | ---: | ---: | ---: |
| White, 4.5 | 239 / 511 | 1,892 / 3,042 | 61 / 110 |
| White, 7 | 315 / 868 | 2,299 / 3,428 | 100 / 141 |
| White, 21 | 1,347 / 2,935 | 9,404 / 18,432 | 490 / 582 |
| #777777, 4.5 | 338 / 700 | 2,526 / 3,255 | 142 / 202 |
| #777777, 21 | 1,137 / 1,962 | 9,406 / 13,273 | 456 / 524 |

Reproduce with `npm run build`, `node tools/bench.mjs`, `python tools/bench.py`, and `go -C packages/go test -run '^$' -bench BenchmarkResolverContrast -benchtime=100x`. Go's standard ns/op column measures a batch of 100. The custom median-us and p95-us columns report per-resolution costs.

### JavaScript renderer work budgets

The JavaScript benchmark collects V8 function-entry counts separately from latency measurements. Each row covers the full 100-label corpus. The default run made 1,600 gamut fits. The 7:1 and 21:1 white-background runs made 5,732 and 12,725. The gray-background runs made 2,868 fits at 4.5:1 and 11,452 at 21:1. Every scenario made 1,600 cusp evaluations and 100 identity hashes. The JavaScript test suite enforces these fit and cusp ceilings and checks for one hash per label.

Python's benchmark measures the same operations in a separate counting pass. Across all five scenarios it produced the same fit, cusp, and hash counts as JavaScript. Python's conformance suite enforces the same ceilings.
