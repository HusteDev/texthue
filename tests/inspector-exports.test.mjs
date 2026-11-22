import assert from 'node:assert/strict';
import test from 'node:test';
import {registryCss, swatchSheet} from '../site/exports.mjs';
import {inspect} from '../site/inspect.mjs';

test('SVG reflects the preview and CSS preserves underlying registry colors', () => {
  const label = '<tag>&pear';
  const {rows} = inspect({labels:[label],options:{},theme:'dark',vision:'deutan'});
  const svg = swatchSheet(rows,'dark','deutan');
  assert.ok(svg.includes('&lt;tag&gt;&amp;pear'));
  assert.ok(svg.includes('dark · deutan'));
  for (const hex of rows[0].swatches) assert.ok(svg.includes('fill="' + hex + '"'));
  const css = registryCss(rows);
  assert.ok(css.startsWith(':root {'));
  for (const [name,value] of Object.entries(rows[0].variables)) assert.ok(css.includes(name + ': ' + value + ';'));
  assert.equal(css.includes('<tag>'),false);
});

test('shape sheet preserves every assigned marker across vision changes', () => {
  const input = {labels:Array.from({length:128}, (_,i) => String(i)),options:{},theme:'light',vision:'normal',markers:true};
  const first = inspect(input);
  const replay = inspect({...input,vision:'deutan',registry:first.registry});
  assert.deepEqual(first.rows.map(row => row.marker),replay.rows.map(row => row.marker));
  const shapes = new Set(first.rows.map(row => row.marker));
  assert.equal(shapes.size,8);
  const sheet = swatchSheet(replay.rows,'light','deutan');
  for (const shape of shapes) assert.ok(sheet.includes(`<title>${shape}</title>`));
});
