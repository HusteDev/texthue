import assert from 'node:assert/strict';
import test from 'node:test';
import {editOptions} from '../site/editor.mjs';
import {inspect} from '../site/inspect.mjs';

test('edit presets and palette IDs while preserving unrelated settings and validating replay', () => {
  const entry = {id:'brand', light:'#112233',dark:'#667788'};
  const source = {namespace:'team'};
  const options = editOptions(source,{entry,preset:'chart'});
  const {config} = inspect({options,labels:['apple'],theme:'light',vision:'normal'});
  assert.equal(config.options.namespace,'team');
  assert.equal(config.options.preset,'chart');
  const updated = editOptions(config,{entry:{...entry,light:'#ffffff'}});
  assert.deepEqual(updated.palette,[{...entry,light:'#ffffff'}]);
  assert.equal(editOptions(updated,{entry,remove:true}).palette,undefined);
  assert.throws(() => editOptions(source,{entry,remove:true}),/Unknown palette ID/);
  assert.throws(() => editOptions({...config,fingerprint:'bad'},{entry}),/fingerprint/i);
  assert.deepEqual(source,{namespace:'team'});
});
