import { bech32 } from "@scure/base";
import type * as core from "zod/v4/core";
import { makeCheck } from "./core/checks.js";
import { zodString } from "./core/primitives.js";

/**
 * LUD-01 LNURL: a bech32 string with the `lnurl` HRP. LUD-01 owns the encoding;
 * the kind:0 `lud06` field that carries one is named for LUD-06, which defines
 * what the decoded URL answers with and is not validated here. Validates the
 * bech32 checksum and data-word/padding validity (an explicit 2000-char limit
 * is required; `@scure/base`'s default of 90 rejects real LNURLs). Not decoded
 * to a URL, so the target is never checked.
 */
export function lud01Schema(): core.$ZodString<string> {
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
