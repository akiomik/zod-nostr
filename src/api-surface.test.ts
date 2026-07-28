import { describe, expect, it } from "vitest";
import { zostr as classicZostr } from "./classic.js";
import { zostr as miniZostr } from "./mini.js";

/**
 * Regression coverage for: zostr.nip05()/formatNip05Identifier() existed in
 * src/nip05.ts but were never wired into classic.ts/mini.ts's exported
 * `zostr` object. That kind of gap doesn't show up in tests that only
 * exercise individual functions someone remembered to test — it needs an
 * explicit inventory of the full public surface.
 */
const EXPECTED_TOP_LEVEL_KEYS = [
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
  "relayMessage",
  "clientMessage",
  "nip05",
  "bech32",
  "jsonCodec",
  "npub",
  "nsec",
  "note",
  "nprofile",
  "nevent",
  "naddr",
  "nip01",
  "nip11",
  "nip42",
  "nip45",
  "nip67",
].sort();

const EXPECTED_NIP01_KEYS = [
  "metadata",
  "metadataContent",
  "textNote",
  "metadataFields",
].sort();
const EXPECTED_METADATA_FIELDS_KEYS = [
  "name",
  "about",
  "picture",
  "displayName",
  "website",
  "banner",
  "bot",
  "birthday",
  "nip05",
  "lud16",
  "lud06",
].sort();
const EXPECTED_NIP05_KEYS = [
  "identifier",
  "nostrJsonDocument",
  "formatIdentifier",
].sort();
const EXPECTED_NIP11_KEYS = ["relayInformationDocument"].sort();
const EXPECTED_NIP42_KEYS = [
  "authEvent",
  "challengeMessage",
  "authMessage",
  "challengeTagCheck",
  "relayTagCheck",
  "createdAtCheck",
].sort();
const EXPECTED_NIP45_KEYS = ["count", "countRequest", "countResponse"].sort();
const EXPECTED_NIP67_KEYS = ["eose"].sort();
const EXPECTED_RELAY_MESSAGE_KEYS = [
  "event",
  "ok",
  "eose",
  "closed",
  "notice",
  "any",
  "okMessagePrefixCheck",
  "closedMessagePrefixCheck",
].sort();
const EXPECTED_CLIENT_MESSAGE_KEYS = ["event", "req", "close", "any"].sort();

// Keys inside a namespace that are themselves sub-namespace objects (not
// callable factories), so the "every key is callable" check skips only these.
const SUB_NAMESPACE_KEYS = new Set(["metadataFields"]);

const NESTED_NAMESPACES: [string, string[]][] = [
  ["nip01", EXPECTED_NIP01_KEYS],
  ["nip05", EXPECTED_NIP05_KEYS],
  ["nip11", EXPECTED_NIP11_KEYS],
  ["nip42", EXPECTED_NIP42_KEYS],
  ["nip45", EXPECTED_NIP45_KEYS],
  ["nip67", EXPECTED_NIP67_KEYS],
  ["relayMessage", EXPECTED_RELAY_MESSAGE_KEYS],
  ["clientMessage", EXPECTED_CLIENT_MESSAGE_KEYS],
];

function keysOf(obj: object): string[] {
  return Object.keys(obj).sort();
}

function namespaceOf(
  zostr: object,
  namespace: string,
): Record<string, unknown> {
  const record = zostr as unknown as Record<string, Record<string, unknown>>;
  const value = record[namespace];
  if (!value) throw new Error(`Missing namespace: ${namespace}`);
  return value;
}

describe.each([
  ["classic", classicZostr],
  ["mini", miniZostr],
])("%s zostr public API surface", (_flavor, zostr) => {
  it("exposes exactly the expected top-level keys", () => {
    expect(keysOf(zostr)).toEqual(EXPECTED_TOP_LEVEL_KEYS);
  });

  it.each(NESTED_NAMESPACES)(
    "exposes exactly the expected zostr.%s keys",
    (namespace, expectedKeys) => {
      expect(keysOf(namespaceOf(zostr, namespace))).toEqual(expectedKeys);
    },
  );

  it("every top-level key except namespaces is callable", () => {
    const namespaceKeys = new Set(NESTED_NAMESPACES.map(([key]) => key));
    for (const key of EXPECTED_TOP_LEVEL_KEYS) {
      if (namespaceKeys.has(key)) continue;
      expect(typeof (zostr as Record<string, unknown>)[key]).toBe("function");
    }
  });

  it.each(NESTED_NAMESPACES)(
    "every zostr.%s key is callable",
    (namespace, expectedKeys) => {
      const nested = namespaceOf(zostr, namespace);
      for (const key of expectedKeys) {
        // Only explicitly-known sub-namespaces (nip01.metadataFields) are
        // objects; every other key must stay callable. Don't blanket-skip all
        // objects, or a field accidentally becoming an object would pass.
        if (SUB_NAMESPACE_KEYS.has(key)) {
          expect(typeof nested[key]).toBe("object");
          continue;
        }
        expect(typeof nested[key]).toBe("function");
      }
    },
  );

  it("exposes exactly the expected zostr.nip01.metadataFields keys", () => {
    const fields = namespaceOf(zostr, "nip01").metadataFields as Record<
      string,
      unknown
    >;
    expect(keysOf(fields)).toEqual(EXPECTED_METADATA_FIELDS_KEYS);
    for (const key of EXPECTED_METADATA_FIELDS_KEYS) {
      expect(typeof fields[key]).toBe("function");
    }
  });
});

it("classic and mini expose identical key sets (dual-flavor parity)", () => {
  expect(keysOf(classicZostr)).toEqual(keysOf(miniZostr));
  for (const [namespace] of NESTED_NAMESPACES) {
    expect(keysOf(namespaceOf(classicZostr, namespace))).toEqual(
      keysOf(namespaceOf(miniZostr, namespace)),
    );
  }
  expect(
    keysOf(namespaceOf(classicZostr, "nip01").metadataFields as object),
  ).toEqual(keysOf(namespaceOf(miniZostr, "nip01").metadataFields as object));
});
