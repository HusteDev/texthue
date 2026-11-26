"""Extend a saved collection and check its Display-P3, APCA and CSS output."""

import json

from texthue import Resolver, compare_assignments, css_variables, import_config

resolver = Resolver(
    gamut="display-p3",
    contrast_model="apca",
    palette_mode="anchors",
    palette=[{"id": "ocean", "light": "#117799", "dark": "#55ccff"}],
    overrides={"urgent": "#992211"},
)
initial = resolver.assign(["research", "urgent"], markers=True)
assert initial["colors"]["urgent"].light.fill.hex == "#992211"
assert initial["colors"]["research"].light.contrast.fill.model == "apca"

registry = resolver.export_registry(initial["assignments"])
restored = import_config(json.loads(json.dumps(resolver.export_config())))
pinned = restored.import_registry(json.loads(json.dumps(registry)))
extended = restored.assign(["research", "urgent", "design"], pinned=pinned)
assert extended["assignments"]["research"] == initial["assignments"]["research"]
variables = css_variables(extended["colors"]["design"], theme="light", slug="design", format="p3")
assert all(value.startswith("color(display-p3 ") for value in variables.values())

comparison = compare_assignments(
    {"resolver": resolver, "registry": registry},
    {"resolver": restored, "registry": registry},
    ["urgent", "research"],
)
assert comparison["colors"] == []
print(extended["colors"]["design"].light.fill.css)
