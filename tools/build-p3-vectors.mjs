import {readFile,writeFile} from 'node:fs/promises';
import Color from 'colorjs.io';

const inside = coords => coords.every(v=>v>=-1e-12 && v<=1+1e-12);
const quantize = coords => coords.map(v=>Math.round(255*Math.max(0,Math.min(1,v))));
const rows = [];
for (const l of [0.2,0.5,0.8]) {
  for (const c of [0.04,0.25,0.4]) {
    for (let h=0;h<360;h+=30) {
      const color = chroma=>new Color('oklch',[l,chroma,h]);
      let retained=c;
      if (!inside(color(c).to('p3-linear').coords)) {
        let lo=0,hi=c;
        for(let i=0;i<24;i++) {
          const mid=(lo+hi)/2;
          if(inside(color(mid).to('p3-linear').coords)) lo=mid;
          else hi=mid;
        }
        retained=lo;
      }
      const rgb=quantize(color(retained).to('p3').coords);
      const rendered=new Color('p3',rgb.map(v=>v/255));
      rows.push({l,c,h,rgb,fallback:quantize(rendered.to('srgb').coords),clipped:!inside(rendered.to('srgb-linear').coords)});
    }
  }
}
const expected=`[\n${rows.map(row=>JSON.stringify(row)).join(',\n')}\n]\n`;
const path=new URL('../conformance/p3-fit-v1.json',import.meta.url);
if(process.argv[2]==='--write') await writeFile(path,expected);
else if(process.argv[2]!=='--check'||(await readFile(path,'utf8')).replaceAll('\r\n','\n')!==expected) throw new Error('P3 oracle fixture mismatch');
