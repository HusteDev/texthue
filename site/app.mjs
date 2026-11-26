import {editOptions} from './editor.mjs';
import {markerGlyph, registryCss, swatchSheet} from './exports.mjs';

const form = document.querySelector('form');
const results = document.querySelector('#results');
const status = document.querySelector('[role=status]');
let worker;
let baseline;
function append(parent, tag, value) {
  const element = document.createElement(tag);
  if (value !== undefined) element.textContent = value;
  parent.append(element);
  return element;
}
const dialog = document.querySelector('#help-dialog');
dialog.querySelector('button').onclick = () => dialog.close();
function addHelp(parent, term, [definition, guidePath]) {
  const button = append(parent, 'button', '?');
  button.type = 'button';
  button.className = 'help-button';
  button.setAttribute('aria-label', 'Help for ' + term);
  button.setAttribute('aria-haspopup', 'dialog');
  button.setAttribute('aria-controls', dialog.id);
  button.onclick = () => {
    dialog.querySelector('h2').textContent = term;
    dialog.querySelector('p').textContent = definition;
    dialog.querySelector('a').href = 'https://github.com/HusteDev/texthue/blob/main/docs/' + guidePath;
    dialog.showModal();
  };
}
const fieldHelp = {
  labels: ['Each distinct label gets a row. Add a name, then select Generate Palette to see its colors.', 'GUIDE.md#preview-a-collection-in-the-palette-inspector'],
  options: ['JSON settings control how colors are generated. Leave {} for the defaults, or paste a downloaded configuration and select Generate Palette.', 'CONFIGURATION.md#replay-a-configuration'],
  'config-file': ['Opening a configuration fills the options box and recalculates the table immediately.', 'CONFIGURATION.md#replay-a-configuration'],
  preset: ['Labels gives tags a moderate amount of color. Controls uses the same color range and raises the default WCAG contrast target from 4.5 to 7. Chart uses more saturated fills. Subdued uses less saturated fills. Mono generates grays. Apply preset updates the options and regenerates the swatches.', 'CONFIGURATION.md#algorithm-and-options'],
  'brand-mode': ['Fixed brand palette uses the supplied fills exactly. Brand anchors generate related colors around the supplied hues, with lightness and chroma drawn from the label hash. Choose a brand example or enter your own colors.', 'CONFIGURATION.md#fixed-brand-palette-and-brand-anchors'],
  'brand-example': ['Choose an example to replace the brand entries and regenerate the palette. Each entry has a stable ID and separate light and dark fills. Try the duo with three or more labels to see colors repeat, then try the eight-color set. Select Clear palette to return to generated hues.', 'INSPECTOR.md'],
  'brand-id': ['Give this brand color a reusable name. Use the same ID to update or remove the entry.', 'CONFIGURATION.md#brand-palettes-and-overrides'],
  'brand-light': ['The fill for this brand entry on the light theme. Select Add or update color to apply it.', 'CONFIGURATION.md#brand-palettes-and-overrides'],
  'brand-dark': ['The fill for this brand entry on the dark theme. Select Add or update color to apply it.', 'CONFIGURATION.md#brand-palettes-and-overrides'],
  theme: ['Select Generate Palette to view the fills and background contrast for the light or dark theme.', 'GUIDE.md#render-a-badge'],
  vision: ['Normal shows the original colors. Protan simulates reduced red-cone sensitivity; deutan simulates reduced green-cone sensitivity. Both can make reds and greens harder to distinguish. Tritan simulates reduced blue-cone sensitivity and can make blues and greens look similar. Compare the swatches and closest pairs. Code values stay in the original colors.', 'GUIDE.md#find-labels-that-need-another-visual-cue'],
  'optimize-vision': ['Score new placements for separation in both typical vision and the selected simulation. Existing saved placements keep their assignments.', 'GUIDE.md#find-labels-that-need-another-visual-cue'],
  markers: ['Add a shape beside each label so color is only one way to recognize it.', 'GUIDE.md#find-labels-that-need-another-visual-cue'],
  'minimum-distance': ['OKLab distance measures how different two colors look. Larger values mean more separation. Raise this threshold and inspect Pairs below minimum distance to find similar colors.', 'GUIDE.md#find-labels-that-need-another-visual-cue'],
  registry: ['A registry is a saved map from labels to color placements. Download the registry and its configuration. Load both when adding labels to keep earlier placements fixed. Without a saved registry, Registry starts with the same placements as Assigned.', 'GUIDE.md#restore-a-registry-and-add-a-label'],
  'registry-file': ['Opening a saved registry fills the registry box and recalculates the palette immediately.', 'GUIDE.md#restore-a-registry-and-add-a-label']
};
for (const [id, definition] of Object.entries(fieldHelp)) {
  const input = document.getElementById(id);
  const label = input.closest('label');
  const title = label.textContent.replace(input.textContent, '').trim() || label.textContent.trim();
  const group = document.createElement('div');
  group.className = 'field-control';
  label.before(group);
  const heading = append(group,'div');
  heading.className = 'field-title';
  heading.append(label);
  if (input.type !== 'checkbox') {
    label.htmlFor = id;
    group.append(input);
  }
  addHelp(heading, title, definition);
}
function details(parent, title, data, explanation) {
  const group = append(parent, 'details');
  append(group, 'summary', title);
  append(group, 'p', explanation);
  group.addEventListener('toggle', () => {
    if (group.open && !group.querySelector('pre')) append(group, 'pre', JSON.stringify(data, null, 2));
  });
}
function download(title, filename, type, serialize) {
  const button = append(results, 'button', title);
  button.type = 'button';
  button.onclick = () => {
    const blob = new Blob([serialize()], {type});
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  };
}
function sharePalette(parent, input) {
  const button = append(parent, 'button', 'Copy link to this palette');
  button.type = 'button';
  let manual;
  button.onclick = async () => {
    const url = new URL(location.pathname, location.origin);
    url.hash = 'palette=' + encodeURIComponent(JSON.stringify({version:1, ...input}));
    try {
      await navigator.clipboard.writeText(url.href);
      if (button.isConnected) status.textContent = 'Palette link copied';
    } catch {
      if (!button.isConnected) return;
      if (!manual) {
        const label = append(parent, 'label', 'Select and copy palette link');
        manual = append(label, 'textarea');
        manual.readOnly = true;
      }
      manual.value = url.href;
      manual.focus();
      manual.select();
    }
  };
}
function restorePalette(fragment) {
  const state = JSON.parse(decodeURIComponent(fragment));
  if (state.version !== 1 || !Array.isArray(state.labels) ||
      !state.labels.every(label => typeof label === 'string' && !/[\r\n]/.test(label)) ||
      !['light','dark'].includes(state.theme) ||
      !['normal','protan','deutan','tritan'].includes(state.vision) ||
      typeof state.markers !== 'boolean' || typeof state.optimizeVision !== 'boolean' ||
      !Number.isFinite(state.minimumDistance) || state.minimumDistance < 0 ||
      !state.options || typeof state.options !== 'object' || Array.isArray(state.options)) {
    throw new Error('Invalid palette link');
  }
  const field = id => document.getElementById(id);
  field('labels').value = state.labels.join('\n');
  field('options').value = JSON.stringify(state.options, null, 2);
  field('registry').value = state.registry ? JSON.stringify(state.registry, null, 2) : '';
  field('theme').value = state.theme;
  field('vision').value = state.vision;
  field('preset').value = state.options.options?.preset ?? state.options.preset ?? 'labels';
  field('markers').checked = state.markers;
  field('optimize-vision').checked = state.optimizeVision;
  field('minimum-distance').value = state.minimumDistance;
  baseline = state.baseline;
}
function run() {
  worker?.terminate();
  worker = undefined;
  const field = id => document.getElementById(id).value;
  try {
    const input = {baseline, labels:field('labels').split(/\r?\n/).filter(Boolean), options:JSON.parse(field('options')),
      theme:field('theme'), vision:field('vision'), optimizeVision:document.getElementById('optimize-vision').checked,
      minimumDistance:document.getElementById('minimum-distance').valueAsNumber, markers:document.getElementById('markers').checked, registry:field('registry') && JSON.parse(field('registry'))};
    const active = new Worker(new URL('./worker.mjs', import.meta.url), {type:'module'});
    worker = active;
    status.textContent = 'Computing palette…';
    active.onerror = event => { if (worker === active) status.textContent = event.message; };
    active.onmessage = ({data}) => {
      if (worker !== active) return;
      active.terminate();
      if (data.error) { status.textContent = data.error; return; }
      const {rows, diagnostics, findings, config, registry, migration} = data.result;
      status.textContent = rows.length + ' distinct labels';
      document.getElementById('brand-mode').value = config.options.paletteMode ?? 'fixed';
      results.replaceChildren();
      sharePalette(results, input);
      if (migration) details(results,'Changes from comparison baseline',migration,'Compare this run with the saved baseline to see which labels, placements, or theme colors changed.');
      const compare = append(results,'button',baseline ? 'Clear comparison baseline' : 'Use this palette as comparison baseline');
      compare.type = 'button';
      compare.onclick = () => {
        if (baseline) {
          baseline = undefined;
          run();
        } else {
          baseline = {config,registry};
          compare.textContent = 'Clear comparison baseline';
          status.textContent = 'Baseline saved. Inspect another configuration to compare the current labels.';
          if (worker && worker !== active) run();
        }
      };
      const table = append(results, 'table');
      append(table, 'caption', 'Palette comparison');
      const head = append(table, 'tr');
      for (const title of ['Label','Hash','Assigned','Registry']) {
        const heading = append(append(head,'th'),'div');
        heading.className = 'field-title';
        append(heading,'span',title);
        const meaning = {
          Hash:['Color calculated from the label alone. Adding another label preserves this value.', 'ASSIGNMENT.md#the-same-username-appears-in-three-apps'],
          Assigned:['Color chosen with the other labels in this set to improve separation.', 'COLORS.md#assigning-a-collection'],
          Registry:['Color from the persistent placement. Download the registry to reuse this assignment later.', 'GUIDE.md#restore-a-registry-and-add-a-label']
        }[title];
        if (meaning) addHelp(heading,title,meaning);
      }
      const surfaces = append(results,'details');
      append(surfaces,'summary','Fill contrast against the page');
      append(surfaces,'p','These ratios describe how a badge surface stands out from the page. For badge text readability, check the onFill and fill pair in the full color set.');
      const surfaceTable = append(surfaces,'table');
      const surfaceHead = append(surfaceTable,'tr');
      append(surfaceHead,'th','Label');
      append(surfaceHead,'th','Registry fill / background (sRGB)');
      if (config.options.gamut === 'display-p3') append(surfaceHead,'th','Registry fill / background (Display-P3)');
      for (const row of rows) {
        const line = append(table, 'tr');
        const labelCell = append(line,'th');
        if (row.marker) {
          const shape = append(labelCell,'span',markerGlyph(row.marker));
          shape.setAttribute('role','img');
          shape.setAttribute('aria-label',row.marker);
          labelCell.append(' ');
        }
        labelCell.append(row.label);
        for (const [index,hex] of row.swatches.entries()) {
          const cell = append(line,'td');
          const chip = append(cell,'span','■ ');
          chip.style.color = hex;
          if (row.nativeSwatches) {
            chip.style.color = row.nativeSwatches[index];
            chip.title = row.nativeSwatches[index];
          }
          cell.append(hex);
          const set = row.colorSets[index];
          details(cell,'Fill attributes',set[input.theme].fill,
            `Original ${input.theme} fill returned by the library. Use fill.hex for CSS or fill.rgb for channel values. Vision simulations affect the preview only.`);
          details(cell,'Full color set',set,'The complete API result includes both themes, every color role, and contrast measurements.');
        }
        const surfaceRow = append(surfaceTable,'tr');
        append(surfaceRow,'th',row.label);
        append(surfaceRow,'td',`${row.fillOnBackground.srgbRatio.toFixed(2)}:1`);
        if (config.options.gamut === 'display-p3') {
          append(surfaceRow,'td',`${row.fillOnBackground.displayP3LuminanceRatio.toFixed(2)}:1`);
        }
      }
      for (const [title,items,meaning] of [
        ['Normalized aliases',findings.aliases,'Input spellings that become the same label after normalization.'], ['Closest pairs in selected vision profile',findings.closest,'The registry pairs with the smallest OKLab distance in this preview. Check these labels first for confusion.'],
        ['Exact duplicate registry fills',findings.duplicates,'Labels whose registry fills have identical colors in this preview.'], ['Pairs below minimum distance',findings.belowMinimum,'Pairs closer than your Minimum OKLab distance setting. Increase the threshold to flag more pairs.'],
        ['Placement searches below target after 24 positions across scored themes and profiles',findings.exhaustedSearches,'Placements that tried all 24 candidate positions and still fell below your distance threshold.'],
      ]) details(results,`${title} (${items.length})`,items,meaning);
      details(results,'Registry palette distances (row indices start at zero)',diagnostics,'Distances for every pair of registry fills, plus summary statistics. Index 0 refers to the first label row.');
      for (const row of rows) details(results,row.label,{contrast:row.contrast,fillOnBackground:row.fillOnBackground,fill:row.fill,registryFillTrace:row.registryFillTrace,css:row.variables},'Registry details for this label: contrast by role, fill against background, the steps used to generate that fill, and reusable CSS variables.');
      download('Download configuration', 'texthue-config.json', 'application/json', () => JSON.stringify(config, null, 2));
      download('Download registry', 'texthue-registry.json', 'application/json', () => JSON.stringify(registry, null, 2));
      download('Download swatch sheet', 'texthue-swatches.svg', 'image/svg+xml', () => swatchSheet(rows, input.theme, input.vision));
      const copy = append(results, 'button', 'Copy registry CSS');
      copy.onclick = async () => {
        const css = registryCss(rows);
        try {
          await navigator.clipboard.writeText(css);
          if (worker === active) status.textContent = 'Registry CSS copied';
        } catch {
          if (!copy.isConnected) return;
          const label = append(results, 'label', 'Select and copy registry CSS');
          const field = append(label, 'textarea');
          field.readOnly = true;
          field.value = css;
          field.focus();
          field.select();
        }
      };
    };
    active.postMessage(input);
  } catch (error) { status.textContent = error.message; }
}
function applyEdit(change) {
  const options = document.getElementById('options');
  try {
    options.value = JSON.stringify(editOptions(JSON.parse(options.value), change), null, 2);
    run();
  } catch (error) {
    worker?.terminate();
    worker = undefined;
    status.textContent = error.message;
  }
}
document.getElementById('apply-preset').onclick = () => applyEdit({preset:document.getElementById('preset').value});
document.getElementById('brand-mode').onchange = event => applyEdit({paletteMode:event.target.value});
document.getElementById('brand-example').onchange = event => {
  if (event.target.value) applyEdit({example:event.target.value});
  event.target.value = '';
};
function editBrand(remove) {
  applyEdit({remove, entry:{
    id:document.getElementById('brand-id').value,
    light:document.getElementById('brand-light').value,
    dark:document.getElementById('brand-dark').value,
  }});
}
document.getElementById('save-entry').onclick = () => editBrand(false);
document.getElementById('remove-entry').onclick = () => editBrand(true);
for (const [picker, destination] of [['config-file', 'options'], ['registry-file', 'registry']]) {
  const input = document.getElementById(picker);
  const field = document.getElementById(destination);
  input.onchange = async () => {
    const file = input.files[0];
    if (!file) return;
    const previous = field.value;
    try {
      const content = await file.text();
      if (input.files[0] !== file || field.value !== previous) return;
      JSON.parse(content);
      field.value = content;
      run();
    } catch (error) {
      if (input.files[0] === file) status.textContent = error.message;
    } finally {
      if (input.files[0] === file) input.value = '';
    }
  };
}
form.onsubmit = event => { event.preventDefault(); run(); };
const query = new URLSearchParams(location.search);
function selectExample(parameter, id) {
  const value = query.get(parameter);
  const select = document.getElementById(id);
  if (value && Array.from(select.options).some(option => option.value === value)) {
    select.value = value;
    return value;
  }
}
const preset = selectExample('preset', 'preset');
const example = selectExample('brand', 'brand-example');
const vision = selectExample('vision', 'vision');
const paletteMode = selectExample('mode', 'brand-mode');
if (preset || example || paletteMode) {
  document.getElementById('options').value = JSON.stringify(editOptions({}, {preset, example, paletteMode}), null, 2);
}
if (vision) {
  document.getElementById('labels').value = ['Design', 'Research', 'Platform', 'Support', 'Finance', 'Operations'].join('\n');
}

function openPalette() {
  try {
    if (location.hash.startsWith('#palette=')) restorePalette(location.hash.slice('#palette='.length));
    run();
  } catch {
    worker?.terminate();
    worker = undefined;
    status.textContent = 'This palette link could not be loaded. Enter labels and select Generate Palette to start a new palette.';
  }
}
window.addEventListener('hashchange', openPalette);
openPalette();
