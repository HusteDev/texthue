import assert from 'node:assert/strict';
import test from 'node:test';
import {TextHueProvider, useAssignedColors, useTextColors} from '@texthue/react';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createResolver} from 'texthue';

test('React hooks resolve synchronously and use the nearest provider for registry assignments', () => {
  const labels = ['research','design'];
  const options = {overrides:{research:'#123456'}};
  const resolver = createResolver(options);
  const settings = {pinned:resolver.assign(['design','previous']).assignments,markers:true};
  function Sample({expected}) {
    const color = useTextColors('research');
    const assigned = useAssignedColors(labels,settings);
    assert.deepEqual(color,expected.resolve('research'));
    assert.deepEqual(assigned,expected.assign(labels,settings));
    return createElement('span',null,color.light.fill.hex);
  }
  const defaultSample = createElement(Sample,{expected:createResolver()});
  const provided = createElement(TextHueProvider,{options},
    createElement(Sample,{expected:resolver}),
    createElement(TextHueProvider,null,defaultSample));
  assert.equal(renderToStaticMarkup(defaultSample),'<span>#59b8d8</span>');
  assert.equal(renderToStaticMarkup(provided),'<span>#123456</span><span>#59b8d8</span>');
});
