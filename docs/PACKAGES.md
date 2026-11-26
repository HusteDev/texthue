# Packages and installation

This pre-release checkout builds the packages locally. Follow the [clean consumer walkthroughs](../examples/roster/README.md) for npm, Python and Go. Each experimental port below has its own source build instructions.

| Package | Public surface |
| --- | --- |
| [JavaScript and TypeScript](../packages/npm/README.md) | Full renderer, reusable resolver, projected roles, assignments, markers, vision-aware placement, palette anchors, CSS variables, registry replay and migration |
| [Python](../packages/python/README.md) | Native resolver, projected roles, assignments, markers, vision-aware placement, palette anchors, CSS variables, registry replay and migration |
| [Go](../packages/go/README.md) | Native resolver, role lookup, markers, vision-aware assignment, fixed palettes and anchors, CSS variables, configuration and registry replay, migration |
| [React](../packages/react/README.md) | Context provider and hooks for the JavaScript resolver |
| [Tailwind](../packages/tailwind/README.md) | Build-time theme color tokens |
| [Rust](../packages/rust/README.md), [.NET](../packages/csharp/README.md), [Dart](../packages/dart/README.md), [Swift](../packages/swift/README.md), [Kotlin](../packages/kotlin/README.md) | Experimental native renderers with shared single-label and collection fixtures. Each guide documents its public API. |
| [WebAssembly](../packages/wasm/README.md) | Experimental Rust-backed full palettes, APCA, Display-P3, role hex and pinned collection assignment |

Exact UTF-8 labels and shared settings give portable results for the conformance corpus. Unicode normalization and lowercase mapping depend on each runtime's Unicode data. Use exact identity or a common upstream normalization version when stored identities must match across runtimes.
