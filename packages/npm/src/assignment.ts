import type { ColorSet } from './types.js';

export interface Placement { hueFraction: number; ring: number; moved: boolean }

const wrap = (x: number) => x - Math.floor(x);

function place(natural: number, occupied: Placement[], separation: number): Placement {
  for (let ring = 0; ; ring++) {
    const neighbors = occupied.filter(p => p.ring === ring);
    for (let i = 0; i < 385; i++) {
      const step = Math.ceil(i / 2) * (i % 2 === 0 ? 1 : -1);
      const hueFraction = wrap(natural + step * (separation / 4));
      if (neighbors.every(p => {
        const d = Math.abs(p.hueFraction - hueFraction);
        return Math.min(d, 1 - d) >= separation;
      })) return { hueFraction, ring, moved: i > 0 || ring > 0 };
    }
  }
}

export function assignCollection(texts: readonly string[], pinned: Record<string,Placement>,
  normalize: (text:string) => string, hash: (text:string) => DataView,
  render: (digest:DataView, placement:Placement, name:string) => ColorSet, fixed: (name:string,digest:DataView)=>number|undefined) {
  const names = new Set(texts.map(normalize));
  const entries = Array.from(names, name => ({name, digest: hash(name)}));
  entries.sort((a,b) => {
    for (let i = 0; i < 32; i++) {
      const d = a.digest.getUint8(i) - b.digest.getUint8(i);
      if (d) return d;
    }
    return 0;
  });
  const assignments: Record<string,Placement> = Object.create(null);
  const colors: Record<string,ColorSet> = Object.create(null);
  for (const [key,p] of Object.entries(pinned)) {
    const name = normalize(key);
    if (!p || !Number.isFinite(p.hueFraction) || p.hueFraction < 0 || p.hueFraction >= 1 ||
      !Number.isSafeInteger(p.ring) || p.ring < 0 || typeof p.moved !== 'boolean' || Object.hasOwn(assignments,name)) {
      throw new TypeError('Invalid pinned placement');
    }
    assignments[name] = {...p};
    names.add(name);
  }
  for (const {name,digest} of entries) {
    const fraction = fixed(name,digest);
    if (fraction !== undefined && !Object.hasOwn(assignments,name)) assignments[name] = {hueFraction:fraction,ring:0,moved:false};
  }
  const occupied = Object.values(assignments);
  const separation = Math.min(1/12, Math.max(1/24, 1/names.size));
  for (const {name,digest} of entries) {
    if (!Object.hasOwn(assignments,name)) {
      const p = place(digest.getUint32(0) / 4294967296,occupied,separation);
      assignments[name] = p;
      occupied.push(p);
    }
    const placement = assignments[name];
    if (placement) colors[name] = render(digest,placement,name);
  }
  let minDistance: number | null = null;
  let closestPairs: [string,string][] = [];
  const points = entries.map(({name}) => {
    const color = colors[name];
    if (!color) throw new Error('Missing assigned color');
    const {l,c,h} = color.light.fill.oklch;
    return {name,l,a:c*Math.cos(h*Math.PI/180),b:c*Math.sin(h*Math.PI/180)};
  });
  for (const [index,first] of points.entries()) {
    for (const second of points.slice(index + 1)) {
      const distance = Math.hypot(first.l-second.l, first.a-second.a, first.b-second.b);
      if (minDistance === null || distance < minDistance) {
        minDistance = distance;
        closestPairs = [];
      }
      if (distance === minDistance) closestPairs.push([first.name,second.name]);
    }
  }
  return {colors,assignments,report:{minDistance,closestPairs,
    withinRingCapacity:names.size <= 5*Math.floor(1/separation),
    distinctFills:new Set(Object.values(colors).map(c => c.light.fill.hex)).size === entries.length}};
}
