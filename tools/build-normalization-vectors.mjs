import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { createResolver } from '../packages/npm/dist/index.js';

const namespace = '\u0085ＮE\u0301  ';
const seed = 101;
const rows = [];
for (const unicode of ['none','NFC','NFKC']) for (const casing of ['none','lower']) {
  for (const whitespace of ['none','trim','collapse']) {
    const normalize = {unicode, case:casing, whitespace};
    const transform = input => {
      let value = unicode === 'none' ? input : input.normalize(unicode);
      if (casing === 'lower') value = value.toLowerCase();
      if (whitespace !== 'none') value = value.replace(/^\p{White_Space}+|\p{White_Space}+$/gu,'');
      if (whitespace === 'collapse') value = value.replace(/\p{White_Space}+/gu,' ');
      return value;
    };
    const scope = Buffer.from(transform(namespace));
    const header = Buffer.alloc(8);
    header.writeUInt32BE(seed);
    header.writeUInt32BE(scope.length,4);
    const resolver = createResolver({normalize,namespace,seed});
    for (const text of ['  E\u0301\tΣ  ','ＦＯＯ\u00a0\u0085İ','\ufeffA\u001c','ΣΟΣ','𐐀']) {
      const digest = createHash('sha256').update('text-to-color-v1\0').update(header).update(scope).update(transform(text)).digest('hex');
      rows.push({text,namespace,seed,normalize,digest,hue:resolver.resolve(text).hue});
    }
  }
}
const output = '[\n'+rows.map(row=>JSON.stringify(row)).join(',\n')+'\n]\n';
const file = new URL('../conformance/normalization-v1.json',import.meta.url);
if (process.argv[2] === '--write') await writeFile(file,output);
else if (process.argv[2] !== '--check' || (await readFile(file,'utf8')).replaceAll('\r\n','\n') !== output)
  throw Error('Normalization fixtures differ');
