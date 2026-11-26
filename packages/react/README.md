# TextHue for React

Build the core package from the checkout with `npm ci` and `npm run build` at the repository root. The workspace links `@texthue/react` to the local core.

Use `useTextColors(label)` to resolve a single identity. Use `useAssignedColors(labels, settings)` when the labels appear together and need [collection assignment](../../docs/GLOSSARY.md#collection-assignment-assigned). Both hooks return the core [resolver](../../docs/GLOSSARY.md#resolver) result during render.

```jsx
import {TextHueProvider, useAssignedColors} from '@texthue/react';

const options = {namespace: 'issues'};
const labels = ['bug', 'enhancement', 'question'];

function Legend() {
  const {colorsByInput} = useAssignedColors(labels);
  return labels.map(label => {
    const {fill, onFill} = colorsByInput[label].light;
    return <span key={label} style={{backgroundColor:fill.hex, color:onFill.hex}}>{label}</span>;
  });
}

export default function IssueLegend() {
  return <TextHueProvider options={options}><Legend /></TextHueProvider>;
}
```

Without a provider the hooks use TextHue defaults. The nearest provider supplies the full options object. Keep options, label arrays, and assignment settings stable between renders to reuse computed results. Replace those objects when their contents change. For incremental assignment, pass a prior result's `assignments` as `settings.pinned`.

Use `colorsByInput[label]` for rendering original props, including labels that contain whitespace or normalize to the same spelling. Use `assignments` to save one placement per normalized identity.
