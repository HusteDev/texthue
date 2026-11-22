import assert from 'node:assert/strict';
import {TextHueProvider, useAssignedColors, useTextColors} from '@texthue/react';
import {JSDOM} from 'jsdom';
import {createElement} from 'react';
import {createResolver} from 'texthue';

const dom = new JSDOM('<main></main>');
globalThis.window = dom.window;
globalThis.document = dom.window.document;
const {createRoot} = await import('react-dom/client');
const {flushSync} = await import('react-dom');
const container = document.querySelector('main');
const root = createRoot(container);
function Sample({labels}) {
  const color = useTextColors(labels[0]);
  const {colors} = useAssignedColors(labels);
  return createElement('span',null,JSON.stringify([color.light.fill.hex, Object.keys(colors)]));
}

function check(options,labels) {
  flushSync(() => root.render(createElement(TextHueProvider,{options},createElement(Sample,{labels}))));
  const resolver = createResolver(options);
  assert.deepEqual(JSON.parse(container.textContent), [
    resolver.resolve(labels[0]).light.fill.hex, Object.keys(resolver.assign(labels).colors),
  ]);
}

const labels = ['research','design'];
const options = {overrides:{research:'#123456',design:'#abcdef'}};
check(undefined,labels);
check(options,labels);
check(options,['design','another']);
flushSync(() => root.unmount());
assert.equal(container.textContent,'');
dom.window.close();
