import {Session} from 'node:inspector/promises';
import {createResolver} from '../packages/npm/dist/index.js';

// Read V8 entry counts for the production functions without instrumenting shipped code.
export async function rendererWork(measure, extraColorFunctions = []) {
  const session = new Session();
  session.connect();
  try {
    await session.post('Profiler.enable');
    await session.post('Profiler.startPreciseCoverage', {callCount:true, detailed:false});
    measure();
    const {result} = await session.post('Profiler.takePreciseCoverage');
    function calls(module, name) {
      const url = new URL(`../packages/npm/dist/${module}.js`,import.meta.url).href;
      const script = result.find(entry => entry.url === url);
      const fn = script?.functions.find(entry => entry.functionName === name);
      if (!fn) throw new Error(`Missing coverage for ${module}.${name}`);
      return fn.ranges[0].count;
    }
    return {
      fits:calls('color-math','fitColor'), cusps:calls('color-math','cusp'), hashes:calls('sha256','sha256'),
      ...Object.fromEntries(extraColorFunctions.map(name => [name,calls('color-math',name)])),
    };
  } finally {
    session.disconnect();
  }
}

export async function contrastWork() {
  const reports = {};
  for (const [name,target,light] of [
    ['default',4.5,'#ffffff'], ['aaa',7,'#ffffff'], ['maximum',21,'#ffffff'],
    ['gray',4.5,'#777777'], ['impossible',21,'#777777'],
  ]) {
    const resolver = createResolver({contrastTarget:target,backgrounds:{light}});
    reports[name] = await rendererWork(() => {
      for (let i=0; i<100; i++) resolver.resolve(`item:${i}`);
    });
  }
  return reports;
}
