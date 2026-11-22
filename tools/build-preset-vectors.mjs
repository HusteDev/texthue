import {readFile,writeFile} from 'node:fs/promises';
import {createResolver} from '../packages/npm/dist/index.js';

const rows = [];
for (const preset of ['labels','controls','chart','subdued','mono']) {
  for (const contrastModel of ['wcag2','apca']) {
    for (const explicit of [false,true]) {
      const options = {preset,contrastModel};
      if (explicit) options.contrastTarget = contrastModel === 'apca' ? 90 : 9;
      const text = 'preset';
      const colors = createResolver(options).resolve(text);
      const hex = theme => Object.fromEntries(Object.entries(theme).filter(([role])=>role!=='contrast')
        .map(([role,color])=>[role,color.hex]));
      rows.push({options,text,light:hex(colors.light),dark:hex(colors.dark)});
    }
  }
}
const output = '[\n'+rows.map(row=>JSON.stringify(row)).join(',\n')+'\n]\n';
const path = new URL('../conformance/presets-v1.json',import.meta.url);
if (process.argv[2] === '--write') await writeFile(path,output);
else if (process.argv[2] !== '--check' || (await readFile(path,'utf8')).replaceAll('\r\n','\n') !== output)
  throw Error('Preset fixtures differ');
