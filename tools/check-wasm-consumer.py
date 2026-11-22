"""Type-check and run a standalone Node consumer of the packed WebAssembly module."""

import json
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def main(archive):
    npm = shutil.which("npm.cmd") or shutil.which("npm")
    with tempfile.TemporaryDirectory() as tmp:
        app = Path(tmp)
        (app / "package.json").write_text(json.dumps({"private": True, "type": "module"}))
        subprocess.run(
            [
                npm,
                "install",
                "--offline",
                "--ignore-scripts",
                "--no-audit",
                "--no-fund",
                str(archive.resolve()),
            ],
            cwd=app,
            check=True,
        )
        (app / "consumer.ts").write_text(
            """import {initialize, initSync, roleHex} from '@texthue/wasm';
export async function start(bytes: WebAssembly.Module, asyncInit: boolean) {
  if (asyncInit) await initialize({module_or_path: bytes});
  else initSync({module: bytes});
  return roleHex('research', 'fill', {theme: 'light'}) satisfies string;
}
// @ts-expect-error Unknown roles must fail type checking.
if (false) roleHex('research', 'typo');
""",
            encoding="utf-8",
        )
        subprocess.run(
            [
                "node",
                str(ROOT / "node_modules/typescript/bin/tsc"),
                "--strict",
                "--module",
                "NodeNext",
                "--target",
                "ES2022",
                "consumer.ts",
            ],
            cwd=app,
            check=True,
        )
        script = """import {readFile} from 'node:fs/promises';
import {start} from './consumer.js';
const bytes = await readFile(new URL(import.meta.resolve('@texthue/wasm/module.wasm')));
const color = await start(await WebAssembly.compile(bytes), process.argv[1] === 'async');
if (color !== '#59b8d8') throw Error(color);"""
        for mode in ("sync", "async"):
            subprocess.run(["node", "--input-type=module", "-e", script, mode], cwd=app, check=True)
        print("PASS: packed WebAssembly declarations and both Node initialization modes")


if __name__ == "__main__":
    main(Path(sys.argv[1]))
