import json
import sys
from pathlib import Path

from texthue import Resolver, import_config

labels = sys.argv[1:]
if not labels:
    raise SystemExit("Pass one or more usernames")
path = Path("roster.json")
if path.exists():
    saved = json.loads(path.read_text(encoding="utf-8"))
    resolver = import_config(saved["config"])
    pinned = resolver.import_registry(saved["registry"])
else:
    resolver = Resolver(namespace="assignees")
    pinned = {}

board = resolver.assign(labels, pinned=pinned)
for label in labels:
    badge = resolver.resolve(label).light
    print(label, badge.fill.hex, badge.on_fill.hex, board["colors"][label].light.fill.hex)

snapshot = {
    "config": resolver.export_config(),
    "registry": resolver.export_registry(board["assignments"]),
}
temporary = path.with_suffix(".tmp")
temporary.write_text(json.dumps(snapshot), encoding="utf-8")
temporary.replace(path)
