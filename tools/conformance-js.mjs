import {readFileSync} from 'node:fs';
import {createResolver, importConfig} from '../packages/npm/dist/index.js';

const cases = JSON.parse(readFileSync(0,'utf8'));
const output = cases.map(item => {
  const resolver = Object.hasOwn(item,'config') ? importConfig(item.config) : createResolver(item.options);
  return item.exportConfig ? resolver.exportConfig() : resolver.resolve(item.text);
});
process.stdout.write(JSON.stringify(output));
