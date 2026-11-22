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
function run() {
  worker?.terminate();
  worker = undefined;
  results.replaceChildren();
  const field = id => document.getElementById(id).value;
  try {
    const input = {labels:field('labels').split(/\r?\n/).filter(Boolean), options:JSON.parse(field('options')),
      theme:field('theme'), vision:field('vision'), registry:field('registry') && JSON.parse(field('registry'))};
    const active = new Worker('./worker.mjs', {type:'module'});
    worker = active;
    status.textContent = 'Computing palette…';
    active.onerror = event => { if (worker === active) status.textContent = event.message; };
    active.onmessage = ({data}) => {
      if (worker !== active) return;
      active.terminate();
      if (data.error) { status.textContent = data.error; return; }
      const {rows, diagnostics, registry} = data.result;
      status.textContent = rows.length + ' distinct labels';
      const table = append(results, 'table');
      const head = append(table, 'tr');
      for (const title of ['Label','Hash','Assigned','Registry']) append(head,'th',title);
      for (const row of rows) {
        const line = append(table, 'tr');
        append(line,'th',row.label);
        for (const hex of row.swatches) {
          const cell = append(line,'td');
          const chip = append(cell,'span','■ ');
          chip.style.color = hex;
          cell.append(hex);
        }
      }
      details(results,'Registry palette distances (row indices start at zero)',diagnostics);
      for (const row of rows) details(results,row.label,{contrast:row.contrast,fill:row.fill,css:row.variables});
      details(results,'Export registry JSON',registry);
    };
    active.postMessage(input);
  } catch (error) { status.textContent = error.message; }
}
form.onsubmit = event => { event.preventDefault(); run(); };
run();
