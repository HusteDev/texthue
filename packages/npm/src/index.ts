import { type AssignmentOptions, assignCollection, type Placement } from './assignment.js';
import { fingerprint } from './fingerprint.js';
import { compileRenderer, fail, record, textValue, VERSION } from './renderer.js';
import type { TextColorOptions } from './types.js';

export type { ColorRole, Only, Selection } from './renderer.js';
export { compositeOver, measureApca, resolveTextColor, resolveTextColors, TextColorError, VERSION } from './renderer.js';
export type { Color, ColorProfile, ColorSet, ContrastResult, HSL, OKLCH, Range, RGB, TextColorErrorCode, TextColorOptions, ThemeColors, ThemeProfiles, ToneTrace } from './types.js';

export function createResolver(options: TextColorOptions = {}) {
  const {resolve,batch,color,hex,project,identity,digestOf,renderPlacement,fixedFraction,readPlacement,options:exportOptions} = compileRenderer(options);
  const assign = (texts:readonly string[], {pinned = {}, markers = false, vision}: AssignmentOptions & {pinned?: Record<string,Placement>} = {}) =>
    assignCollection(texts,pinned,identity,digestOf,renderPlacement,fixedFraction,markers,vision);
  const exportConfig = () => {
    const payload = {schema:'texthue-config-v1',algorithm:VERSION,options:structuredClone(exportOptions())};
    return {...payload, fingerprint:fingerprint(payload)};
  };
  const registryAssignments = (input:unknown) => {
    if (!input || typeof input !== 'object' || Array.isArray(input)) fail('INVALID_OPTIONS','Invalid registry assignments');
    const result:Record<string,Placement> = Object.create(null);
    for (const [name,raw] of Object.entries(input)) {
      textValue(name,'registry key','INVALID_OPTIONS');
      result[name] = readPlacement(raw);
    }
    return result;
  };
  const exportRegistry = (assignments:Record<string,Placement>) => ({
    schema:'texthue-registry-v1',algorithm:VERSION,fingerprint:exportConfig().fingerprint,
    assignments:registryAssignments(assignments)
  });
  const importRegistry = (input:unknown) => {
    const saved = record(input,['schema','algorithm','fingerprint','assignments'],'registry');
    if (saved.schema !== 'texthue-registry-v1' || saved.algorithm !== VERSION ||
        saved.fingerprint !== exportConfig().fingerprint) fail('INVALID_OPTIONS','Incompatible assignment registry');
    return registryAssignments(saved.assignments);
  };
  return {resolve,batch,color,hex,assign,project,exportConfig,exportRegistry,importRegistry,identity};
}

export function exportConfig(resolver: ReturnType<typeof createResolver>) {
  return resolver.exportConfig();
}

export function importConfig(value: unknown) {
  const saved = record(value,['schema','algorithm','options','fingerprint'],'configuration');
  if (saved.schema !== 'texthue-config-v1' || saved.algorithm !== VERSION || typeof saved.fingerprint !== 'string') {
    fail('INVALID_OPTIONS','Unsupported configuration schema or algorithm');
  }
  const resolver = createResolver(saved.options as TextColorOptions);
  const exported = resolver.exportConfig();
  if (exported.fingerprint !== saved.fingerprint || fingerprint({
    schema:saved.schema,algorithm:saved.algorithm,options:saved.options
  }) !== saved.fingerprint) fail('INVALID_OPTIONS','Configuration fingerprint mismatch');
  return resolver;
}

export function assignTextColors(texts: readonly string[], options: TextColorOptions = {}, pinned: Record<string,Placement> = {}, presentation: AssignmentOptions = {}) {
  return createResolver(options).assign(texts,{...presentation,pinned});
}
export { cssVariables, toCss } from './css.js';

export {compareAssignments} from './migration.js';
