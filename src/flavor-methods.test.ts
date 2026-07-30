import { generateSecretKey, getPublicKey } from "nostr-tools/pure";
import { describe, expect, it } from "vitest";
import * as zm from "zod/mini";
import { zostr as classicZostr } from "./classic.js";
import { zostr as miniZostr } from "./mini.js";

/**
 * Flavor-specific instance-method surface. The re-wrapping in classic.ts/mini.ts
 * exists so the returned schemas carry the flavor's own instance methods (raw
 * core schemas lack even `.parse()`). This is the one place the two flavors
 * genuinely diverge, so it is NOT unified via describe.each(FLAVORS):
 *  - Both flavors expose instance `.check()` (on schemas) — asserted once per
 *    flavor via a shared table.
 *  - Only classic exposes instance `.decode()/.encode()` (on codecs) and
 *    `.optional()/.catch()/.safeParse()` (on field primitives); zod/mini never
 *    attaches these — the functional API (z.decode/z.optional/...) is used
 *    instead — so those assertions are classic-only.
 */

const FLAVORS = [
  { name: "classic", zostr: classicZostr },
  { name: "mini", zostr: miniZostr },
] as const;

type Schemaish = { check: unknown };
type Codecish = { decode: unknown; encode: unknown };

describe.each(FLAVORS)(
  "$name wrapped schemas expose native .check()",
  ({ zostr }) => {
    const wrapped: [string, () => Schemaish][] = [
      ["event", () => zostr.event()],
      ["unsignedEvent", () => zostr.unsignedEvent()],
      ["eventTemplate", () => zostr.eventTemplate()],
      ["nip10.textNote", () => zostr.nip10.textNote()],
      ["npub", () => zostr.npub()],
      ["nsec", () => zostr.nsec()],
      ["note", () => zostr.note()],
      ["nprofile", () => zostr.nprofile()],
      ["nevent", () => zostr.nevent()],
      ["naddr", () => zostr.naddr()],
      ["nip01.metadata", () => zostr.nip01.metadata()],
    ];

    it.each(wrapped)("%s().check is a function", (_name, factory) => {
      expect(typeof factory().check).toBe("function");
    });
  },
);

// Only classic attaches instance .decode()/.encode() on codecs; zod/mini exposes
// them solely as top-level z.decode()/z.encode(), so there's no mini equivalent.
describe("classic codecs expose instance .decode()/.encode()", () => {
  const codecs: [string, () => Codecish][] = [
    ["npub", () => classicZostr.npub()],
    ["nsec", () => classicZostr.nsec()],
    ["note", () => classicZostr.note()],
    ["nprofile", () => classicZostr.nprofile()],
    ["nevent", () => classicZostr.nevent()],
    ["naddr", () => classicZostr.naddr()],
    ["nip01.metadataContent", () => classicZostr.nip01.metadataContent()],
  ];

  it.each(codecs)("%s() has .decode()/.encode()", (_name, factory) => {
    const codec = factory();
    expect(typeof codec.decode).toBe("function");
    expect(typeof codec.encode).toBe("function");
  });

  // Existence isn't enough: a mis-bound or wrong-direction instance method would
  // still be a function. Exercise the instance .encode()/.decode() round-trip so
  // a broken binding can't ship (the top-level z.encode/z.decode round-trips in
  // nip19/metadata tests never touch these instance methods).
  it("the instance .encode()/.decode() actually round-trip", () => {
    const pk = getPublicKey(generateSecretKey());
    const npub = classicZostr.npub();
    expect(npub.decode(npub.encode(pk))).toBe(pk);

    const id = "a".repeat(64);
    const note = classicZostr.note();
    expect(note.decode(note.encode(id))).toBe(id);

    const content = classicZostr.nip01.metadataContent();
    expect(content.decode(content.encode({ name: "alice" }))).toEqual({
      name: "alice",
    });
    // instance .decode() runs validation, surfacing invalid JSON as a throw
    expect(() => content.decode("not json")).toThrow();
  });
});

// classic field primitives carry classic's instance methods (raw core schemas
// lack these, and even .parse()).
describe("classic field primitives expose instance .optional()/.catch()/.safeParse()", () => {
  const primitives: [
    string,
    () => { optional: unknown; safeParse: unknown },
  ][] = [
    ["pubkey", () => classicZostr.pubkey()],
    ["eventId", () => classicZostr.eventId()],
    ["signature", () => classicZostr.signature()],
    ["timestamp", () => classicZostr.timestamp()],
    ["kind", () => classicZostr.kind()],
    ["tags", () => classicZostr.tags()],
    ["nip05.identifier", () => classicZostr.nip05.identifier()],
    ["bech32", () => classicZostr.bech32("npub")],
  ];

  it.each(primitives)(
    "%s() has .optional() and .safeParse()",
    (_name, factory) => {
      const schema = factory();
      expect(typeof schema.optional).toBe("function");
      expect(typeof schema.safeParse).toBe("function");
    },
  );

  it("the instance methods behave (catch/optional/safeParse)", () => {
    expect(classicZostr.pubkey().catch("fallback").parse(123)).toBe("fallback");
    expect(classicZostr.pubkey().optional().parse(undefined)).toBeUndefined();
    expect(classicZostr.pubkey().safeParse(123).success).toBe(false);
  });
});

// mini field primitives carry mini's instance .check(); the rest of the policy
// is composed with mini's functional API (z.optional/z.catch/z.safeParse).
describe("mini field primitives expose instance .check() and compose with the functional API", () => {
  const primitives: [string, () => { check: unknown }][] = [
    ["pubkey", () => miniZostr.pubkey()],
    ["eventId", () => miniZostr.eventId()],
    ["signature", () => miniZostr.signature()],
    ["timestamp", () => miniZostr.timestamp()],
    ["kind", () => miniZostr.kind()],
    ["tags", () => miniZostr.tags()],
    ["nip05.identifier", () => miniZostr.nip05.identifier()],
    ["bech32", () => miniZostr.bech32("npub")],
  ];

  it.each(primitives)("%s().check is a function", (_name, factory) => {
    expect(typeof factory().check).toBe("function");
  });

  it("composes with mini's functional catch/optional/safeParse", () => {
    expect(zm.parse(zm.catch(miniZostr.pubkey(), "fallback"), 123)).toBe(
      "fallback",
    );
    expect(
      zm.parse(zm.optional(miniZostr.pubkey()), undefined),
    ).toBeUndefined();
    expect(zm.safeParse(miniZostr.pubkey(), 123).success).toBe(false);
  });
});
