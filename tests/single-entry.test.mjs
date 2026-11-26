import assert from 'node:assert/strict';
import {Session} from 'node:inspector/promises';
import {test} from 'node:test';

test('single-color entry loads only renderer dependencies', async () => {
  const session = new Session();
  const modules = new Set();
  const dist = new URL('../packages/npm/dist/', import.meta.url).href;
  session.connect();
  try {
    session.on('Debugger.scriptParsed', ({params}) => {
      if (params.url.startsWith(dist)) modules.add(params.url.slice(dist.length));
    });
    await session.post('Debugger.enable');
    const {resolveTextColor, resolveTextColors} = await import('texthue/single');
    const select = {theme:'light', role:'fill'};
    assert.equal(resolveTextColor('research', select).hex, '#59b8d8');
    assert.equal(resolveTextColor('research', {...select,format:'hex'}), '#59b8d8');
    assert.deepEqual(resolveTextColor('research', {...select,format:'rgb'}), {r:89,g:184,b:216});
    assert.throws(() => resolveTextColor('research', {...select,format:'p3'}), {code:'INVALID_OPTIONS'});
    assert.equal(resolveTextColors('research').light.fill.hex, '#59b8d8');
    assert.deepEqual([...modules].sort(), [
      'bytes.js', 'color-math.js','errors.js', 'renderer.js', 'sha256.js', 'single.js', 'tables.js',
    ]);
  } finally {
    session.disconnect();
  }
});
