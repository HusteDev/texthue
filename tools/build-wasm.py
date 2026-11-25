"""Build the Rust-backed ESM package with a matching wasm-bindgen CLI."""

import os
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
target = ROOT / "packages/rust/target"
cli = os.environ.get("WASM_BINDGEN", "wasm-bindgen")
if subprocess.check_output([cli, "--version"], text=True).strip() != "wasm-bindgen 0.2.130":
    raise SystemExit("Install wasm-bindgen-cli 0.2.130")
subprocess.run(
    [
        "cargo",
        "rustc",
        "--lib",
        "--crate-type",
        "cdylib",
        "--manifest-path",
        ROOT / "packages/rust/Cargo.toml",
        "--release",
        "--locked",
        "--target-dir",
        target,
        "--target",
        "wasm32-unknown-unknown",
        "--features",
        "wasm-bindgen",
    ],
    check=True,
)
subprocess.run(
    [
        cli,
        "--target",
        "web",
        "--out-dir",
        ROOT / "packages/wasm/dist",
        target / "wasm32-unknown-unknown/release/texthue.wasm",
    ],
    check=True,
)
