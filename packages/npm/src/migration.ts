import {compareBytes} from './bytes.js';
import type {createResolver} from './index.js';
import type {Color, ThemeColors} from './types.js';

type Resolver = ReturnType<typeof createResolver>;
type Side = {resolver:Resolver; registry?:unknown};
type Theme = 'light'|'dark';
const themes = ['light','dark'] as const;
const roles = ['background','subtle','muted','fill','onFill','fillHover','fillActive','border','text','strong'] as const;
const pairs = ['fill','fillHover','fillActive','border','text','textOnSubtle','strong'] as const;

function snapshot(side:Side, labels:string[]) {
  const pins = side.registry === undefined ? {} : side.resolver.importRegistry(side.registry);
  const collection = side.resolver.assign(labels,{pinned:pins});
  const aliases = new Map(labels.map(label=>[label,side.resolver.identity(label)]));
  const collisions = themes.flatMap(theme=>{
    const groups = new Map<string,string[]>();
    for (const key of new Set(aliases.values())) {
      const hex = collection.colors[key]?.[theme].fill.hex;
      if (hex === undefined) throw new Error('Missing assigned color');
      const group = groups.get(hex) ?? [];
      group.push(key);
      groups.set(hex,group);
    }
    return [...groups].filter(([,keys])=>keys.length>1).map(([hex,identities])=>({theme,hex,identities}));
  });
  return {collection,aliases,collisions};
}

function distance(first:Color,second:Color) {
  const point = ({l,c,h}:Color['oklch']) => [l,c*Math.cos(h*Math.PI/180),c*Math.sin(h*Math.PI/180)] as const;
  const a = point(first.oklch), b = point(second.oklch);
  return Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);
}

/** Preview changes on the entire requested set, retaining each side's normalization and pins. */
export function compareAssignments(old:Side,next:Side,texts:readonly string[]) {
  const utf8 = new TextEncoder();
  const labels = [...new Set(texts)].sort((a,b)=>compareBytes(utf8.encode(a),utf8.encode(b)));
  const before = snapshot(old,labels), after = snapshot(next,labels);
  const moved:string[] = [];
  const colors:{text:string;theme:Theme;role:keyof Omit<ThemeColors,'contrast'>;before:string;after:string;deltaE:number}[]=[];
  const contrast:{text:string;theme:Theme;pair:typeof pairs[number];before:number;after:number;passedBefore:boolean;passedAfter:boolean}[]=[];
  for (const text of labels) {
    const a = before.aliases.get(text), b = after.aliases.get(text);
    if (a === undefined || b === undefined) throw new Error('Missing assignment identity');
    const p = before.collection.assignments[a], q = after.collection.assignments[b];
    const left = before.collection.colors[a], right = after.collection.colors[b];
    if (!p || !q || !left || !right) throw new Error('Missing assignment');
    if (a !== b || p.hueFraction !== q.hueFraction || p.ring !== q.ring) moved.push(text);
    for (const theme of themes) {
      for (const role of roles) {
        const x = left[theme][role], y = right[theme][role];
        if (x.hex !== y.hex) colors.push({text,theme,role,before:x.hex,after:y.hex,deltaE:distance(x,y)});
      }
      for (const pair of pairs) {
        const x = left[theme].contrast[pair], y = right[theme].contrast[pair];
        if (x.ratio !== y.ratio || x.meetsTarget !== y.meetsTarget) {
          contrast.push({text,theme,pair,before:x.ratio,after:y.ratio,passedBefore:x.meetsTarget,passedAfter:y.meetsTarget});
        }
      }
    }
  }
  return {moved,colors,contrast,collisions:{before:before.collisions,after:after.collisions}};
}
