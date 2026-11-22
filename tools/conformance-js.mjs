import {readFileSync} from 'node:fs';
import {importConfig, resolveTextColors} from '../packages/npm/dist/index.js';

const cases = JSON.parse(readFileSync(0,'utf8'));
const output = cases.map(item => item.config
  ? importConfig(item.config).resolve(item.text)
  : resolveTextColors(item.text,item.options));
process.stdout.write(JSON.stringify(output));
