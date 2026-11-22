"""Feed language-neutral identity expectations to the JVM conformance runner."""

import base64
import json
from pathlib import Path


def encoded(value):
    return base64.b64encode(value.encode()).decode("ascii")


def main():
    corpus = Path(__file__).resolve().parents[1] / "conformance" / "vectors.json"
    for case in json.loads(corpus.read_text(encoding="utf-8"))["vectors"]:
        options = case["options"]
        print(
            encoded(case["text"]),
            encoded(options.get("namespace", "")),
            options.get("seed", 0),
            case["encoding"]["sha256"],
            ",".join(map(str, case["fractions"])),
            sep="\t",
        )


if __name__ == "__main__":
    main()
