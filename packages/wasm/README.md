# @texthue/wasm

Resolve a single sRGB role using the Rust renderer. The binding accepts a label, role, theme, namespace and unsigned 32-bit seed. Initialize the WebAssembly module once before resolving labels.

```js
import { initialize, roleHex } from '@texthue/wasm';

await initialize();
const fill = roleHex('apple', 'fill', { namespace: 'project', seed: 42 });
```

For a synchronous host, pass the compiled binary bytes to `initSync({ module: bytes })`. Build from the repository root with `python tools/build-wasm.py` after installing the Rust target `wasm32-unknown-unknown` and `wasm-bindgen-cli` version 0.2.130. Run `node tools/check-wasm.mjs` to compare the binding against the frozen roles.
