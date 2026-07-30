import { describe, expect, it } from "vitest";
import { zostr as classicZostr } from "./classic.js";
import { zostr as miniZostr } from "./mini.js";

/**
 * Regression coverage for the full public surface. Two gaps this guards against:
 *
 * 1. A schema defined in a src/nipXX.ts module but never wired into
 *    classic.ts/mini.ts's exported `zostr` object (the original reason this file
 *    exists — zostr.nip05() once existed in source but was unreachable).
 * 2. The canonical-owner / re-export contract drifting: every public API has one
 *    canonical owner path, and every other appearance (a root alias, or an
 *    in-catalog re-export like `nip01.metadataFields.nip05`) is a **direct
 *    reference** to its canonical factory (so `zostr.event === zostr.nip01.event`
 *    and `zostr.nip01.metadataFields.nip05 === zostr.nip05.identifier`); classic
 *    and mini expose an identical key tree.
 *
 * The expected surface below IS the release contract: an intentional change to
 * it must be a deliberate edit here (and a CHANGELOG entry), not silent drift.
 */

// A surface descriptor: `FN` marks a callable factory leaf; a nested object
// marks a sub-namespace whose keys are described recursively.
const FN = "fn" as const;
type Surface = { [key: string]: typeof FN | Surface };

const RELAY_MESSAGE: Surface = {
  event: FN,
  ok: FN,
  eose: FN,
  closed: FN,
  notice: FN,
  any: FN,
  okMessagePrefixCheck: FN,
  closedMessagePrefixCheck: FN,
};

const CLIENT_MESSAGE: Surface = {
  event: FN,
  req: FN,
  close: FN,
  any: FN,
};

const METADATA_FIELDS: Surface = {
  name: FN,
  about: FN,
  picture: FN,
  displayName: FN,
  website: FN,
  banner: FN,
  bot: FN,
  birthday: FN,
  nip05: FN,
  lud16: FN,
  lud06: FN,
};

const NIP01: Surface = {
  pubkey: FN,
  eventId: FN,
  signature: FN,
  timestamp: FN,
  kind: FN,
  tags: FN,
  eventTemplate: FN,
  unsignedEvent: FN,
  event: FN,
  signatureCheck: FN,
  subscriptionId: FN,
  filter: FN,
  relayMessage: RELAY_MESSAGE,
  clientMessage: CLIENT_MESSAGE,
  metadata: FN,
  metadataContent: FN,
  metadataFields: METADATA_FIELDS,
};

const NIP19: Surface = {
  bech32: FN,
  npub: FN,
  nsec: FN,
  note: FN,
  nprofile: FN,
  nevent: FN,
  naddr: FN,
};

const EXPECTED_SURFACE: Surface = {
  jsonCodec: FN,

  // Canonical spec namespaces
  nip01: NIP01,
  nip19: NIP19,
  nip05: { identifier: FN, nostrJsonDocument: FN, formatIdentifier: FN },
  nip10: {
    textNote: FN,
    eTag: FN,
    qTag: FN,
    threadCheck: FN,
    participantsCheck: FN,
  },
  nip11: { relayInformationDocument: FN },
  nip42: {
    authEvent: FN,
    relayMessage: { auth: FN },
    clientMessage: { auth: FN },
    challengeTagCheck: FN,
    relayTagCheck: FN,
    createdAtCheck: FN,
  },
  nip45: {
    count: FN,
    clientMessage: { count: FN },
    relayMessage: { count: FN },
  },
  nip50: {
    filter: FN,
    clientMessage: { req: FN },
  },
  nip67: {
    relayMessage: { eose: FN },
  },

  // Ergonomic root aliases (direct references into nip01/nip19 above)
  pubkey: FN,
  eventId: FN,
  signature: FN,
  timestamp: FN,
  kind: FN,
  tags: FN,
  eventTemplate: FN,
  unsignedEvent: FN,
  event: FN,
  signatureCheck: FN,
  subscriptionId: FN,
  filter: FN,
  bech32: FN,
  npub: FN,
  nsec: FN,
  note: FN,
  nprofile: FN,
  nevent: FN,
  naddr: FN,
};

// Root alias -> canonical namespace it must be a direct reference into.
const NIP01_ALIASES = [
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
] as const;
const NIP19_ALIASES = [
  "bech32",
  "npub",
  "nsec",
  "note",
  "nprofile",
  "nevent",
  "naddr",
] as const;

type AnyRecord = Record<string, unknown>;

function assertSurface(node: unknown, expected: Surface, path: string): void {
  expect(typeof node, `${path} should be an object`).toBe("object");
  const record = node as AnyRecord;
  expect(Object.keys(record).sort(), `${path} keys`).toEqual(
    Object.keys(expected).sort(),
  );
  for (const [key, spec] of Object.entries(expected)) {
    const child = record[key];
    const childPath = `${path}.${key}`;
    if (spec === FN) {
      expect(typeof child, `${childPath} should be callable`).toBe("function");
    } else {
      assertSurface(child, spec, childPath);
    }
  }
}

describe.each([
  ["classic", classicZostr],
  ["mini", miniZostr],
])("%s zostr public API surface", (flavor, zostr) => {
  it("exposes exactly the expected canonical + alias surface", () => {
    assertSurface(zostr, EXPECTED_SURFACE, `${flavor} zostr`);
  });

  it("every root alias is a direct reference to its canonical factory", () => {
    const root = zostr as AnyRecord;
    const nip01 = root.nip01 as AnyRecord;
    const nip19 = root.nip19 as AnyRecord;
    for (const key of NIP01_ALIASES) {
      expect(root[key], `zostr.${key} === zostr.nip01.${key}`).toBe(nip01[key]);
    }
    for (const key of NIP19_ALIASES) {
      expect(root[key], `zostr.${key} === zostr.nip19.${key}`).toBe(nip19[key]);
    }
  });

  it("the kind:0 profile `nip05` field is a direct reference to nip05.identifier", () => {
    const root = zostr as AnyRecord;
    const metadataFields = (root.nip01 as AnyRecord)
      .metadataFields as AnyRecord;
    const nip05 = root.nip05 as AnyRecord;
    expect(metadataFields.nip05).toBe(nip05.identifier);
  });
});

it("classic and mini expose an identical key tree (dual-flavor parity)", () => {
  const collect = (node: AnyRecord, expected: Surface): string[] => {
    const lines: string[] = [];
    for (const [key, spec] of Object.entries(expected)) {
      lines.push(key);
      if (spec !== FN) {
        for (const line of collect(node[key] as AnyRecord, spec)) {
          lines.push(`${key}.${line}`);
        }
      }
    }
    return lines.sort();
  };
  expect(collect(classicZostr as AnyRecord, EXPECTED_SURFACE)).toEqual(
    collect(miniZostr as AnyRecord, EXPECTED_SURFACE),
  );
});
