import type * as core from "zod/v4/core";
import { makeCheck } from "./checks.js";
import { zodString } from "./primitives.js";

/**
 * Compiled regex for a fixed-length hex string — the single source of the hex
 * id/key/signature format. Used by {@link hexStringSchema} and by callers that
 * need a bare predicate rather than a schema (e.g. NIP-13's `powCheck` guards a
 * raw event id with `hexPattern(64).test(id)`), so the two can't drift apart.
 */
export function hexPattern(
  length: number,
  options: { caseInsensitive?: boolean } = {},
): RegExp {
  const charClass = options.caseInsensitive ? "0-9a-fA-F" : "0-9a-f";
  return new RegExp(`^[${charClass}]{${length}}$`);
}

/**
 * Fixed-length hex string schema. Lowercase-only by default (NIP-01 mandates
 * lowercase hex for ids/pubkeys/signatures); pass `caseInsensitive` for specs
 * that permit either case (e.g. NIP-45's `hll`, defined only as "hex").
 */
export function hexStringSchema(
  length: number,
  options: { caseInsensitive?: boolean } = {},
): core.$ZodString<string> {
  const re = hexPattern(length, options);
  const expected = options.caseInsensitive ? "hex" : "lowercase hex";
  return zodString([
    makeCheck<string>((payload) => {
      if (!re.test(payload.value)) {
        payload.issues.push({
          code: "invalid_format",
          format: "regex",
          input: payload.value,
          message: `Invalid hex string (expected ${length}-char ${expected})`,
        });
      }
    }),
  ]);
}
