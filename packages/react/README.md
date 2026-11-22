# TextHue for React

Use `useTextColors(label)` to resolve a single identity. Use `useAssignedColors(labels, settings)` when the labels appear together and need collection assignment. Both hooks return the core resolver result during render.

```jsx
import {TextHueProvider, useAssignedColors} from '@texthue/react';

const options = {namespace: 'issues'};
const labels = ['bug', 'enhancement', 'question'];

function Legend() {
  const {colors} = useAssignedColors(labels);
  return labels.map(label => {
    const {fill, onFill} = colors[label].light;
    return <span key={label} style={{backgroundColor:fill.hex, color:onFill.hex}}>{label}</span>;
  });
}

export default function IssueLegend() {
  return <TextHueProvider options={options}><Legend /></TextHueProvider>;
}
```

Without a provider the hooks use TextHue defaults. The nearest provider supplies the full options object. Keep options, label arrays, and assignment settings stable between renders to reuse computed results. Replace those objects when their contents change. For incremental assignment, pass a prior result's `assignments` as `settings.pinned`.
