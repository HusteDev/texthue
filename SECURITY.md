# Security policy

## Supported versions

TextHue has not yet published a `1.0` release. Until then, only the latest
published version of each package (npm `texthue`, PyPI `texthue`, and the
Go module `github.com/HusteDev/texthue/packages/go`) receives fixes. After
`1.0`, this section will list which major versions receive security fixes.

## Reporting a vulnerability

Please report suspected vulnerabilities privately using
[GitHub Security Advisories](https://github.com/HusteDev/texthue/security/advisories/new)
for this repository, rather than opening a public issue.

Include:

- The affected package(s) and version(s).
- A description of the issue and, if possible, a minimal reproduction.
- Whether the issue is in the color-mapping algorithm itself (which could
  affect deterministic assignments across all languages) or in
  packaging/tooling (which affects only that distribution).

TextHue is a stateless, dependency-free (npm and Python) or
minimal-dependency library that performs no I/O, network access, or file
access, and accepts no secrets; most security-relevant issues are likely to
be supply-chain issues in the build/release pipeline or panics/exceptions on
malformed input, rather than data exposure. We aim to acknowledge reports
within 5 business days and to publish a fix or mitigation plan within 30
days of confirming a report, adjusted for severity.

## Scope

In scope: the npm, PyPI, and Go packages under `packages/`; the
`.github/workflows/` release pipeline; `tools/` scripts that build or
publish artifacts. Out of scope: the algorithm's fitness for producing
visually unique or accessible colors for a given input set, which is a
product-quality question tracked in issues, not a vulnerability — see the
limits documented in `README.md` and `SPECIFICATION.md`.
