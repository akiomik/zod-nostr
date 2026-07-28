import type * as core from "zod/v4/core";
import { makeCheck } from "./core/checks.js";
import { hexStringSchema } from "./core/hex.js";
import {
  zodArray,
  zodObject,
  zodOptional,
  zodRecord,
  zodString,
} from "./core/primitives.js";

const NIP05_LOCAL_PART = /^[a-z0-9._-]+$/i;

/**
 * Shared internet-identifier domain check for `<local-part>@<domain>`
 * identifiers (NIP-05 and LUD-16): `<domain>` must be a bare host with no
 * path, query, or fragment.
 */
export function isInternetIdentifierDomain(domain: string): boolean {
  try {
    const url = new URL(`https://${domain}`);
    return (
      url.host.toLowerCase() === domain.toLowerCase() &&
      url.pathname === "/" &&
      !url.search &&
      !url.hash
    );
  } catch {
    return false;
  }
}

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

      if (!isInternetIdentifierDomain(domain)) {
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

function nip05NameSchema(): core.$ZodString<string> {
  return zodString([
    makeCheck<string>((payload) => {
      if (!NIP05_LOCAL_PART.test(payload.value)) {
        payload.issues.push({
          code: "custom",
          input: payload.value,
          message: "Invalid NIP-05 local part",
        });
      }
    }),
  ]);
}

/**
 * The `.well-known/nostr.json` document a NIP-05 domain serves in response
 * to `GET /.well-known/nostr.json?name=<local-part>`. `names` is required
 * per spec (local-part -> lowercase 64-char hex pubkey); `relays` is the
 * spec's "recommended" optional attribute (pubkey -> relay URL list).
 * Unknown top-level keys are stripped silently, matching NIP-11's treatment
 * of forward-compatible fields.
 */
export function nostrJsonDocumentSchema() {
  return zodObject({
    names: zodRecord(nip05NameSchema(), hexStringSchema(64)),
    relays: zodOptional(zodRecord(hexStringSchema(64), zodArray(zodString()))),
  });
}

export const nip05 = {
  identifier: nip05IdentifierSchema,
  nostrJsonDocument: nostrJsonDocumentSchema,
  formatIdentifier: formatNip05Identifier,
};
