import {createResolver, importConfig} from '../packages/npm/dist/index.js';

export function editOptions(input, {preset, entry, remove}) {
  const source = input && Object.hasOwn(input, 'schema') ? importConfig(input).exportConfig().options : input;
  createResolver(source);
  const options = {...source};
  if (preset) options.preset = preset;
  if (entry) {
    if (!entry.id) throw new Error('Enter a palette ID');
    const palette = [...(options.palette ?? [])];
    const index = palette.findIndex(item => item.id === entry.id);
    if (remove) {
      if (index < 0) throw new Error('Unknown palette ID');
      palette.splice(index, 1);
    } else if (index < 0) palette.push(entry);
    else palette[index] = entry;
    if (palette.length) options.palette = palette;
    else delete options.palette;
  }
  createResolver(options);
  return options;
}
