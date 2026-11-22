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
function details(parent, title, data) {
  const group = append(parent, 'details');
  append(group, 'summary', title);
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
function run() {
  worker?.terminate();
  worker = undefined;
  const field = id => document.getElementById(id).value;
  try {
    const input = {baseline, labels:field('labels').split(/\r?\n/).filter(Boolean), options:JSON.parse(field('options')),
      theme:field('theme'), vision:field('vision'), optimizeVision:document.getElementById('optimize-vision').checked,
      minimumDistance:document.getElementById('minimum-distance').valueAsNumber, markers:document.getElementById('markers').checked, registry:field('registry') && JSON.parse(field('registry'))};
    const active = new Worker('./worker.mjs', {type:'module'});
    worker = active;
    status.textContent = 'Computing palette…';
    active.onerror = event => { if (worker === active) status.textContent = event.message; };
    active.onmessage = ({data}) => {
      if (worker !== active) return;
      active.terminate();
      if (data.error) { status.textContent = data.error; return; }
      const {rows, diagnostics, findings, config, registry, migration} = data.result;
      status.textContent = rows.length + ' distinct labels';
      results.replaceChildren();
      if (migration) details(results,'Changes from comparison baseline',migration);
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
      const head = append(table, 'tr');
      for (const title of ['Label','Hash','Assigned','Registry','Registry fill / background (sRGB)']) append(head,'th',title);
      if (config.options.gamut === 'display-p3') append(head,'th','Registry fill / background (Display-P3)');
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
        }
        append(line,'td',`${row.fillOnBackground.srgbRatio.toFixed(2)}:1`);
        if (config.options.gamut === 'display-p3') {
          append(line,'td',`${row.fillOnBackground.displayP3LuminanceRatio.toFixed(2)}:1`);
        }
      }
      for (const [title,items] of [
        ['Normalized aliases',findings.aliases], ['Closest pairs in selected vision profile',findings.closest],
        ['Exact duplicate registry fills',findings.duplicates], ['Pairs below minimum distance',findings.belowMinimum],
        ['Placement searches below target after 24 positions across scored themes and profiles',findings.exhaustedSearches],
      ]) details(results,`${title} (${items.length})`,items);
      details(results,'Registry palette distances (row indices start at zero)',diagnostics);
      for (const row of rows) details(results,row.label,{contrast:row.contrast,fillOnBackground:row.fillOnBackground,fill:row.fill,registryFillTrace:row.registryFillTrace,css:row.variables});
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
run();
