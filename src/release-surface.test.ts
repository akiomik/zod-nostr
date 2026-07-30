import { describe, expect, it } from "vitest";
import { zostr as classicZostr } from "./classic.js";
import { zostr as miniZostr } from "./mini.js";

/**
 * Release-surface comparison gate. Compares the current public runtime surface
 * against the last published release (v0.5.0) and requires every removed/renamed
 * path to be an explicitly-declared intentional breaking change. Additive paths
 * (new canonical namespaces, aliases, or members — e.g. the NIP-10 reply/quote
 * tag schemas added after v0.5.0) are always allowed; an *unclassified* removal
 * fails the build, so a future release can't drop a published path by accident.
 *
 * This is intentionally independent of `api-surface.test.ts`. That test asserts
 * the *current* implementation matches a hand-maintained `EXPECTED_SURFACE`, so a
 * PR that removes a public path AND edits the expectation in the same change
 * passes it. The baseline below is a frozen record of what v0.5.0 actually
 * shipped — it is not edited to track the implementation — so the same PR fails
 * here unless the removal is also declared in `INTENTIONAL_REMOVALS`. The two
 * gates catch different mistakes: api-surface catches "the surface changed
 * without acknowledgement"; this catches "a shipped path was dropped without
 * declaring it breaking".
 *
 * Scope: this checks the runtime `zostr` key tree. The package's declared type
 * contract — `package.json#exports` (`.` / `./mini`), the named type exports,
 * and classic/mini parity — is exercised by the packed-consumer compile gate
 * (`test/consumer/`), which imports the tarball the way a real consumer does.
 */

// The full public path set as published in the last release, v0.5.0 (namespace
// nodes and leaf factories, dotted). This is release history — it does not
// change. Bump it to the newly-published surface at each release (and reset
// INTENTIONAL_REMOVALS), not before.
const V0_5_0_PATHS: string[] = [
  // root aliases
  "bech32",
  "event",
  "eventId",
  "eventTemplate",
  "filter",
  "jsonCodec",
  "kind",
  "naddr",
  "nevent",
  "note",
  "nprofile",
  "npub",
  "nsec",
  "pubkey",
  "signature",
  "signatureCheck",
  "subscriptionId",
  "tags",
  "timestamp",
  "unsignedEvent",
  // nip01
  "nip01",
  "nip01.clientMessage",
  "nip01.clientMessage.any",
  "nip01.clientMessage.close",
  "nip01.clientMessage.event",
  "nip01.clientMessage.req",
  "nip01.event",
  "nip01.eventId",
  "nip01.eventTemplate",
  "nip01.filter",
  "nip01.kind",
  "nip01.metadata",
  "nip01.metadataContent",
  "nip01.metadataFields",
  "nip01.metadataFields.about",
  "nip01.metadataFields.banner",
  "nip01.metadataFields.birthday",
  "nip01.metadataFields.bot",
  "nip01.metadataFields.displayName",
  "nip01.metadataFields.lud06",
  "nip01.metadataFields.lud16",
  "nip01.metadataFields.name",
  "nip01.metadataFields.nip05",
  "nip01.metadataFields.picture",
  "nip01.metadataFields.website",
  "nip01.pubkey",
  "nip01.relayMessage",
  "nip01.relayMessage.any",
  "nip01.relayMessage.closed",
  "nip01.relayMessage.closedMessagePrefixCheck",
  "nip01.relayMessage.eose",
  "nip01.relayMessage.event",
  "nip01.relayMessage.notice",
  "nip01.relayMessage.ok",
  "nip01.relayMessage.okMessagePrefixCheck",
  "nip01.signature",
  "nip01.signatureCheck",
  "nip01.subscriptionId",
  "nip01.tags",
  "nip01.timestamp",
  "nip01.unsignedEvent",
  // nip05
  "nip05",
  "nip05.formatIdentifier",
  "nip05.identifier",
  "nip05.nostrJsonDocument",
  // nip10 (v0.5.0 shipped only textNote; the reply/quote tag schemas are additive after it)
  "nip10",
  "nip10.textNote",
  // nip11
  "nip11",
  "nip11.relayInformationDocument",
  // nip19
  "nip19",
  "nip19.bech32",
  "nip19.naddr",
  "nip19.nevent",
  "nip19.note",
  "nip19.nprofile",
  "nip19.npub",
  "nip19.nsec",
  // nip42
  "nip42",
  "nip42.authEvent",
  "nip42.challengeTagCheck",
  "nip42.clientMessage",
  "nip42.clientMessage.auth",
  "nip42.createdAtCheck",
  "nip42.relayMessage",
  "nip42.relayMessage.auth",
  "nip42.relayTagCheck",
  // nip45
  "nip45",
  "nip45.clientMessage",
  "nip45.clientMessage.count",
  "nip45.count",
  "nip45.relayMessage",
  "nip45.relayMessage.count",
  // nip50
  "nip50",
  "nip50.clientMessage",
  "nip50.clientMessage.req",
  "nip50.filter",
  // nip67
  "nip67",
  "nip67.relayMessage",
  "nip67.relayMessage.eose",
];

// Paths from v0.5.0 that a later release intentionally removes or renames. Every
// entry must actually be gone (asserted below); anything removed but not listed
// here is unexpected drift and fails. Empty until the next breaking change.
const INTENTIONAL_REMOVALS: string[] = [];

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
])("%s release surface vs v0.5.0", (_flavor, zostr) => {
  const current = currentPaths(zostr);

  it("every path removed since v0.5.0 is an intentional breaking change", () => {
    const removed = V0_5_0_PATHS.filter((p) => !current.has(p)).sort();
    expect(removed).toEqual([...INTENTIONAL_REMOVALS].sort());
  });

  it("every intentional removal is actually gone (no stale manifest entry)", () => {
    const stillPresent = INTENTIONAL_REMOVALS.filter((p) => current.has(p));
    expect(stillPresent).toEqual([]);
  });

  it("retained v0.5.0 paths still resolve", () => {
    const intentional = new Set(INTENTIONAL_REMOVALS);
    const retained = V0_5_0_PATHS.filter((p) => !intentional.has(p));
    const missing = retained.filter((p) => !current.has(p));
    expect(missing).toEqual([]);
  });
});
