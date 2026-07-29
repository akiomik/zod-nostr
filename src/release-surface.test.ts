import { describe, expect, it } from "vitest";
import { zostr as classicZostr } from "./classic.js";
import { zostr as miniZostr } from "./mini.js";

/**
 * Release-surface comparison gate. Compares the current public runtime surface
 * against the last published release (v0.4.0) and requires every removed/renamed
 * path to be an explicitly-declared intentional breaking change. Additive paths
 * (new canonical namespaces, aliases) are always allowed; an *unclassified*
 * removal fails the build, so 0.5.0's breaking path changes can't drift silently
 * and a future release can't drop a path by accident.
 *
 * Scope: this checks the runtime `zostr` key tree. The package's declared type
 * contract — `package.json#exports` (`.` / `./mini`), the named type exports,
 * and classic/Mini parity — is exercised by the packed-consumer compile gate
 * (`test/consumer/`), which imports the tarball the way a real consumer does.
 */

// The full public path set as published in the last release, v0.4.0 (namespace
// nodes and leaf factories, dotted). This is release history — it does not
// change. It deliberately excludes NIP-42/45/50/67 and the NIP-10/NIP-19
// namespaces: those did not exist in v0.4.0 (NIP-42/45/50/67 were added,
// unreleased, on main and debut in 0.5.0 with canonical names; bech32/npub/...
// were root-only in v0.4.0, and gain a `nip19` namespace in 0.5.0). All of that
// is additive against v0.4.0, so it isn't part of this comparison.
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
];

// Paths from v0.4.0 that 0.5.0 intentionally removes or renames. Every entry
// must actually be gone (asserted below); anything removed but not listed here
// is unexpected drift and fails. (The NIP-42/45/50/67 interim names —
// authChallenge/countRequest/... — are NOT here: they never shipped in a
// release, so renaming them is not a removal from v0.4.0.)
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
