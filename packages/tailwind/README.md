# TextHue for Tailwind CSS

Generate colors at build time for a known set of labels. From a source checkout run `npm ci` and `npm run build` at the repository root to link the adapter and its core dependency.

For a Tailwind CSS 3.x JavaScript configuration, give each label a stable CSS alias. Both light and dark colors can then appear in the same configuration.

```js
// tailwind.config.mjs
import { namedLabelColors } from '@texthue/tailwind';

export default {
  content: ['./src/**/*.{html,js,jsx,tsx}'],
  theme: {
    extend: {
      colors: namedLabelColors({ bug: 'Bug report', docs: 'Documentation' }),
    },
  },
};
```

```html
<span class="bg-texthue-bug-light-fill text-texthue-bug-light-on-fill dark:bg-texthue-bug-dark-fill dark:text-texthue-bug-dark-on-fill">
  Bug report
</span>
```

For free-form labels without caller-owned aliases, `labelColors(labels, options, theme)` returns a map of generated names with hash suffixes. Inspect its keys to get the exact token names. Select `light` or `dark` when generating that map.
