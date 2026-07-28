import type * as core from "zod/v4/core";
import { makeCheck } from "./checks.js";
import { zodString } from "./primitives.js";

/**
 * Fixed-length hex string schema. Lowercase-only by default (NIP-01 mandates
 * lowercase hex for ids/pubkeys/signatures); pass `caseInsensitive` for specs
 * that permit either case (e.g. NIP-45's `hll`, defined only as "hex").
 */
export function hexStringSchema(
  length: number,
  options: { caseInsensitive?: boolean } = {},
): core.$ZodString<string> {
  const charClass = options.caseInsensitive ? "0-9a-fA-F" : "0-9a-f";
  const re = new RegExp(`^[${charClass}]{${length}}$`);
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
