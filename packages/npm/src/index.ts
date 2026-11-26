import { type AssignmentOptions, assignCollection, type Placement } from './assignment.js';
import { behaviorFingerprint, fingerprint } from './config-digest.js';
import { compileRenderer, fail, record, textValue, VERSION } from './renderer.js';
import type { TextColorOptions } from './types.js';

export type { ColorRole, Only, Selection } from './renderer.js';
export {
  compositeOver,
  measureApca,
  resolveTextColor,
  resolveTextColors,
  TextColorError,
  VERSION,
} from './renderer.js';
export type {
  Color,
  ColorProfile,
  ColorSet,
  ContrastResult,
  DisplayP3,
  HSL,
  OKLCH,
  Range,
  RGB,
  TextColorErrorCode,
  TextColorOptions,
  ThemeColors,
  ThemeProfiles,
  ToneTrace,
} from './types.js';

export function createResolver(options: TextColorOptions = {}) {
  const {
    resolve,
    batch,
    color,
    hex,
    project,
    identity,
    digestOf,
    renderPlacement,
    fixedFraction,
    readPlacement,
    segments,
    exclusions,
    options: exportOptions,
  } = compileRenderer(options);
  const assign = (
    texts: readonly string[],
    settings: AssignmentOptions & { pinned?: Record<string, Placement> } = {},
  ) => {
    record(settings, ['pinned', 'markers', 'vision'], 'assignment');
    const { pinned = {}, markers = false, vision } = settings;
    return assignCollection(
      texts,
      pinned,
      identity,
      digestOf,
      renderPlacement,
      fixedFraction,
      markers,
      vision,
    );
  };
  let digest: string | undefined;
  const behaviorDigest = () =>
    (digest ??= behaviorFingerprint(VERSION, exportOptions(), identity, segments, exclusions));
  const exportConfig = () => ({
    schema: 'texthue-config-v2',
    algorithm: VERSION,
    options: structuredClone(exportOptions()),
    fingerprint: behaviorDigest(),
  });
  const registryAssignments = (input: unknown) => {
    if (!input || typeof input !== 'object' || Array.isArray(input))
      fail('INVALID_OPTIONS', 'Invalid registry assignments');
    const result: Record<string, Placement> = Object.create(null);
    for (const [name, raw] of Object.entries(input)) {
      textValue(name, 'registry key', 'INVALID_OPTIONS');
      result[name] = readPlacement(raw);
    }
    return result;
  };
  const exportRegistry = (assignments: Record<string, Placement>) => ({
    schema: 'texthue-registry-v2',
    algorithm: VERSION,
    fingerprint: behaviorDigest(),
    assignments: registryAssignments(assignments),
  });
  const importRegistry = (input: unknown) => {
    const saved = record(input, ['schema', 'algorithm', 'fingerprint', 'assignments'], 'registry');
    const expected =
      saved.schema === 'texthue-registry-v1'
        ? fingerprint({ schema: 'texthue-config-v1', algorithm: VERSION, options: exportOptions() })
        : saved.schema === 'texthue-registry-v2'
          ? behaviorDigest()
          : null;
    if (!expected || saved.algorithm !== VERSION || saved.fingerprint !== expected)
      fail('INVALID_OPTIONS', 'Incompatible assignment registry');
    return registryAssignments(saved.assignments);
  };
  return {
    resolve,
    batch,
    color,
    hex,
    assign,
    project,
    exportConfig,
    exportRegistry,
    importRegistry,
    identity,
  };
}

export type Resolver = ReturnType<typeof createResolver>;
export type { AssignmentOptions, Marker, Placement } from './assignment.js';

/** @deprecated Use resolver.exportConfig(). */
export function exportConfig(resolver: Resolver) {
  return resolver.exportConfig();
}

export function importConfig(value: unknown) {
  const saved = record(value, ['schema', 'algorithm', 'options', 'fingerprint'], 'configuration');
  if (
    (saved.schema !== 'texthue-config-v1' && saved.schema !== 'texthue-config-v2') ||
    saved.algorithm !== VERSION ||
    saved.options === null ||
    typeof saved.options !== 'object' ||
    typeof saved.fingerprint !== 'string'
  ) {
    fail('INVALID_OPTIONS', 'Unsupported configuration schema or algorithm');
  }
  const resolver = createResolver(saved.options as TextColorOptions);
  const exported = resolver.exportConfig();
  if (saved.schema === 'texthue-config-v1') {
    const legacyDigest = (options: unknown) =>
      fingerprint({ schema: saved.schema, algorithm: VERSION, options });
    if (
      legacyDigest(saved.options) !== saved.fingerprint ||
      legacyDigest(exported.options) !== saved.fingerprint
    )
      fail('INVALID_OPTIONS', 'Configuration fingerprint mismatch');
  } else if (exported.fingerprint !== saved.fingerprint)
    fail('INVALID_OPTIONS', 'Configuration fingerprint mismatch');
  return resolver;
}

export interface CollectionOptions extends AssignmentOptions {
  resolver?: TextColorOptions;
  pinned?: Record<string, Placement>;
}

export function assignTextColors(
  texts: readonly string[],
  settings?: CollectionOptions,
): ReturnType<Resolver['assign']>;
/** @deprecated Pass a single settings object with resolver, pinned, markers and vision. */
export function assignTextColors(
  texts: readonly string[],
  options: TextColorOptions | undefined,
  pinned?: Record<string, Placement>,
  presentation?: AssignmentOptions,
): ReturnType<Resolver['assign']>;
export function assignTextColors(
  texts: readonly string[],
  options: CollectionOptions | TextColorOptions = {},
  pinned?: Record<string, Placement>,
  presentation?: AssignmentOptions,
) {
  if (
    options &&
    ['resolver', 'pinned', 'markers', 'vision'].some((key) => Object.hasOwn(options, key))
  ) {
    record(options, ['resolver', 'pinned', 'markers', 'vision'], 'collection options');
    if (pinned !== undefined || presentation !== undefined)
      fail('INVALID_OPTIONS', 'Conflicting collection arguments');
    const { resolver, ...settings } = options as CollectionOptions;
    return createResolver(resolver).assign(texts, settings);
  }
  return createResolver(options as TextColorOptions).assign(texts, {
    ...presentation,
    pinned: pinned === undefined ? {} : pinned,
  });
}
export { cssVariables, toCss } from './css.js';

export { compareAssignments } from './migration.js';
