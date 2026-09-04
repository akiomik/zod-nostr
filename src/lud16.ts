import type * as core from "zod/v4/core";
import { makeCheck } from "./core/checks.js";
import { zodString } from "./core/primitives.js";
import { isInternetIdentifierDomain } from "./internet-identifier.js";

/** LUD-16 local part: `<username>[+<tag>]@<domain>`, single non-empty tag, lowercase */
const LUD16_LOCAL_PART = /^[a-z0-9._-]+(?:\+[a-z0-9._-]+)?$/;

/**
 * LUD-16 lightning address (`<username>[+<tag>]@<domain>`).
 *
 * The canonical default identifier `_@<domain>` is accepted like any other
 * username, but LUD-16's `@<domain>` shorthand for it is not: the spec makes
 * that shorthand optional and says a wallet that does not implement it MAY
 * reject `@<domain>` as invalid, so rejecting it is the strict-by-default
 * reading. Compose a union if you want to accept the shorthand.
 */
export function lud16Schema(): core.$ZodString<string> {
  return zodString([
    makeCheck<string>((payload) => {
      const value = payload.value;
      const separator = value.indexOf("@");
      if (separator <= 0 || separator !== value.lastIndexOf("@")) {
        payload.issues.push({
          code: "custom",
          input: value,
          message: "Invalid LUD-16 address",
        });
        return;
      }
      if (!LUD16_LOCAL_PART.test(value.slice(0, separator))) {
        payload.issues.push({
          code: "custom",
          input: value,
          message: "Invalid LUD-16 name",
        });
        return;
      }
      if (!isInternetIdentifierDomain(value.slice(separator + 1))) {
        payload.issues.push({
          code: "custom",
          input: value,
          message: "Invalid LUD-16 domain",
        });
      }
    }),
  ]);
}
