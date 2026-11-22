import { toOklab } from './color-math.js';
import { type Vision, visionPoint } from './diagnostics.js';
import type { ColorSet, Triple } from './types.js';

export interface Placement { hueFraction: number; ring: number; moved: boolean }

const shapes = ['circle', 'square', 'triangle', 'diamond', 'star', 'cross', 'pentagon', 'hexagon'] as const;
export type Marker = (typeof shapes)[number];

export interface AssignmentOptions { markers?: boolean; vision?: readonly (Vision | 'normal')[] }

function worstDistance(points: Triple[], occupied: Triple[][]) {
  let minimum = Infinity;
  for (const previous of occupied) {
    for (const [index, point] of points.entries()) {
      const other = previous[index];
      if (!other) throw new Error('Missing vision projection');
      minimum = Math.min(minimum, Math.hypot(point[0]-other[0], point[1]-other[1], point[2]-other[2]));
    }
  }
  return minimum;
}

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
  render: (digest:DataView, placement:Placement, name:string) => ColorSet, fixed: (name:string,digest:DataView)=>number|undefined, includeMarkers = false, vision?: AssignmentOptions['vision']) {
  if (vision !== undefined && (!Array.isArray(vision) || !vision.length ||
      Array.from(vision).some(v => !['normal','protan','deutan','tritan'].includes(v)))) throw new TypeError('Invalid vision profiles');
  if (typeof includeMarkers !== 'boolean') throw new TypeError('markers must be a boolean');
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
  const markers: Record<string,Marker> | undefined = includeMarkers ? Object.create(null) : undefined;
  const projections: Triple[][] = [];
  const searches: {label:string; positionsConsidered:number; colorsEvaluated:number; bestDistance:number|null}[] = [];
  const pointsFor = (set:ColorSet) => (vision ?? []).flatMap(profile =>
    [visionPoint(set.light.fill.hex,profile), visionPoint(set.dark.fill.hex,profile)]);
  if (vision) {
    for (const [name,placement] of Object.entries(assignments)) {
      projections.push(pointsFor(render(hash(name),placement,name)));
    }
  }
  const occupied = Object.values(assignments);
  const separation = Math.min(1/12, Math.max(1/24, 1/names.size));
  for (const {name,digest} of entries) {
    if (!Object.hasOwn(assignments,name)) {
      const natural = digest.getUint32(0) / 4294967296;
      let p = place(natural,occupied,separation);
      if (vision) {
        let bestPoints = pointsFor(render(digest,p,name));
        let best = worstDistance(bestPoints,projections);
        const initial = p;
        let positionsConsidered = 1;
        let colorsEvaluated = 1;
        for (let step = 1; step < 24 && best !== Infinity; step++) {
          positionsConsidered++;
          const hueFraction = wrap(initial.hueFraction + step / 24);
          if (occupied.some(other => {
            const delta = Math.abs(other.hueFraction - hueFraction);
            return other.ring === initial.ring && Math.min(delta,1-delta) < separation;
          })) continue;
          const candidate = {...initial,hueFraction,moved:true};
          colorsEvaluated++;
          const candidatePoints = pointsFor(render(digest,candidate,name));
          const score = worstDistance(candidatePoints,projections);
          if (score > best) {
            best = score;
            p = candidate;
            bestPoints = candidatePoints;
          }
        }
        searches.push({label:name, positionsConsidered, colorsEvaluated, bestDistance:best === Infinity ? null : best});
        projections.push(bestPoints);
      }
      assignments[name] = p;
      occupied.push(p);
    }
    const placement = assignments[name];
    if (markers) {
      const shape = shapes[digest.getUint8(31) % shapes.length];
      if (shape === undefined) throw new Error('Invalid marker index');
      markers[name] = shape;
    }
    if (placement) colors[name] = render(digest,placement,name);
  }
  let minDistance: number | null = null;
  let closestPairs: [string,string][] = [];
  const points = entries.map(({name}) => {
    const color = colors[name];
    if (!color) throw new Error('Missing assigned color');
    const {r,g,b} = color.light.fill.rgb;
    const [l, a, blueYellow] = toOklab([r,g,b]);
    return {name,l,a,b:blueYellow};
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
  return {colors,assignments,...(markers && {markers}),report:{minDistance,closestPairs,...(vision && {searches}),
    withinRingCapacity:names.size <= 5*Math.floor(1/separation),
    distinctFills:new Set(Object.values(colors).map(c => c.light.fill.hex)).size === entries.length}};
}
