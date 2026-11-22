import {editOptions} from './editor.mjs';
import {markerGlyph, registryCss, swatchSheet} from './exports.mjs';

const form = document.querySelector('form');
const results = document.querySelector('#results');
const status = document.querySelector('[role=status]');
let worker;
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
  results.replaceChildren();
  const field = id => document.getElementById(id).value;
  try {
    const input = {labels:field('labels').split(/\r?\n/).filter(Boolean), options:JSON.parse(field('options')),
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
      const {rows, diagnostics, findings, config, registry} = data.result;
      status.textContent = rows.length + ' distinct labels';
      const table = append(results, 'table');
      const head = append(table, 'tr');
      for (const title of ['Label','Hash','Assigned','Registry']) append(head,'th',title);
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
        for (const hex of row.swatches) {
          const cell = append(line,'td');
          const chip = append(cell,'span','■ ');
          chip.style.color = hex;
          cell.append(hex);
        }
      }
      for (const [title,items] of [
        ['Normalized aliases',findings.aliases], ['Closest pairs in selected vision profile',findings.closest],
        ['Exact duplicate registry fills',findings.duplicates], ['Pairs below minimum distance',findings.belowMinimum],
      ]) details(results,`${title} (${items.length})`,items);
      details(results,'Registry palette distances (row indices start at zero)',diagnostics);
      for (const row of rows) details(results,row.label,{contrast:row.contrast,fill:row.fill,registryFillTrace:row.registryFillTrace,css:row.variables});
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
          if (worker !== active) return;
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
form.onsubmit = event => { event.preventDefault(); run(); };
run();
