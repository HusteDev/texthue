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

export const brandExamples = {
  duo: [['ocean','#176b83','#73c8dc'],['sand','#c69252','#eac798']],
  studio: [['ink','#354360','#aabbe3'],['paper','#e1ceb0','#ecddc7'],
    ['vermillion','#b94d35','#ed917c'],['leaf','#577445','#a9c394']],
  market: [['berry','#91446a','#dc96ba'],['citrus','#be7229','#f3af66'],
    ['herb','#527347','#a1c591'],['plum','#665589','#bba7dc'],
    ['linen','#b39a77','#e5ceb0'],['denim','#3e678a','#90bada'],
    ['brick','#9c5144','#df998c'],['mint','#33766d','#8acbc0']],
  none: [],
};

export function editOptions(input, {preset, entry, remove, example, paletteMode}) {
  const source = input && Object.hasOwn(input, 'schema') ? editableReplay(input) : input;
  createResolver(source);
  const options = {...source};
  if (paletteMode === 'anchors') options.paletteMode = paletteMode;
  if (paletteMode === 'fixed') delete options.paletteMode;
  if (preset) options.preset = preset;
  if (example !== undefined) {
    if (!Object.hasOwn(brandExamples,example)) throw new Error('Unknown brand example');
    const entries = brandExamples[example].map(([id,light,dark]) => ({id,light,dark}));
    if (entries.length) options.palette = entries;
    else delete options.palette;
  }
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
