# Inspector performance

Run `npm run build` and `node tools/bench-inspector.mjs` from the repository root. The harness measures the synchronous computation performed by the inspector worker. Each scenario uses one warm-up followed by 20 samples, sequential item labels, the dark theme, and full-severity deutan simulation. The registry scenarios pin half the labels.

| Labels | Fresh median / p95 (ms) | Half pinned median / p95 (ms) |
| ---: | ---: | ---: |
| 12 | 7 / 10 | 8 / 10 |
| 100 | 51 / 70 | 76 / 100 |
| 250 | 163 / 191 | 273 / 324 |

Measured on Windows x64 with Node 25.8.2. At 250 labels the half-pinned case computes 31,125 pairwise distances and takes over a quarter second at the median. The inspector runs this computation in a terminable worker so a later submission can replace an expensive batch. Browser module loading, message transfer, DOM construction, and opening the full diagnostics view add latency beyond these measurements. Larger batches remain possible and the pairwise result grows quadratically.
