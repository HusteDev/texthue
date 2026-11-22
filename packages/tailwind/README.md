# TextHue for Tailwind

Assign the complete collection at build time in a Tailwind JavaScript configuration.

```js
import {labelColors} from '@texthue/tailwind';

const colors = labelColors(['research', 'design']);
export default {
  content: ['./src/**/*.html'],
  theme: {extend: {colors}},
};
```

Each token includes the normalized label slug, a short digest, and the role. Inspect `Object.keys(colors)` for the exact names and use the resulting literal utility classes in your templates. Pass a resolver options object as the second argument and `'dark'` as the third to generate dark-theme values.

For labels created after the build, use the core package. Apply its variables directly to the element.

```js
import {createResolver, cssVariables} from 'texthue';

const label = 'research';
const resolver = createResolver();
const variables = cssVariables(resolver.resolve(label), {theme:'light', slug:label});
for (const [name, value] of Object.entries(variables)) element.style.setProperty(name, value);
const fill = Object.keys(variables).find(name => name.endsWith('-fill'));
element.style.backgroundColor = `var(${fill})`;
```
