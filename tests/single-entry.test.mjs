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
    assert.equal(resolveTextColors('research').light.fill.hex, '#59b8d8');
    assert.deepEqual([...modules].sort(), [
      'bytes.js', 'color-math.js', 'renderer.js', 'sha256.js', 'single.js', 'tables.js',
    ]);
  } finally {
    session.disconnect();
  }
});
