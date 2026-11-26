# WebAssembly

**Experimental source port.** See the [package capability table](https://github.com/HusteDev/texthue/blob/main/docs/PACKAGES.md).

The Rust-backed binding exposes full light and dark palettes, WCAG and APCA, Display-P3, fixed brand colors, and collection assignment with pinned placements. Initialize the module once.

```js
import { initialize, resolve, assign } from '@texthue/wasm';

await initialize();
const options = { gamut: 'display-p3', contrastModel: 'apca' };
const badge = resolve('research', options);
console.log(badge.light.fill.css, badge.light.contrast.fill.value);
const initial = assign(['research', 'design'], options);
const extended = assign(['research', 'engineering'], options, initial.assignments);
```

For a synchronous host, pass the compiled binary bytes to `initSync({ module: bytes })`. Build from the repository root with `python tools/build-wasm.py` after installing the Rust target `wasm32-unknown-unknown` and `wasm-bindgen-cli` version 0.2.130. Run `node tools/check-wasm.mjs` to compare the binding against the frozen roles.

## Node.js

Resolve the shipped binary through the package export and initialize it before resolving [roles](https://github.com/HusteDev/texthue/blob/main/docs/GLOSSARY.md#theme-and-role).

```js
import {readFile} from 'node:fs/promises';
import {initSync, roleHex} from '@texthue/wasm';

const url = new URL(import.meta.resolve('@texthue/wasm/module.wasm'));
initSync({module: await readFile(url)});
console.log(roleHex('research', 'fill')); // #59b8d8
```
