# TextHue for JavaScript and TypeScript

Build repeatable badge colors for exact Unicode labels. Use a shared resolver to validate settings once. Each result contains light and dark roles with contrast measurements.

## Run from source

From the repository root, run `npm ci` and `npm run build`. For a separate consumer project, run `npm pack --workspace texthue` and install the resulting local tarball there.

```js
import { createResolver } from 'texthue';

const resolver = createResolver();
const { fill, onFill } = resolver.resolve('research').light;
console.log(fill.hex, onFill.hex); // #59b8d8 #000000
```

## Assign a collection

```js
const issues = createResolver({ normalize: { whitespace: 'trim' } });
const board = issues.assign([' bug', 'feature', 'docs'], { markers: true });
const badge = board.colorsByInput[' bug'].light;
const saved = issues.exportRegistry(board.assignments);
const extended = issues.assign([' bug', 'feature', 'docs', 'question'], {
  pinned: issues.importRegistry(saved),
});
```

`colorsByInput` accepts each original label. `colors`, `markers`, and saved placements use normalized identity keys. Save `resolver.exportConfig()` alongside a registry and restore it with `importConfig()` when settings need to survive a process restart. Use `resolver.hex(label, { theme, role })` for a single role.

[Runnable consumer walkthrough](https://github.com/HusteDev/texthue/blob/main/examples/roster/README.md) · [Algorithm and options](SPECIFICATION.md)
