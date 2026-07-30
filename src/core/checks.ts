import * as core from "zod/v4/core";

/**
 * Builds a plain check that depends only on `zod/v4/core`, so it can be
 * passed to `.check()` on either classic zod or zod/mini.
 * This mirrors zod's own `check()` helper (just attaches fn to a core.$ZodCheck).
 */
export function makeCheck<T>(
  fn: core.CheckFn<T>,
  def: Partial<core.$ZodCheckDef> = {},
): core.$ZodCheck<T> {
  const ch = new core.$ZodCheck({ check: "custom", ...def });
  ch._zod.check = fn;
  return ch;
}

/**
 * Check factory for a non-negative integer (an integer `>= 0`). Used for count,
 * length, and duration fields — event limits, byte lengths, seconds, PoW
 * difficulty — where fractional, negative, and non-finite values (`NaN`/
 * `Infinity`, which `JSON.stringify` would emit as `null`) are never valid. `0`
 * is allowed. Pass `max` to also cap the value at a spec-defined encoding bound
 * (e.g. NIP-19's 32-bit unsigned pointer kind). `label` names the field in the
 * error message.
 */
export function nonNegativeIntegerCheck(
  label: string,
  max?: number,
): core.$ZodCheck<number> {
  return makeCheck<number>((payload) => {
    const value = payload.value;
    if (
      !Number.isInteger(value) ||
      value < 0 ||
      (max !== undefined && value > max)
    ) {
      payload.issues.push({
        code: "custom",
        input: value,
        message:
          max === undefined
            ? `Invalid ${label} (expected a non-negative integer)`
            : `Invalid ${label} (expected an integer in 0..${max})`,
      });
    }
  });
}

/**
 * Compiled regex for an integer as it appears **on the wire** (a tag value is
 * always a string): one or more decimal digits, sign-prefixed only when
 * `signed`. No canonical encoding is imposed (leading zeros pass). Single source
 * shared by {@link integerStringCheck} (the schema) and callers that need a bare
 * predicate — NIP-13's committed-target lookup, NIP-40's not-expired check — so
 * the two can't drift, the same split as `hexPattern`.
 */
export function integerStringPattern(
  options: { signed?: boolean } = {},
): RegExp {
  return options.signed ? /^-?\d+$/ : /^\d+$/;
}

/**
 * Check factory for a wire integer string (see {@link integerStringPattern}) —
 * the string counterpart of {@link nonNegativeIntegerCheck}, for numeric values
 * carried as tag strings. `label` names the field and `expected` is the
 * field-specific "(expected …)" phrase, both in the error message; `signed`
 * allows a leading `-` (a count is unsigned; a unix timestamp may be negative).
 */
export function integerStringCheck(
  label: string,
  expected: string,
  options: { signed?: boolean } = {},
): core.$ZodCheck<string> {
  const re = integerStringPattern(options);
  return makeCheck<string>((payload) => {
    if (!re.test(payload.value)) {
      payload.issues.push({
        code: "custom",
        input: payload.value,
        message: `Invalid ${label} (expected ${expected})`,
      });
    }
  });
}

/**
 * Check factory for a non-negative finite number (`>= 0`, not `NaN`/`Infinity`).
 * Unlike {@link nonNegativeIntegerCheck} this allows fractions, for amount
 * fields whose unit is caller-defined and may be sub-unit (e.g. NIP-11
 * `fees[].amount`, which is not normatively an integer). `label` names the
 * field in the error message.
 */
export function nonNegativeNumberCheck(label: string): core.$ZodCheck<number> {
  return makeCheck<number>((payload) => {
    const value = payload.value;
    if (!Number.isFinite(value) || value < 0) {
      payload.issues.push({
        code: "custom",
        input: value,
        message: `Invalid ${label} (expected a non-negative number)`,
      });
    }
  });
}

/**
 * Check factory for a non-empty array (at least one element). NIP-01 requires
 * every tag to carry at least its tag name, and a filter's `ids`/`authors`/
 * `kinds`/`"#<letter>"` arrays to list at least one value when the field is
 * present (an empty array would match nothing, which is expressed by omitting
 * the field, not by sending `[]`). `label` names the field in the error message.
 */
export function nonEmptyArrayCheck(label: string): core.$ZodCheck<unknown[]> {
  return makeCheck<unknown[]>((payload) => {
    if (payload.value.length === 0) {
      payload.issues.push({
        code: "custom",
        input: payload.value,
        message: `Invalid ${label} (expected a non-empty array)`,
      });
    }
  });
}

export interface NostrEventLike {
  id: string;
  pubkey: string;
  created_at: number;
  kind: number;
  tags: string[][];
  content: string;
  sig: string;
}

/**
 * Shared message for an event whose `tags` is not an array. A tag-scanning check
 * can't run at all on such an event, so it fails with this single verbatim
 * message; centralizing it keeps the wording identical across the per-NIP tag
 * checks (`nip40.expirationCheck`, `nip70.protectedCheck`, …).
 */
const MALFORMED_TAGS_MESSAGE =
  'Invalid event (expected "tags" to be an array of tags)';

/**
 * Reads an event's `tags` for a tag-scanning check, guarding the untyped JS
 * path. A non-array `tags` is a malformed event (not one merely lacking the
 * scanned tag), so this pushes {@link MALFORMED_TAGS_MESSAGE} and returns
 * `undefined` — the caller returns without scanning. Otherwise it returns the
 * tags array to iterate; individual non-array tag **elements** are still skipped
 * per-tag via {@link isNamedTag}. Shared by the event-tag checks so the guard
 * and its message can't drift between them.
 */
export function guardEventTags(
  payload: core.ParsePayload<NostrEventLike>,
): string[][] | undefined {
  const { tags } = payload.value;
  if (!Array.isArray(tags)) {
    payload.issues.push({
      code: "custom",
      input: payload.value,
      message: MALFORMED_TAGS_MESSAGE,
    });
    return undefined;
  }
  return tags;
}

/**
 * True when `tag` is a well-formed tag whose name (its first element) equals
 * `name`. Guards `Array.isArray` so a `null`/non-array tag reaching a check on
 * the untyped JS path is skipped rather than throwing on index access — the
 * per-tag half of the scan {@link guardEventTags} sets up.
 */
export function isNamedTag(tag: unknown, name: string): tag is string[] {
  return Array.isArray(tag) && tag[0] === name;
}

/**
 * Check factory for event signature verification. Takes verifyEvent as a
 * parameter to keep the core layer decoupled from nostr-tools (also helps testability).
 */
export function signatureCheck(
  verifyEvent: (event: NostrEventLike) => boolean,
): core.$ZodCheck<NostrEventLike> {
  return makeCheck<NostrEventLike>((payload) => {
    if (!verifyEvent(payload.value)) {
      payload.issues.push({
        code: "custom",
        input: payload.value,
        message: "Invalid Nostr event signature",
      });
    }
  });
}
