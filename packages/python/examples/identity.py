"""Compare exact identities and resolver-controlled NFC normalization."""

from texthue import Resolver

exact = Resolver()
canonical = Resolver(normalize={"unicode": "NFC"})
composed, decomposed = "\u00e9", "e\u0301"
assert exact.identity(composed) != exact.identity(decomposed)
assert canonical.resolve(composed) == canonical.resolve(decomposed)

labels = Resolver(namespace="labels")
projects = Resolver(namespace="projects")
label_fill = labels.hex("42", theme="light", role="fill")
project_fill = projects.hex("42", theme="light", role="fill")
assert label_fill != project_fill
print("Namespace mappings:", label_fill, project_fill)
