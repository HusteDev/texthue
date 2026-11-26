# TextHue for Python

Generate deterministic light and dark color roles for badges, avatars, and labels. Python 3.11 or newer is required. Install from a checkout with `python -m pip install ./packages/python` at the repository root.

```python
from texthue import Resolver, import_config

resolver = Resolver(normalize={"whitespace": "trim"})
assert resolver.hex("research", theme="light", role="fill") == "#59b8d8"
board = resolver.assign([" bug", "docs", "feature"], markers=True)
badge = board["colorsByInput"][" bug"].light
saved = resolver.export_registry(board["assignments"])
restored = import_config(resolver.export_config())
extended = restored.assign([" bug", "docs", "question"], pinned=restored.import_registry(saved))
assert extended["colorsByInput"][" bug"] == board["colorsByInput"][" bug"]
```

Use `resolve` for an independent label. Use `assign` when labels appear together and need distinct placements. The `colors` and `assignments` maps are keyed by normalized identity. `colorsByInput` accepts original labels. Set `vision=["normal", "deutan"]` for assignment that evaluates both renditions. Inspect `badge.contrast` for measured readability. Use a color's `to_dict()` for language-neutral field names.

[Consumer walkthrough](https://github.com/HusteDev/texthue/blob/main/examples/roster/README.md) · [Algorithm and options](SPECIFICATION.md)
