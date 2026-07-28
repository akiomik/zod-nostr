import * as core from "zod/v4/core";
import { makeCodec } from "./core/codecs.js";
import { zodString } from "./core/primitives.js";

/**
 * Generic codec between a JSON string and the given schema's value.
 *
 * `decode` accepts any schema: it runs `JSON.parse` then the schema, and a
 * parse failure or schema mismatch becomes a Zod issue rather than throwing.
 *
 * `encode` requires a schema that can be encoded backward (no one-way
 * `.transform()`). Zod encodes the value through the schema first, so a
 * unidirectional transform throws `$ZodEncodeError` there — a zod codec
 * property this helper does not (and cannot) turn into an issue, even via
 * `safeEncode`. Only *after* that backward-encode succeeds does the JSON step
 * run: `JSON.stringify`, with only its own raw error (e.g. a `BigInt` or a
 * circular reference) or a top-level `undefined` result turned into a Zod
 * issue. `JSON.stringify`'s other conversions (dropping nested
 * `undefined`/functions, `NaN`/`Infinity` -> `null`, `Date` -> ISO string, ...)
 * apply as usual — guarantees about which values are JSON-serializable belong in
 * the output schema, not this transport helper.
 */
export function jsonCodec<T extends core.SomeType>(
  schema: T,
): core.$ZodCodec<core.$ZodString<string>, T> {
  return makeCodec(zodString(), schema, {
    decode: (value, payload) => {
      try {
        return JSON.parse(value) as core.input<T>;
      } catch {
        payload.issues.push({
          code: "custom",
          input: value,
          message: "Invalid JSON",
        });
        return core.NEVER;
      }
    },
    encode: (value, payload) => {
      let encoded: string | undefined;
      try {
        encoded = JSON.stringify(value);
      } catch {
        payload.issues.push({
          code: "custom",
          input: value,
          message: "Value is not JSON-serializable",
        });
        return core.NEVER;
      }
      if (encoded === undefined) {
        payload.issues.push({
          code: "custom",
          input: value,
          message: "Value is not JSON-serializable",
        });
        return core.NEVER;
      }
      return encoded;
    },
  });
}
