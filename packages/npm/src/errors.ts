import type { TextColorErrorCode } from './types.js';

/** Stable error raised by TextHue public APIs. */
export class TextColorError extends Error {
  constructor(
    readonly code: TextColorErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'TextColorError';
  }
}

/** Throws a `TextColorError`; typed as `never` so callers can use it in expressions. */
export function fail(code: TextColorErrorCode, message: string): never {
  throw new TextColorError(code, message);
}
