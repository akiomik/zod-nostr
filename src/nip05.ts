import type * as core from "zod/v4/core";
import { makeCheck } from "./core/checks.js";
import { zodString } from "./core/primitives.js";

const NIP05_LOCAL_PART = /^[a-z0-9._-]+$/i;

export function nip05IdentifierSchema(): core.$ZodString<string> {
  return zodString([
    makeCheck<string>((payload) => {
      const identifier = payload.value;
      const separator = identifier.indexOf("@");
      if (separator <= 0 || separator !== identifier.lastIndexOf("@")) {
        payload.issues.push({
          code: "custom",
          input: identifier,
          message: "Invalid NIP-05 identifier",
        });
        return;
      }

      const localPart = identifier.slice(0, separator);
      const domain = identifier.slice(separator + 1);
      if (!NIP05_LOCAL_PART.test(localPart)) {
        payload.issues.push({
          code: "custom",
          input: identifier,
          message: "Invalid NIP-05 local part",
        });
        return;
      }

      try {
        const url = new URL(`https://${domain}`);
        if (
          url.host.toLowerCase() !== domain.toLowerCase() ||
          url.pathname !== "/" ||
          url.search ||
          url.hash
        ) {
          throw new Error("Invalid NIP-05 domain");
        }
      } catch {
        payload.issues.push({
          code: "custom",
          input: identifier,
          message: "Invalid NIP-05 domain",
        });
      }
    }),
  ]);
}

export const formatNip05Identifier = (identifier: string): string =>
  identifier.startsWith("_@") ? identifier.slice(2) : identifier;
