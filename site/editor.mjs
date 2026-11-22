import {createResolver, importConfig} from '../packages/npm/dist/index.js';

// Replay records store effective values. Recover preset-dependent defaults before editing.
function editableReplay(input) {
  const options = importConfig(input).exportConfig().options;
  const defaults = createResolver({preset:options.preset, contrastModel:options.contrastModel ?? 'wcag2'}).exportConfig().options;
  const inheritedTargets = createResolver({
    preset:options.preset, contrastModel:options.contrastModel ?? 'wcag2', contrastTarget:options.contrastTarget,
  }).exportConfig().options.contrastTargets;
  if (options.contrastTarget === defaults.contrastTarget) delete options.contrastTarget;
  for (const role of Object.keys(options.contrastTargets)) {
    if (options.contrastTargets[role] === inheritedTargets[role]) delete options.contrastTargets[role];
  }
  for (const theme of ['light','dark']) {
    for (const role of ['fill','text']) {
      const profile = options.profiles[theme][role];
      const scale = defaults.profiles[theme][role].chromaScale;
      if (profile.chromaScale.every((value,index) => value === scale[index])) delete profile.chromaScale;
    }
  }
  return options;
}

export function editOptions(input, {preset, entry, remove}) {
  const source = input && Object.hasOwn(input, 'schema') ? editableReplay(input) : input;
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
