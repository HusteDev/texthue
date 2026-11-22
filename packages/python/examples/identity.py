"""Show that text is used exactly as given, that namespaces separate domains,
and that a stable identifier always maps to the same colors."""

import unicodedata

from texthue import resolve_text_colors

for text in ("research", "Research", "research ", "\u00e9", "e\u0301"):
    print(ascii(text), resolve_text_colors(text).light.fill.hex)

composed = resolve_text_colors(unicodedata.normalize("NFC", "\u00e9"))
decomposed = resolve_text_colors(unicodedata.normalize("NFC", "e\u0301"))
print(
    "Caller-selected NFC matches:",
    composed.light.fill.hex == decomposed.light.fill.hex,
)

labels = resolve_text_colors("42", {"namespace": "labels"})
projects = resolve_text_colors("42", {"namespace": "projects"})
print("Namespace mappings:", labels.light.fill.hex, projects.light.fill.hex)

settings = {"namespace": "projects"}
first = resolve_text_colors("project-id:42", settings)
second = resolve_text_colors("project-id:42", settings)
print("Repeated assignment matches:", first == second)
