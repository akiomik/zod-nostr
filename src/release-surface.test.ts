import { describe, expect, it } from "vitest";
import { zostr as classicZostr } from "./classic.js";
import { zostr as miniZostr } from "./mini.js";

/**
 * Release-surface comparison gate. Compares the current public surface against
 * the last published release (v0.4.0) and requires every removed/renamed path to
 * be an explicitly-declared intentional breaking change. Additive paths (new
 * canonical namespaces, aliases) are always allowed; an *unclassified* removal
 * fails the build, so 0.5.0's breaking path changes can't drift silently and a
 * future release can't drop a path by accident.
 */

// The full public path set as published in v0.4.0 (namespace nodes and leaf
// factories, dotted). This is release history — it does not change.
const V0_4_0_PATHS: string[] = [
  // root
  "pubkey",
  "eventId",
  "signature",
  "timestamp",
  "kind",
  "tags",
  "eventTemplate",
  "unsignedEvent",
  "event",
  "signatureCheck",
  "subscriptionId",
  "filter",
  "bech32",
  "jsonCodec",
  "npub",
  "nsec",
  "note",
  "nprofile",
  "nevent",
  "naddr",
  "relayMessage",
  "relayMessage.event",
  "relayMessage.ok",
  "relayMessage.eose",
  "relayMessage.closed",
  "relayMessage.notice",
  "relayMessage.any",
  "relayMessage.okMessagePrefixCheck",
  "relayMessage.closedMessagePrefixCheck",
  "clientMessage",
  "clientMessage.event",
  "clientMessage.req",
  "clientMessage.close",
  "clientMessage.any",
  "nip05",
  "nip05.identifier",
  "nip05.nostrJsonDocument",
  "nip05.formatIdentifier",
  "nip01",
  "nip01.metadata",
  "nip01.metadataContent",
  "nip01.textNote",
  "nip01.metadataFields",
  "nip01.metadataFields.name",
  "nip01.metadataFields.about",
  "nip01.metadataFields.picture",
  "nip01.metadataFields.displayName",
  "nip01.metadataFields.website",
  "nip01.metadataFields.banner",
  "nip01.metadataFields.bot",
  "nip01.metadataFields.birthday",
  "nip01.metadataFields.nip05",
  "nip01.metadataFields.lud16",
  "nip01.metadataFields.lud06",
  "nip11",
  "nip11.relayInformationDocument",
  "nip42",
  "nip42.authEvent",
  "nip42.authChallenge",
  "nip42.authRequest",
  "nip42.challengeTagCheck",
  "nip42.relayTagCheck",
  "nip42.createdAtCheck",
  "nip45",
  "nip45.count",
  "nip45.countRequest",
  "nip45.countResponse",
  "nip50",
  "nip50.filter",
  "nip50.req",
  "nip67",
  "nip67.eose",
];

// Paths from v0.4.0 that 0.5.0 intentionally removes or renames. Every entry
// must actually be gone (asserted below); anything removed but not listed here
// is unexpected drift and fails.
const INTENTIONAL_REMOVALS: string[] = [
  // root relay/client message namespaces -> nip01.*
  "relayMessage",
  "relayMessage.event",
  "relayMessage.ok",
  "relayMessage.eose",
  "relayMessage.closed",
  "relayMessage.notice",
  "relayMessage.any",
  "relayMessage.okMessagePrefixCheck",
  "relayMessage.closedMessagePrefixCheck",
  "clientMessage",
  "clientMessage.event",
  "clientMessage.req",
  "clientMessage.close",
  "clientMessage.any",
  // textNote -> nip10.textNote (its NIP-10 canonical owner)
  "nip01.textNote",
  // directional message renames
  "nip42.authChallenge", // -> nip42.relayMessage.auth
  "nip42.authRequest", // -> nip42.clientMessage.auth
  "nip45.countRequest", // -> nip45.clientMessage.count
  "nip45.countResponse", // -> nip45.relayMessage.count
  "nip50.req", // -> nip50.clientMessage.req
  "nip67.eose", // -> nip67.relayMessage.eose
];

function currentPaths(zostr: object): Set<string> {
  const paths = new Set<string>();
  const walk = (node: Record<string, unknown>, prefix: string): void => {
    for (const [key, value] of Object.entries(node)) {
      const path = prefix ? `${prefix}.${key}` : key;
      paths.add(path);
      if (value !== null && typeof value === "object") {
        walk(value as Record<string, unknown>, path);
      }
    }
  };
  walk(zostr as Record<string, unknown>, "");
  return paths;
}

describe.each([
  ["classic", classicZostr],
  ["mini", miniZostr],
])("%s release surface vs v0.4.0", (_flavor, zostr) => {
  const current = currentPaths(zostr);

  it("every path removed since v0.4.0 is an intentional breaking change", () => {
    const removed = V0_4_0_PATHS.filter((p) => !current.has(p)).sort();
    expect(removed).toEqual([...INTENTIONAL_REMOVALS].sort());
  });

  it("every intentional removal is actually gone (no stale manifest entry)", () => {
    const stillPresent = INTENTIONAL_REMOVALS.filter((p) => current.has(p));
    expect(stillPresent).toEqual([]);
  });

  it("retained v0.4.0 paths still resolve", () => {
    const intentional = new Set(INTENTIONAL_REMOVALS);
    const retained = V0_4_0_PATHS.filter((p) => !intentional.has(p));
    const missing = retained.filter((p) => !current.has(p));
    expect(missing).toEqual([]);
  });
});
