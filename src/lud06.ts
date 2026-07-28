import { bech32 } from "@scure/base";
import type * as core from "zod/v4/core";
import { makeCheck } from "./core/checks.js";
import { zodString } from "./core/primitives.js";

/**
 * LUD-06 LNURL: a bech32 string with the `lnurl` HRP. Validates the bech32
 * checksum and data-word/padding validity (an explicit 2000-char limit is
 * required; `@scure/base`'s default of 90 rejects real LNURLs). Not decoded to
 * a URL — LUD-01 URL validation is out of scope.
 */
export function lud06Schema(): core.$ZodString<string> {
  return zodString([
    makeCheck<string>((payload) => {
      const value = payload.value;
      try {
        // `bech32.decode` types its input as a `<hrp>1<data>` template literal;
        // a malformed string throws and is caught below.
        const { prefix, words } = bech32.decode(
          value as `${string}1${string}`,
          2000,
        );
        if (prefix !== "lnurl" || words.length === 0) {
          throw new Error("not an lnurl");
        }
        bech32.fromWords(words);
      } catch {
        payload.issues.push({
          code: "custom",
          input: value,
          message: "Invalid LNURL (expected a bech32-encoded lnurl string)",
        });
      }
    }),
  ]);
}
